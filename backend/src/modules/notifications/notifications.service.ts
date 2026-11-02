import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppException } from '../../common/errors/app.exception.js';
import type { Notification, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { isOnline } from '../../infra/ws/presence.js';
import { publishUserEvent } from '../../infra/ws/ws-events.js';
import { GuestMailService } from '../deals/guest-mail.service.js';
import { PlansService } from '../plans/plans.service.js';
import {
  ACTIVE_NOTIFICATION_TYPES,
  type ActiveNotificationType,
  EXCHANGE_NOTIFICATION_TYPES,
  type NotificationPayloads,
  ADMIN_NOTIFICATION_TYPES,
  PLAN_NOTIFICATION_TYPES,
  resolvePreferences,
} from './notification.types.js';
import type {
  NotificationDto,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationsQueryDto,
} from './notifications.dto.js';

const DEFAULT_PAGE = 30;
/** At most one chat email per conversation in this window, and only while the recipient is offline. */
const CHAT_EMAIL_GAP_SECONDS = 30 * 60;

/** Websocket events pushed to the recipient (frontend NotificationsStore). */
export const NOTIFICATION_WS_EVENT = {
  new: 'notification.new',
  unread: 'notification.unread',
} as const;

/**
 * A request changed for this user (payload `{ requestId, type }`): the requests badge and lists
 * refresh on it. Sent whatever the bell preferences say — with the in-app notification of requests
 * switched off they used to stand still until a reload.
 */
export const EXCHANGE_CHANGED_WS_EVENT = 'exchange.changed';

/**
 * Delivery: preferences decide the channels; an in-app row is pushed over the
 * websocket at once, an email goes through the mail queue. Called by the outbox relay, never directly
 * from request handlers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly plans: PlansService,
    private readonly guestMail: GuestMailService,
  ) {}

  async deliver<T extends ActiveNotificationType>(
    userId: string,
    type: T,
    payload: NotificationPayloads[T],
  ): Promise<Notification | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        locale: true,
        notificationPreferences: true,
      },
    });
    // A guest has no bell: a confirmed address hears of their deal by mail.
    if (user?.status === 'GUEST') {
      await this.guestMail.news(
        userId,
        type,
        payload as unknown as Record<string, unknown>,
      );
      return null;
    }
    if (!user || user.status !== 'ACTIVE') return null;
    const prefs = resolvePreferences(user.notificationPreferences)[type];
    if (EXCHANGE_NOTIFICATION_TYPES.includes(type))
      await this.publish(userId, EXCHANGE_CHANGED_WS_EVENT, {
        requestId: (payload as { requestId?: string }).requestId ?? null,
        type,
      });
    if (type === 'NEW_MESSAGE')
      return this.deliverMessage(
        userId,
        user,
        prefs,
        payload as NotificationPayloads['NEW_MESSAGE'],
      );
    let notification: Notification | null = null;
    if (prefs.inApp) {
      notification = await this.prisma.notification.create({
        data: {
          userId,
          type,
          payload: payload as unknown as Prisma.InputJsonObject,
        },
      });
      await this.publish(
        userId,
        NOTIFICATION_WS_EVENT.new,
        toDto(notification),
      );
      await this.publishUnread(userId);
    }
    if (prefs.email && user.email && user.emailVerifiedAt) {
      await this.queues.enqueueMail({
        userId,
        username: user.username,
        to: user.email,
        locale: user.locale,
        type,
        payload: payload as unknown as Record<string, unknown>,
        notificationId: notification?.id ?? null,
      });
    }
    return notification;
  }

  /**
   * Chat messages: the bell keeps one unread item per conversation whose counter
   * grows (the old row is replaced so it moves to the top); an email goes out only when the
   * recipient has no live connection, at most once per conversation per CHAT_EMAIL_GAP_SECONDS.
   */
  private async deliverMessage(
    userId: string,
    user: {
      username: string;
      email: string | null;
      emailVerifiedAt: Date | null;
      locale: string;
    },
    prefs: { inApp: boolean; email: boolean },
    payload: NotificationPayloads['NEW_MESSAGE'],
  ): Promise<Notification | null> {
    // Read already: the conversation was open when the message came (the reader's app marks it read
    // on the live event, often before this worker job runs). No bell item, no email.
    if (
      payload.messageId &&
      (await this.alreadyRead(
        userId,
        payload.conversationId,
        payload.messageId,
      ))
    )
      return null;
    let notification: Notification | null = null;
    let data: NotificationPayloads['NEW_MESSAGE'] = payload;
    if (prefs.inApp) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: 'NEW_MESSAGE',
          readAt: null,
          payload: { path: ['conversationId'], equals: payload.conversationId },
        },
        orderBy: { id: 'desc' },
      });
      const before = (existing?.payload ?? {}) as Partial<
        NotificationPayloads['NEW_MESSAGE']
      >;
      data = { ...payload, count: (before.count ?? 0) + 1 };
      notification = await this.prisma.$transaction(async (tx) => {
        if (existing)
          await tx.notification.delete({ where: { id: existing.id } });
        return tx.notification.create({
          data: {
            userId,
            type: 'NEW_MESSAGE',
            payload: data as unknown as Prisma.InputJsonObject,
            emailedAt: existing?.emailedAt ?? null,
          },
        });
      });
      await this.publish(
        userId,
        NOTIFICATION_WS_EVENT.new,
        Object.assign(toDto(notification), { replaces: existing?.id ?? null }),
      );
      await this.publishUnread(userId);
    }
    if (
      prefs.email &&
      user.email &&
      user.emailVerifiedAt &&
      !(await isOnline(this.redis, userId)) &&
      (await this.redis.set(
        `vs:chat-mail:${userId}:${payload.conversationId}`,
        '1',
        'EX',
        CHAT_EMAIL_GAP_SECONDS,
        'NX',
      )) === 'OK'
    ) {
      await this.queues.enqueueMail({
        userId,
        username: user.username,
        to: user.email,
        locale: user.locale,
        type: 'NEW_MESSAGE',
        payload: data as unknown as Record<string, unknown>,
        notificationId: notification?.id ?? null,
      });
    }
    return notification;
  }

  /** Message ids are uuid v7: comparing them compares creation time. */
  private async alreadyRead(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<boolean> {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { lastReadMessageId: true },
    });
    return !!p?.lastReadMessageId && p.lastReadMessageId >= messageId;
  }

  /** The user's unread notifications about one request (any type), read now. */
  async markRequestRead(userId: string, requestId: string): Promise<void> {
    // `payload->>'requestId'` written out, so the partial index on it applies: Prisma sends the
    // JSON path as a parameter and every unread row was read.
    const count = await this.prisma.$executeRaw`
      UPDATE "Notification" SET "readAt" = now()
      WHERE "userId" = ${userId}::uuid AND "readAt" IS NULL
        AND payload->>'requestId' = ${requestId}`;
    if (count) await this.publishUnread(userId);
  }

  /** Opening a support ticket clears its bell items: answers for the author, news for an admin. */
  async markTicketRead(userId: string, ticketId: string): Promise<void> {
    const r = await this.prisma.notification.updateMany({
      where: {
        userId,
        type: { in: ['SUPPORT_REPLY', 'SUPPORT_TICKET'] },
        readAt: null,
        payload: { path: ['ticketId'], equals: ticketId },
      },
      data: { readAt: new Date() },
    });
    if (r.count) await this.publishUnread(userId);
  }

  /** Reading a conversation also clears its bell item. */
  async markConversationRead(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const r = await this.prisma.notification.updateMany({
      where: {
        userId,
        type: 'NEW_MESSAGE',
        readAt: null,
        payload: { path: ['conversationId'], equals: conversationId },
      },
      data: { readAt: new Date() },
    });
    if (r.count) await this.publishUnread(userId);
  }

  async list(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<NotificationListDto> {
    const limit = query.limit ?? DEFAULT_PAGE;
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.unreadCount(userId),
    ]);
    const items = rows.slice(0, limit).map(toDto);
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
      unreadCount,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { readAt: true },
    });
    if (!existing)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'notFound',
        'errors.notFound',
      );
    if (existing.readAt) return;
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    await this.publishUnread(userId);
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (r.count) await this.publishUnread(userId);
    return r.count;
  }

  /**
   * The matrix shown in settings: only types that something produces here and for this person
   * (nothing about Pro on a self-hosted instance; support tickets only for admins).
   */
  async getPreferences(
    userId: string,
    admin: boolean,
  ): Promise<NotificationPreferenceDto[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const prefs = resolvePreferences(rows);
    return ACTIVE_NOTIFICATION_TYPES.filter(
      (type) =>
        (this.plans.hasTiers || !PLAN_NOTIFICATION_TYPES.includes(type)) &&
        (admin || !ADMIN_NOTIFICATION_TYPES.includes(type)),
    ).map((type) => ({ type, ...prefs[type] }));
  }

  async updatePreferences(
    userId: string,
    items: NotificationPreferenceDto[],
    admin: boolean,
  ): Promise<NotificationPreferenceDto[]> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type: item.type } },
          create: {
            userId,
            type: item.type,
            inApp: item.inApp,
            email: item.email,
          },
          update: { inApp: item.inApp, email: item.email },
        }),
      ),
    );
    return this.getPreferences(userId, admin);
  }

  /** Stamp after the worker sent the email (best effort). */
  async markEmailed(notificationId: string): Promise<void> {
    await this.prisma.notification
      .update({
        where: { id: notificationId },
        data: { emailedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private async publishUnread(userId: string): Promise<void> {
    await this.publish(userId, NOTIFICATION_WS_EVENT.unread, {
      count: await this.unreadCount(userId),
    });
  }

  private async publish(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    try {
      await publishUserEvent(this.redis, { userId, event, payload });
    } catch (err) {
      this.logger.warn(`Websocket publish failed: ${(err as Error).message}`);
    }
  }
}

export function toDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

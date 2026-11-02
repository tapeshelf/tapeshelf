import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppException } from '../../common/errors/app.exception.js';
import { Prisma, type Message } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { publishUserEvent } from '../../infra/ws/ws-events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  type SendBlocker,
  orderedPair,
  previewOf,
  sendBlocker,
} from '../social/social-rules.js';
import { UsersService } from '../users/users.service.js';
import type {
  ChatUserDto,
  ChatVideoDto,
  ConversationDto,
  ConversationListDto,
  MessageDto,
  MessagePageDto,
  MessagesQueryDto,
  SendMessageDto,
  ThreadDto,
} from './chat.dto.js';

/** Websocket events of the chat (frontend ChatStore). */
export const CHAT_WS_EVENT = {
  message: 'message.new',
  read: 'conversation.read',
  unread: 'chat.unread',
} as const;

const DEFAULT_PAGE = 50;
const LIST_LIMIT = 100;

interface Person {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  status: string;
  pageHidden: boolean;
}

const PERSON_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
  status: true,
  pageHidden: true,
} as const;

interface ConversationRow {
  id: string;
  otherId: string;
  otherLastRead: string | null;
  unread: number;
  lastMessageId: string | null;
}

/**
 * One-to-one chat between friends. Messages are stored and the
 * recipient's notification goes through the outbox in the same transaction; the live websocket push
 * happens after commit (best effort: a missed push is caught up by the next fetch).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly anonymous: AnonymousLinksService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async conversations(userId: string): Promise<ConversationListDto> {
    const [items, unreadTotal] = await Promise.all([
      this.conversationDtos(userId),
      this.unreadCount(userId),
    ]);
    return { items, unreadTotal };
  }

  async unreadCount(userId: string): Promise<number> {
    // Per conversation, from its last read message on (the index on conversationId, id): a join
    // of every message with the participants scanned the whole table.
    const [row] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COALESCE(sum(x.n), 0)::int AS count
      FROM "ConversationParticipant" p
      CROSS JOIN LATERAL (
        SELECT count(*) AS n FROM "Message" m
        WHERE m."conversationId" = p."conversationId"
          AND m.id > COALESCE(p."lastReadMessageId", '00000000-0000-0000-0000-000000000000'::uuid)
          AND m."senderId" <> p."userId"
      ) x
      WHERE p."userId" = ${userId}::uuid`;
    return row?.count ?? 0;
  }

  async thread(userId: string, username: string): Promise<ThreadDto> {
    const other = await this.person(userId, username);
    const [a, b] = orderedPair(userId, other.id);
    const conv = await this.prisma.conversation.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      select: { id: true },
    });
    // Nobody to talk to: an inactive account without shared history looks like a missing one.
    if (!conv && other.status !== 'ACTIVE') throw notFoundUser();
    const [conversation] = conv
      ? await this.conversationDtos(userId, conv.id)
      : [];
    return {
      other: this.chatUser(other),
      conversation: conversation ?? null,
      sendBlocker: await this.blockerFor(userId, other),
    };
  }

  async messages(
    userId: string,
    conversationId: string,
    query: MessagesQueryDto,
  ): Promise<MessagePageDto> {
    await this.membership(userId, conversationId);
    const limit = query.limit ?? DEFAULT_PAGE;
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit).reverse();
    return {
      items: await this.messageDtos(page),
      hasMore: rows.length > limit,
    };
  }

  async send(
    userId: string,
    username: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const other = await this.person(userId, username);
    const blocker = await this.blockerFor(userId, other);
    if (blocker)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        blocker === 'notFriends' ? 'notFriends' : 'userUnavailable',
        `errors.chat.${blocker}`,
      );
    const body = (dto.body ?? '').trim();
    const videoId = dto.videoId ?? null;
    if (!body && !videoId)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'emptyMessage',
        'errors.chat.emptyMessage',
      );
    if (videoId && !(await this.attachable(userId, videoId)))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'videoNotAttachable',
        'errors.chat.videoNotAttachable',
      );
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, displayName: true },
    });
    const [a, b] = orderedPair(userId, other.id);
    const message = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        create: { userAId: a, userBId: b },
        update: {},
        select: { id: true },
      });
      await tx.conversationParticipant.createMany({
        data: [
          { conversationId: conv.id, userId },
          { conversationId: conv.id, userId: other.id },
        ],
        skipDuplicates: true,
      });
      const m = await tx.message.create({
        data: { conversationId: conv.id, senderId: userId, body, videoId },
      });
      await tx.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: m.createdAt },
      });
      // Writing implies having read everything before.
      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: conv.id, userId } },
        data: { lastReadMessageId: m.id },
      });
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          {
            userId: other.id,
            type: 'NEW_MESSAGE',
            payload: {
              conversationId: conv.id,
              messageId: m.id,
              fromUserId: userId,
              fromName: me.displayName,
              fromUsername: me.username,
              preview: previewOf(body),
              hasVideo: videoId !== null,
              count: 1,
            },
          },
        ],
      });
      return m;
    });
    await this.outbox.nudge();
    const [out] = await this.messageDtos([message]);
    const event = { conversationId: message.conversationId, message: out };
    await this.push(userId, CHAT_WS_EVENT.message, event);
    await this.push(other.id, CHAT_WS_EVENT.message, event);
    await this.push(other.id, CHAT_WS_EVENT.unread, {
      count: await this.unreadCount(other.id),
    });
    return out!;
  }

  /** Moves the reader's mark forward (never back); the other side sees its messages as read. */
  async markRead(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const otherId = await this.membership(userId, conversationId);
    const exists = await this.prisma.message.count({
      where: { id: messageId, conversationId },
    });
    if (!exists)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'notFound',
        'errors.notFound',
      );
    const moved = await this.prisma.$executeRaw`
      UPDATE "ConversationParticipant"
      SET "lastReadMessageId" = ${messageId}::uuid
      WHERE "conversationId" = ${conversationId}::uuid AND "userId" = ${userId}::uuid
        AND ("lastReadMessageId" IS NULL OR "lastReadMessageId" < ${messageId}::uuid)`;
    if (moved) {
      const event = { conversationId, userId, lastReadMessageId: messageId };
      await this.push(otherId, CHAT_WS_EVENT.read, event);
      await this.push(userId, CHAT_WS_EVENT.read, event);
      await this.push(userId, CHAT_WS_EVENT.unread, {
        count: await this.unreadCount(userId),
      });
    }
    await this.notifications.markConversationRead(userId, conversationId);
  }

  // --- helpers ---------------------------------------------------------------

  /** Conversations of a user, newest first (or one of them), with last message, unread and send state. */
  private async conversationDtos(
    userId: string,
    onlyId?: string,
  ): Promise<ConversationDto[]> {
    const filter = onlyId
      ? Prisma.sql`AND c.id = ${onlyId}::uuid`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<ConversationRow[]>`
      SELECT c.id,
        CASE WHEN c."userAId" = ${userId}::uuid THEN c."userBId" ELSE c."userAId" END AS "otherId",
        op."lastReadMessageId" AS "otherLastRead",
        (SELECT count(*)::int FROM "Message" m
          WHERE m."conversationId" = c.id AND m."senderId" <> ${userId}::uuid
            AND (p."lastReadMessageId" IS NULL OR m.id > p."lastReadMessageId")) AS unread,
        (SELECT m.id FROM "Message" m WHERE m."conversationId" = c.id
          ORDER BY m.id DESC LIMIT 1) AS "lastMessageId"
      FROM "Conversation" c
      JOIN "ConversationParticipant" p ON p."conversationId" = c.id AND p."userId" = ${userId}::uuid
      LEFT JOIN "ConversationParticipant" op ON op."conversationId" = c.id AND op."userId" <> ${userId}::uuid
      WHERE (c."userAId" = ${userId}::uuid OR c."userBId" = ${userId}::uuid) ${filter}
      ORDER BY c."lastMessageAt" DESC NULLS LAST, c.id DESC
      LIMIT ${LIST_LIMIT}`;
    if (rows.length === 0) return [];
    const otherIds = rows.map((r) => r.otherId);
    const lastIds = rows
      .map((r) => r.lastMessageId)
      .filter((id): id is string => !!id);
    const [people, lastMessages, blockers] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: otherIds } },
        select: PERSON_SELECT,
      }),
      this.prisma.message.findMany({ where: { id: { in: lastIds } } }),
      this.blockersFor(userId, otherIds),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const messageDtos = new Map(
      (await this.messageDtos(lastMessages)).map((m) => [m.id, m]),
    );
    return rows.flatMap((r) => {
      const other = byId.get(r.otherId);
      if (!other) return [];
      return [
        {
          id: r.id,
          other: this.chatUser(other),
          lastMessage: r.lastMessageId
            ? (messageDtos.get(r.lastMessageId) ?? null)
            : null,
          unread: r.unread,
          otherLastReadMessageId: r.otherLastRead,
          sendBlocker: blockers.get(r.otherId) ?? null,
        },
      ];
    });
  }

  /** Message rows → DTOs, resolving each attached video against what the sender may still show. */
  private async messageDtos(messages: Message[]): Promise<MessageDto[]> {
    const pairs = messages
      .filter((m) => m.videoId)
      .map((m) => ({ videoId: m.videoId!, holderId: m.senderId }));
    const holdings = pairs.length
      ? await this.prisma.videoAccess.findMany({
          where: { OR: pairs },
          select: {
            videoId: true,
            holderId: true,
            hidden: true,
            source: true,
            anonymousLinkId: true,
            holder: { select: { username: true, status: true } },
            video: {
              select: {
                code: true,
                title: true,
                thumbnailKey: true,
                thumbnailSmallKey: true,
                sensitive: true,
                durationSec: true,
                visibility: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        })
      : [];
    const cards = new Map<string, ChatVideoDto>();
    // A copy whose author goes by an anonymous link opens by the code seen through it.
    const masker = this.anonymous.masker(null);
    for (const h of holdings) {
      const v = h.video;
      const shown =
        !h.hidden &&
        !v.deletedAt &&
        v.status === 'READY' &&
        h.holder.status === 'ACTIVE' &&
        (h.source !== 'PUBLIC_ADD' || v.visibility === 'PUBLIC');
      if (!shown) continue;
      cards.set(
        `${h.videoId}:${h.holderId}`,
        masker.code(
          {
            id: h.videoId,
            code: v.code,
            title: v.title,
            thumbnailUrl: v.thumbnailKey
              ? this.storage.publicUrl(v.thumbnailSmallKey ?? v.thumbnailKey)
              : null,
            sensitive: v.sensitive,
            durationSec: v.durationSec,
            visibility: v.visibility,
            holderUsername: h.holder.username,
          },
          h.anonymousLinkId,
        ),
      );
    }
    await masker.apply();
    return messages.map((m) => {
      const video = m.videoId
        ? (cards.get(`${m.videoId}:${m.senderId}`) ?? null)
        : null;
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        body: m.body,
        video,
        videoUnavailable: m.videoId !== null && video === null,
        createdAt: m.createdAt.toISOString(),
      };
    });
  }

  /**
   * A video can be attached when the sender holds it and a visitor of the sender's page could see it:
   * not hidden, READY, not deleted, and not a bookmark of a video that is private now.
   */
  private async attachable(
    senderId: string,
    videoId: string,
  ): Promise<boolean> {
    const h = await this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId, holderId: senderId } },
      select: {
        hidden: true,
        source: true,
        video: { select: { status: true, deletedAt: true, visibility: true } },
      },
    });
    return (
      !!h &&
      !h.hidden &&
      !h.video.deletedAt &&
      h.video.status === 'READY' &&
      (h.source !== 'PUBLIC_ADD' || h.video.visibility === 'PUBLIC')
    );
  }

  private async blockerFor(
    userId: string,
    other: Person,
  ): Promise<SendBlocker | null> {
    return (
      (await this.blockersFor(userId, [other.id], [other])).get(other.id) ??
      null
    );
  }

  /** Send state for many partners at once (follows both ways, blocks either way, account status). */
  private async blockersFor(
    userId: string,
    otherIds: string[],
    known?: Person[],
  ): Promise<Map<string, SendBlocker | null>> {
    const [people, follows, blocks] = await Promise.all([
      known ??
        this.prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: PERSON_SELECT,
        }),
      this.prisma.follow.findMany({
        where: {
          OR: [
            { followerId: userId, followeeId: { in: otherIds } },
            { followerId: { in: otherIds }, followeeId: userId },
          ],
        },
        select: { followerId: true, followeeId: true },
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: userId, blockedId: { in: otherIds } },
            { blockerId: { in: otherIds }, blockedId: userId },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const status = new Map(people.map((p) => [p.id, p.status]));
    const out = new Map<string, SendBlocker | null>();
    for (const id of otherIds) {
      const iFollow = follows.some(
        (f) => f.followerId === userId && f.followeeId === id,
      );
      const theyFollow = follows.some(
        (f) => f.followerId === id && f.followeeId === userId,
      );
      const blocked = blocks.some(
        (b) => b.blockerId === id || b.blockedId === id,
      );
      out.set(
        id,
        sendBlocker({
          otherActive: status.get(id) === 'ACTIVE',
          mutual: iFollow && theyFollow,
          blockedEither: blocked,
        }),
      );
    }
    return out;
  }

  /** The other participant (by current or former username); never oneself. */
  private async person(userId: string, username: string): Promise<Person> {
    const resolved = await this.users.resolveByUsername(username);
    if (!resolved) throw notFoundUser();
    if (resolved.id === userId)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'selfMessage',
        'errors.chat.selfMessage',
      );
    return this.prisma.user.findUniqueOrThrow({
      where: { id: resolved.id },
      select: PERSON_SELECT,
    });
  }

  /** The caller takes part in the conversation; returns the other participant's id. */
  private async membership(
    userId: string,
    conversationId: string,
  ): Promise<string> {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId } },
      },
      select: { userAId: true, userBId: true },
    });
    if (!conv)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'conversationNotFound',
        'errors.chat.notFound',
      );
    return conv.userAId === userId ? conv.userBId : conv.userAId;
  }

  private chatUser(p: Person): ChatUserDto {
    const deleted = p.status === 'DELETED';
    return {
      id: p.id,
      username: p.username,
      displayName: deleted ? '' : p.displayName,
      avatarUrl: deleted ? null : this.users.mediaUrl(p.avatarKey),
      deleted,
      pageHidden: p.pageHidden,
    };
  }

  private async push(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    try {
      await publishUserEvent(this.redis, { userId, event, payload });
    } catch (err) {
      this.logger.warn(
        `Websocket push ${event} failed: ${(err as Error).message}`,
      );
    }
  }
}

function notFoundUser(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    'userNotFound',
    'errors.users.notFound',
  );
}

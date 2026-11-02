import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { APP_VERSION } from '../../common/version.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  SupportMessageKind,
  SupportTopic,
} from '../../generated/prisma/enums.js';
import type { Delivery } from '../../infra/outbox/outbox.types.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { publishUserEvent } from '../../infra/ws/ws-events.js';
import { USER_REF_SELECT, userRef } from '../admin/admin-mappers.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { previewOf } from '../social/social-rules.js';
import {
  type ProcessedPicture,
  type UploadedPicture,
  processPictures,
  supportKey,
} from './support-images.js';
import {
  OPEN_STATUSES,
  OVER_STATUSES,
  afterAuthorMessage,
  afterSupportAnswer,
  canRate,
  cleanContext,
  closeBefore,
  decodeCursor,
  encodeCursor,
  isOver,
  ticketNumber,
} from './support-rules.js';
import {
  SUPPORT_OPEN_MAX,
  type AdminSupportListDto,
  type AdminSupportQueryDto,
  type AdminSupportReplyDto,
  type AdminSupportTicketDto,
  type AdminSupportUpdateDto,
  type CreateSupportTicketDto,
  type SupportListQueryDto,
  type SupportMessageDto,
  type SupportReplyDto,
  type SupportTicketDto,
  type SupportTicketListDto,
  type SupportVideoDto,
} from './support.dto.js';

/** Websocket events of support (frontend SupportStore and the admin's counters). */
export const SUPPORT_WS_EVENT = {
  /** To the author: `{ unread }` after support wrote or the author read. */
  changed: 'support.changed',
  /** To admins: `{ open }`, tickets waiting for support. */
  queue: 'support.queue',
} as const;

/** Presigned picture links: a ticket left open longer just reloads them. */
const PICTURE_TTL_SEC = 60 * 60;
const PAGE = 20;

const TICKET_INCLUDE = {
  video: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      deletedAt: true,
      thumbnailKey: true,
      thumbnailSmallKey: true,
    },
  },
  messages: {
    orderBy: { id: 'asc' },
    include: {
      attachments: { orderBy: { id: 'asc' } },
      author: { select: USER_REF_SELECT },
    },
  },
} satisfies Prisma.SupportTicketInclude;

type TicketRow = Prisma.SupportTicketGetPayload<{
  include: typeof TICKET_INCLUDE;
}>;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'supportNotFound',
    'errors.support.notFound',
  );
const empty = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'supportEmpty',
    'errors.support.empty',
  );
const closed = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'supportClosed',
    'errors.support.closed',
  );

/**
 * Support tickets: users ask, admins answer as "Support",
 * note between themselves and set priorities; a ticket waiting for its author closes after 7 days.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ------------------------------------------------------------------ the author

  async list(
    userId: string,
    query: SupportListQueryDto,
  ): Promise<SupportTicketListDto> {
    const limit = query.limit ?? PAGE;
    const after = decodeCursor(query.cursor);
    const rows = await this.prisma.supportTicket.findMany({
      where: {
        userId,
        ...(after
          ? {
              OR: [
                { activityAt: { lt: after.at } },
                { activityAt: after.at, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ activityAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((t) => ({
        id: t.id,
        number: t.number,
        topic: t.topic,
        subject: t.subject,
        status: t.status,
        unread: t.unread,
        activityAt: t.activityAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor(last.activityAt, last.id)
          : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.supportTicket.count({ where: { userId, unread: true } });
  }

  /** The author opens the ticket: what support wrote is read now. */
  async get(userId: string, id: string): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
      include: TICKET_INCLUDE,
    });
    if (!ticket) throw notFound();
    await this.notifications.markTicketRead(userId, id);
    if (ticket.unread) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { unread: false },
      });
      ticket.unread = false;
      await this.pushUnread(userId);
    }
    return this.toDto(ticket, false);
  }

  async create(
    user: RequestUser,
    dto: CreateSupportTicketDto,
    files: UploadedPicture[],
  ): Promise<SupportTicketDto> {
    await this.belowOpenMax(this.prisma, user.id);
    if (dto.videoId) await this.ownVideo(user.id, dto.videoId);
    const pictures = await this.store(user.id, await processPictures(files));
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        // Counted again under the author's lock: two tickets sent at once are not both the fifth.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('support-open'), hashtext(${user.id}))`;
        await this.belowOpenMax(tx, user.id);
        const ticket = await tx.supportTicket.create({
          data: {
            userId: user.id,
            topic: dto.topic,
            subject: dto.subject,
            videoId: dto.videoId ?? null,
            // A bug report always carries what the browser said and the API's own version.
            context:
              dto.topic === 'BUG'
                ? { ...cleanContext(dto.context), version: APP_VERSION }
                : Prisma.DbNull,
          },
        });
        await this.addMessage(
          tx,
          ticket.id,
          user.id,
          'USER',
          dto.body,
          pictures,
        );
        await this.tellAdmins(tx, user.id, {
          ticketId: ticket.id,
          number: ticket.number,
          subject: ticket.subject,
          topic: ticket.topic,
          created: true,
          preview: previewOf(dto.body),
        });
        return ticket.id;
      });
      await this.afterAdminsTold();
      return this.get(user.id, id);
    } catch (err) {
      await this.forgetPictures(pictures);
      throw err;
    }
  }

  /** The author writes again: the ticket waits for support. Not once it is over. */
  async reply(
    user: RequestUser,
    id: string,
    dto: SupportReplyDto,
    files: UploadedPicture[],
  ): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId: user.id },
    });
    if (!ticket) throw notFound();
    const body = dto.body ?? '';
    if (!body && !files.length) throw empty();
    const next = afterAuthorMessage(ticket.status);
    if (!next) throw closed();
    const pictures = await this.store(user.id, await processPictures(files));
    try {
      await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        // Solved or closed meanwhile: checked where it is written, not only before.
        const written = await tx.supportTicket.updateMany({
          where: { id, status: { notIn: OVER_STATUSES } },
          data: {
            status: next,
            ...(ticket.status !== next ? { statusAt: now } : {}),
            activityAt: now,
          },
        });
        if (!written.count) throw closed();
        await this.addMessage(tx, id, user.id, 'USER', body, pictures);
        await this.tellAdmins(tx, user.id, {
          ticketId: id,
          number: ticket.number,
          subject: ticket.subject,
          topic: ticket.topic,
          created: false,
          preview: previewOf(body),
        });
      });
      await this.afterAdminsTold();
    } catch (err) {
      await this.forgetPictures(pictures);
      throw err;
    }
    return this.get(user.id, id);
  }

  /** "My question is solved". */
  async resolve(userId: string, id: string): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
    });
    if (!ticket) throw notFound();
    await this.prisma.supportTicket.updateMany({
      where: { id, status: { in: ['OPEN', 'WAITING'] } },
      data: { status: 'RESOLVED', statusAt: new Date() },
    });
    await this.pushQueue();
    return this.get(userId, id);
  }

  async rate(
    userId: string,
    id: string,
    helped: boolean,
  ): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
    });
    if (!ticket) throw notFound();
    if (!canRate(ticket.status))
      throw new AppException(
        HttpStatus.CONFLICT,
        'supportNotRated',
        'errors.support.notRated',
      );
    await this.prisma.supportTicket.update({ where: { id }, data: { helped } });
    return this.get(userId, id);
  }

  /** The author's own uploads to pick one for a ticket: newest first, by title. */
  async videos(
    userId: string,
    q: string | undefined,
  ): Promise<SupportVideoDto[]> {
    const rows = await this.prisma.video.findMany({
      where: {
        authorId: userId,
        deletedAt: null,
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 50,
      select: TICKET_INCLUDE.video.select,
    });
    return rows.map((v) => this.videoDto(v));
  }

  // ------------------------------------------------------------------ admins

  async adminList(query: AdminSupportQueryDto): Promise<AdminSupportListDto> {
    const q = query.q?.trim();
    const number = q ? ticketNumber(q) : null;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.topic ? { topic: query.topic } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(q
        ? {
            OR: [
              ...(number !== null ? [{ number }] : []),
              { subject: { contains: q, mode: 'insensitive' } },
              { user: { username: { contains: q, mode: 'insensitive' } } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        // What waits for support first (the enum's order), the urgent first, the latest first.
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { activityAt: 'desc' },
          { id: 'desc' },
        ],
        skip: query.offset ?? 0,
        take: query.limit ?? 30,
        include: {
          user: { select: USER_REF_SELECT },
          _count: {
            select: { messages: { where: { kind: { not: 'NOTE' } } } },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return {
      items: rows.map((t) => ({
        id: t.id,
        number: t.number,
        topic: t.topic,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        helped: t.helped,
        user: userRef(t.user),
        messages: t._count.messages,
        statusAt: t.statusAt.toISOString(),
        activityAt: t.activityAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      total,
    };
  }

  async adminGet(id: string, adminId: string): Promise<AdminSupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        ...TICKET_INCLUDE,
        user: { select: { ...USER_REF_SELECT, email: true } },
      },
    });
    if (!ticket) throw notFound();
    await this.notifications.markTicketRead(adminId, id);
    return Object.assign(await this.toDto(ticket, true), {
      priority: ticket.priority,
      user: userRef(ticket.user),
      userEmail: ticket.user.email,
      statusAt: ticket.statusAt.toISOString(),
    });
  }

  /** An answer signed "Support" (the author is told), or a note only admins see. */
  async adminReply(
    admin: RequestUser,
    id: string,
    dto: AdminSupportReplyDto,
    files: UploadedPicture[],
  ): Promise<AdminSupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) throw notFound();
    const body = dto.body ?? '';
    if (!body && !files.length) throw empty();
    const note = dto.note === true;
    const pictures = await this.store(
      ticket.userId,
      await processPictures(files),
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        if (!note) {
          const status = afterSupportAnswer(dto.resolve === true);
          await tx.supportTicket.update({
            where: { id },
            data: {
              status,
              ...(status !== ticket.status ? { statusAt: now } : {}),
              // An answer in a solved or closed ticket opens it again, as the status does by
              // hand: the author's rating was of the end before.
              ...(isOver(ticket.status) ? { helped: null } : {}),
              activityAt: now,
              unread: true,
            },
          });
          await this.outbox.emit(tx, 'notify', {
            deliveries: [
              {
                userId: ticket.userId,
                type: 'SUPPORT_REPLY',
                payload: {
                  ticketId: id,
                  number: ticket.number,
                  subject: ticket.subject,
                  resolved: status === 'RESOLVED',
                  preview: previewOf(body),
                },
              },
            ],
          });
        }
        await this.addMessage(
          tx,
          id,
          admin.id,
          note ? 'NOTE' : 'SUPPORT',
          body,
          pictures,
        );
        await this.audit.log(
          {
            actorId: admin.id,
            action: note ? 'support.note' : 'support.reply',
            targetType: 'ticket',
            targetId: id,
            meta: {
              number: ticket.number,
              pictures: pictures.length,
              ...(!note && dto.resolve ? { resolve: true } : {}),
            },
          },
          tx,
        );
      });
    } catch (err) {
      await this.forgetPictures(pictures);
      throw err;
    }
    if (!note) {
      await this.outbox.nudge();
      await this.pushUnread(ticket.userId);
      await this.pushQueue();
    }
    return this.adminGet(id, admin.id);
  }

  /** Status by hand (solved tells the author; closed and reopened do not) and priority. */
  async adminUpdate(
    admin: RequestUser,
    id: string,
    dto: AdminSupportUpdateDto,
  ): Promise<AdminSupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) throw notFound();
    const status =
      dto.status && dto.status !== ticket.status ? dto.status : null;
    const priority =
      dto.priority && dto.priority !== ticket.priority ? dto.priority : null;
    if (!status && !priority) return this.adminGet(id, admin.id);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.supportTicket.update({
        where: { id },
        data: {
          ...(status
            ? {
                status,
                statusAt: now,
                ...(status === 'RESOLVED' ? { unread: true } : {}),
                ...(status === 'OPEN' || status === 'WAITING'
                  ? { helped: null }
                  : {}),
              }
            : {}),
          ...(priority ? { priority } : {}),
        },
      });
      if (status === 'RESOLVED')
        await this.outbox.emit(tx, 'notify', {
          deliveries: [
            {
              userId: ticket.userId,
              type: 'SUPPORT_REPLY',
              payload: {
                ticketId: id,
                number: ticket.number,
                subject: ticket.subject,
                resolved: true,
                preview: '',
              },
            },
          ],
        });
      if (status)
        await this.audit.log(
          {
            actorId: admin.id,
            action: 'support.status',
            targetType: 'ticket',
            targetId: id,
            meta: { number: ticket.number, from: ticket.status, to: status },
          },
          tx,
        );
      if (priority)
        await this.audit.log(
          {
            actorId: admin.id,
            action: 'support.priority',
            targetType: 'ticket',
            targetId: id,
            meta: {
              number: ticket.number,
              from: ticket.priority,
              to: priority,
            },
          },
          tx,
        );
    });
    if (status === 'RESOLVED') {
      await this.outbox.nudge();
      await this.pushUnread(ticket.userId);
    }
    if (status) await this.pushQueue();
    return this.adminGet(id, admin.id);
  }

  /** Tickets waiting for support: the admin's counter. */
  openCount(): Promise<number> {
    return this.prisma.supportTicket.count({ where: { status: 'OPEN' } });
  }

  // ------------------------------------------------------------------ the worker

  /** Hourly: WAITING or RESOLVED for 7 days with no word from the author closes. */
  async closeIdle(now = new Date()): Promise<number> {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: {
        status: { in: ['WAITING', 'RESOLVED'] },
        statusAt: { lt: closeBefore(now) },
      },
      data: { status: 'CLOSED', statusAt: now },
    });
    return count;
  }

  // ------------------------------------------------------------------ helpers

  /** At most SUPPORT_OPEN_MAX tickets waiting at once per author. */
  private async belowOpenMax(
    db: Pick<Prisma.TransactionClient, 'supportTicket'>,
    userId: string,
  ): Promise<void> {
    const open = await db.supportTicket.count({
      where: { userId, status: { in: OPEN_STATUSES } },
    });
    if (open >= SUPPORT_OPEN_MAX)
      throw new AppException(
        HttpStatus.CONFLICT,
        'supportTooMany',
        'errors.support.tooMany',
        {
          params: { count: SUPPORT_OPEN_MAX },
        },
      );
  }

  private async ownVideo(userId: string, videoId: string): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, authorId: userId },
      select: { id: true },
    });
    if (!video)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'supportNotYourVideo',
        'errors.support.notYourVideo',
      );
  }

  /** The pictures go to storage before the rows that point at them. */
  private async store(
    ownerId: string,
    pictures: ProcessedPicture[],
  ): Promise<(ProcessedPicture & { key: string })[]> {
    const stored: (ProcessedPicture & { key: string })[] = [];
    try {
      for (const p of pictures) {
        const key = supportKey(ownerId, p.ext);
        await this.storage.put('private', {
          key,
          body: p.body,
          contentType: p.contentType,
        });
        stored.push({ ...p, key });
      }
    } catch (err) {
      await this.forgetPictures(stored);
      throw err;
    }
    return stored;
  }

  private async forgetPictures(pictures: { key: string }[]): Promise<void> {
    if (!pictures.length) return;
    await this.storage
      .deleteObjects(
        'private',
        pictures.map((p) => p.key),
      )
      .catch((err: Error) =>
        this.logger.warn(`Support pictures stay: ${err.message}`),
      );
  }

  private async addMessage(
    tx: Prisma.TransactionClient,
    ticketId: string,
    authorId: string,
    kind: SupportMessageKind,
    body: string,
    pictures: (ProcessedPicture & { key: string })[],
  ): Promise<void> {
    await tx.supportMessage.create({
      data: {
        ticketId,
        authorId,
        kind,
        body,
        attachments: {
          create: pictures.map((p) => ({
            key: p.key,
            contentType: p.contentType,
            size: p.body.length,
            width: p.width,
            height: p.height,
          })),
        },
      },
    });
  }

  /** Every active admin hears of a new ticket and of the author writing again. */
  private async tellAdmins(
    tx: Prisma.TransactionClient,
    authorId: string,
    payload: {
      ticketId: string;
      number: number;
      subject: string;
      topic: SupportTopic;
      created: boolean;
      preview: string;
    },
  ): Promise<void> {
    const [author, admins] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: authorId },
        select: { username: true },
      }),
      tx.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE', id: { not: authorId } },
        select: { id: true },
      }),
    ]);
    if (!admins.length) return;
    const deliveries: Delivery[] = admins.map((a) => ({
      userId: a.id,
      type: 'SUPPORT_TICKET',
      payload: { ...payload, fromUsername: author.username },
    }));
    await this.outbox.emit(tx, 'notify', { deliveries });
  }

  private async afterAdminsTold(): Promise<void> {
    await this.outbox.nudge();
    await this.pushQueue();
  }

  private async pushUnread(userId: string): Promise<void> {
    try {
      await publishUserEvent(this.redis, {
        userId,
        event: SUPPORT_WS_EVENT.changed,
        payload: { unread: await this.unreadCount(userId) },
      });
    } catch (err) {
      this.logger.warn(`Support count not pushed: ${(err as Error).message}`);
    }
  }

  private async pushQueue(): Promise<void> {
    try {
      const [open, admins] = await Promise.all([
        this.openCount(),
        this.prisma.user.findMany({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      await Promise.all(
        admins.map((a) =>
          publishUserEvent(this.redis, {
            userId: a.id,
            event: SUPPORT_WS_EVENT.queue,
            payload: { open },
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Support queue not pushed: ${(err as Error).message}`);
    }
  }

  private videoDto(v: NonNullable<TicketRow['video']>): SupportVideoDto {
    return {
      id: v.id,
      code: v.code,
      title: v.title,
      thumbnailUrl: v.thumbnailKey
        ? this.storage.publicUrl(v.thumbnailSmallKey ?? v.thumbnailKey)
        : null,
      status: v.status,
      deleted: v.deletedAt !== null,
    };
  }

  private async toDto(
    ticket: TicketRow,
    admin: boolean,
  ): Promise<SupportTicketDto> {
    const messages = await Promise.all(
      ticket.messages
        .filter((m) => admin || m.kind !== 'NOTE')
        .map(async (m): Promise<SupportMessageDto> => ({
          id: m.id,
          kind: m.kind,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          attachments: await Promise.all(
            m.attachments.map(async (a) => ({
              id: a.id,
              url: await this.storage.presignGet(
                'private',
                a.key,
                PICTURE_TTL_SEC,
              ),
              width: a.width,
              height: a.height,
            })),
          ),
          ...(admin ? { author: userRef(m.author) } : {}),
        })),
    );
    return {
      id: ticket.id,
      number: ticket.number,
      topic: ticket.topic,
      subject: ticket.subject,
      status: ticket.status,
      helped: ticket.helped,
      video: ticket.video ? this.videoDto(ticket.video) : null,
      context: (ticket.context as Record<string, string> | null) ?? null,
      activityAt: ticket.activityAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      messages,
    };
  }
}

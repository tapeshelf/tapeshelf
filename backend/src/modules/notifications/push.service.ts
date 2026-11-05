import { createHash, randomBytes } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import type { Prisma, PushMessage } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { FcmSender } from './fcm.js';
import type {
  DeviceDto,
  DeviceKeyDto,
  PushMessageDto,
  RegisterDeviceDto,
} from './push.dto.js';

/** A push older than this is not fetched any more (and the retention sweep removes it). */
export const PUSH_KEEP_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;
/** A phone asking for news it missed gets at most this many, the newest. */
const BACKLOG = 20;

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

/** A session that still signs someone in. */
const live = (now: Date): Prisma.SessionWhereInput => ({
  revokedAt: null,
  expiresAt: { gt: now },
});

/**
 * The phone app's devices and what is pushed to them. A device belongs to a session; a
 * push is written down here and only its id goes to Google, so the text never leaves the server
 * but to the phone itself.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly fcm: FcmSender,
  ) {}

  /** Whether this server sends push signals at all (the app asks for news itself otherwise). */
  get enabled(): boolean {
    return this.fcm.enabled;
  }

  /**
   * The phone of this session, made or updated; returns a fresh key for reading its pushes. A
   * push address another session had (the same phone, signed in again) moves to this one.
   */
  async register(
    userId: string,
    sessionId: string,
    dto: RegisterDeviceDto,
  ): Promise<DeviceKeyDto> {
    const key = randomBytes(32).toString('base64url');
    const token = dto.token?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      if (token)
        await tx.device.deleteMany({
          where: { token, NOT: { sessionId } },
        });
      await tx.device.upsert({
        where: { sessionId },
        create: {
          userId,
          sessionId,
          platform: dto.platform,
          token,
          keyHash: hash(key),
        },
        update: { platform: dto.platform, token, keyHash: hash(key) },
      });
    });
    return { key };
  }

  /** This session's phone no longer wants news (the app turned it off). */
  async unregister(sessionId: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { sessionId } });
  }

  async list(userId: string, sessionId: string): Promise<DeviceDto[]> {
    const rows = await this.prisma.device.findMany({
      where: { userId, session: live(new Date()) },
      include: { session: { select: { client: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((d) => ({
      id: d.id,
      platform: d.platform,
      push: d.token !== null && this.enabled,
      client: d.session.client,
      current: d.sessionId === sessionId,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  /** Whether news of this person can reach a phone at all (a push, or the app asking). */
  async hasDevice(userId: string): Promise<boolean> {
    return (
      (await this.prisma.device.count({
        where: { userId, session: live(new Date()) },
      })) > 0
    );
  }

  /**
   * Whether a push reaches this person quickly: a phone with a push address on a server that
   * sends them. A phone that asks for news itself does so every quarter of an hour at best.
   */
  async reachable(userId: string): Promise<boolean> {
    if (!this.enabled) return false;
    return (
      (await this.prisma.device.count({
        where: { userId, token: { not: null }, session: live(new Date()) },
      })) > 0
    );
  }

  /**
   * Writes the news down for this person's phones and, where push signals go, sends the signal.
   * Nothing when the person has no phone.
   */
  async notify(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
    notificationId: string | null,
  ): Promise<PushMessage | null> {
    if (!(await this.hasDevice(userId))) return null;
    const message = await this.prisma.pushMessage.create({
      data: {
        userId,
        type,
        payload: payload as Prisma.InputJsonObject,
        notificationId,
      },
    });
    if (await this.reachable(userId))
      await this.queues.enqueuePush({ pushId: message.id });
    return message;
  }

  /** The worker's part: the signal to each phone of the person that can get one. */
  async deliver(pushId: string): Promise<{ sent: number; gone: number }> {
    const message = await this.prisma.pushMessage.findUnique({
      where: { id: pushId },
      select: { userId: true },
    });
    if (!message || !this.enabled) return { sent: 0, gone: 0 };
    const devices = await this.prisma.device.findMany({
      where: {
        userId: message.userId,
        token: { not: null },
        session: live(new Date()),
      },
      select: { id: true, token: true },
    });
    let sent = 0;
    let gone = 0;
    let failure: Error | null = null;
    for (const device of devices) {
      try {
        const result = await this.fcm.send(device.token!, { push: pushId });
        if (result === 'sent') sent++;
        else {
          gone++;
          // The app was removed from that phone: it asks no more, and gets nothing.
          await this.prisma.device.update({
            where: { id: device.id },
            data: { token: null },
          });
        }
      } catch (err) {
        failure = err as Error;
        this.logger.warn(`Push to a device failed: ${failure.message}`);
      }
    }
    // Tried again later; a phone that got it already sees the same push again and shows it once.
    if (failure && sent === 0) throw failure;
    return { sent, gone };
  }

  /** The phone behind a device key, if its session still signs someone in. */
  private async deviceOf(key: string | undefined) {
    const device = key
      ? await this.prisma.device.findUnique({
          where: { keyHash: hash(key) },
          include: {
            session: { select: { revokedAt: true, expiresAt: true } },
            user: { select: { status: true } },
          },
        })
      : null;
    if (
      !device ||
      device.session.revokedAt ||
      device.session.expiresAt <= new Date() ||
      device.user.status !== 'ACTIVE'
    )
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'deviceUnknown',
        'errors.deviceUnknown',
      );
    return device;
  }

  /** One push, for the phone a signal woke. */
  async read(key: string | undefined, id: string): Promise<PushMessageDto> {
    const device = await this.deviceOf(key);
    const message = await this.prisma.pushMessage.findFirst({
      where: {
        id,
        userId: device.userId,
        createdAt: { gt: new Date(Date.now() - PUSH_KEEP_DAYS * DAY_MS) },
      },
    });
    if (!message)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'notFound',
        'errors.notFound',
      );
    return toDto(message);
  }

  /**
   * What came since [after] (the newest [BACKLOG] of it, oldest first), for a phone that asks for
   * news itself; nothing from before the phone was registered.
   */
  async since(
    key: string | undefined,
    after: string | undefined,
  ): Promise<PushMessageDto[]> {
    const device = await this.deviceOf(key);
    const from = new Date(
      Math.max(
        device.createdAt.getTime(),
        Date.now() - PUSH_KEEP_DAYS * DAY_MS,
      ),
    );
    const rows = await this.prisma.pushMessage.findMany({
      where: {
        userId: device.userId,
        createdAt: { gte: from },
        ...(after ? { id: { gt: after } } : {}),
      },
      orderBy: { id: 'desc' },
      take: BACKLOG,
    });
    return rows.reverse().map(toDto);
  }
}

function toDto(m: PushMessage): PushMessageDto {
  return {
    id: m.id,
    type: m.type,
    payload: (m.payload ?? {}) as Record<string, unknown>,
    notificationId: m.notificationId,
    createdAt: m.createdAt.toISOString(),
  };
}

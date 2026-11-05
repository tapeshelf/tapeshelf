import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { createHmac } from 'node:crypto';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { monthWindow } from '../downloads/download-rules.js';
import type { NotificationPayloads } from '../notifications/notification.types.js';
import { effectiveTier } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { keptFrom, monthKey, trafficNotice } from './traffic-rules.js';

export interface TrafficStanding {
  usedBytes: number;
  /** 0 = no limit. */
  limitBytes: number;
  reached: boolean;
  resetAt: Date;
}

/** What an admin sees of an account's traffic. */
export interface TrafficSummary {
  usedBytes: number;
  /** 0 = no limit. */
  limitBytes: number;
  lastMonthBytes: number;
}

/**
 * One person, as far as the count can tell: an account, or a guest by their browser and their
 * address. A guest who keeps either is the same guest: a phone moving from Wi-Fi to mobile data keeps
 * its browser, and dropping the cookie does not change the address.
 */
export interface TrafficViewer {
  userId?: string;
  guestId?: string;
  ip?: string;
}

/**
 * The monthly traffic of an account: whenever a video starts playing or downloading, the size
 * of its file comes off what the account has left, however much of it is then watched. Own uploads
 * cost nothing; a guest spends the traffic of whoever shared the video, a signed-in viewer their
 * own. Only the sum is kept. Self-hosted there is no limit, so nothing is written.
 *
 * The account hears when four fifths are spent and when all of it is, once a month each:
 * the month's row remembers that it was told, so a limit raised or lowered meanwhile cannot repeat it.
 */
@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);
  private readonly secret: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly outbox: OutboxService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.secret = Buffer.from(config.get('KEK', { infer: true }), 'hex');
  }

  /** Where an account stands this month. */
  async standing(userId: string, now = new Date()): Promise<TrafficStanding> {
    const { start, resetAt } = monthWindow(now);
    const [usedBytes, limitBytes] = await Promise.all([
      this.used(userId, start),
      this.limit(userId, now),
    ]);
    return {
      usedBytes,
      limitBytes,
      reached: limitBytes > 0 && usedBytes >= limitBytes,
      resetAt,
    };
  }

  /** Bytes counted this month; for an account's own page, however its limit stands. */
  async usedThisMonth(userId: string, now = new Date()): Promise<number> {
    return this.used(userId, monthWindow(now).start);
  }

  /** This month against the limit, and the month before, for the admin's card. */
  async summary(userId: string, now = new Date()): Promise<TrafficSummary> {
    const { start } = monthWindow(now);
    const lastMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
    );
    const [usedBytes, limitBytes, lastMonthBytes] = await Promise.all([
      this.used(userId, start),
      this.limit(userId, now),
      this.used(userId, lastMonth),
    ]);
    return { usedBytes, limitBytes, lastMonthBytes };
  }

  /**
   * Takes `bytes` off the account or refuses: while anything is left, the next file may start, even
   * one bigger than what is left. `seen`: the same thing again within the window costs nothing.
   */
  async charge(
    o: {
      accountId: string;
      bytes: number;
      /** Whose traffic ran out, for the message: the viewer's or the one who shared the video. */
      payer: 'viewer' | 'sharer';
      seen?: { keys: string[]; windowSec: number };
    },
    now = new Date(),
  ): Promise<void> {
    const limit = await this.limit(o.accountId, now);
    if (limit === 0) return;
    if (o.seen && !(await this.firstTime(o.seen.keys, o.seen.windowSec)))
      return;
    const { start, resetAt } = monthWindow(now);
    const month = monthKey(start);
    // One statement, so two files starting together cannot both slip past the limit's edge.
    const rows = await this.prisma.$queryRaw<{ bytes: bigint }[]>`
      INSERT INTO "TrafficUsage" ("userId", "month", "bytes", "updatedAt")
      VALUES (${o.accountId}::uuid, ${month}::date, ${o.bytes}::bigint, now())
      ON CONFLICT ("userId", "month") DO UPDATE
        SET "bytes" = "TrafficUsage"."bytes" + EXCLUDED."bytes", "updatedAt" = now()
        WHERE "TrafficUsage"."bytes" < ${limit}::bigint
      RETURNING "bytes"`;
    if (rows[0]) {
      await this.tell(
        o.accountId,
        start,
        Number(rows[0].bytes),
        limit,
        resetAt,
      );
      return;
    }
    if (o.seen) await this.redis.del(...o.seen.keys).catch(() => undefined);
    // Refused: all of it is spent. Normally said when the charge that spent it went through; said
    // here when the limit shrank under the sum (Pro ended, a setting changed).
    await this.tell(o.accountId, start, limit, limit, resetAt);
    throw new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      o.payer === 'viewer'
        ? 'trafficLimitReached'
        : 'sharerTrafficLimitReached',
      o.payer === 'viewer'
        ? 'errors.traffic.limitReached'
        : 'errors.traffic.sharerLimitReached',
      { details: { resetAt: resetAt.toISOString() } },
    );
  }

  /** Rows of months no longer kept go: this month and the two before it stay. */
  async sweep(now = new Date()): Promise<number> {
    const { count } = await this.prisma.trafficUsage.deleteMany({
      where: { month: { lt: keptFrom(now) } },
    });
    if (count) this.logger.log(`Traffic: ${count} old month row(s) removed`);
    return count;
  }

  /** The keys for "this person already spent this": hashed, so no address is left in Redis. */
  seenKeys(accountId: string, what: string, viewer: TrafficViewer): string[] {
    const who = viewer.userId
      ? [`u:${viewer.userId}`]
      : [`g:${viewer.guestId ?? 'none'}`, `ip:${viewer.ip ?? 'unknown'}`];
    return who.map((w) => {
      const digest = createHmac('sha256', this.secret)
        .update(`${accountId}:${what}:${w}`)
        .digest('base64url');
      return `traffic:seen:${digest}`;
    });
  }

  /**
   * Tells the account once a month that its traffic is running out, and once that it is used up
   * the month's row remembers each. A word that fails to go out never fails the charge.
   */
  private async tell(
    userId: string,
    month: Date,
    used: number,
    limit: number,
    resetAt: Date,
  ): Promise<void> {
    const notice = trafficNotice(used, limit);
    if (!notice) return;
    try {
      const now = new Date();
      const { count } = await this.prisma.trafficUsage.updateMany({
        where:
          notice === 'usedUp'
            ? { userId, month, usedUpAt: null }
            : { userId, month, warnedAt: null },
        data: notice === 'usedUp' ? { usedUpAt: now } : { warnedAt: now },
      });
      if (!count) return;
      const delivery =
        notice === 'usedUp'
          ? {
              type: 'TRAFFIC_USED_UP' as const,
              payload: {
                limitBytes: limit,
                resetAt: resetAt.toISOString(),
              } satisfies NotificationPayloads['TRAFFIC_USED_UP'],
            }
          : {
              type: 'TRAFFIC_RUNNING_OUT' as const,
              payload: {
                usedBytes: used,
                limitBytes: limit,
                resetAt: resetAt.toISOString(),
              } satisfies NotificationPayloads['TRAFFIC_RUNNING_OUT'],
            };
      await this.outbox.emit(this.prisma, 'notify', {
        deliveries: [{ userId, ...delivery }],
      });
      await this.outbox.nudge();
    } catch (err) {
      this.logger.warn(
        `Traffic notice for ${userId} not sent: ${(err as Error).message}`,
      );
    }
  }

  private async used(userId: string, start: Date): Promise<number> {
    const row = await this.prisma.trafficUsage.findUnique({
      where: { userId_month: { userId, month: start } },
      select: { bytes: true },
    });
    return Number(row?.bytes ?? 0n);
  }

  private async limit(userId: string, now: Date): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, tier: true, tierUntil: true },
    });
    if (!user) return 0;
    const limits = await this.plans.limitsForUser({
      role: user.role,
      tier: effectiveTier(user, now),
    });
    return limits.trafficBytesPerMonth;
  }

  /**
   * In one step, so two requests at once cannot both pass: anything already marked means this person
   * was counted, and the marks they lacked are added. Redis away: nothing is spent, since a repeat
   * could not be told from a first view and must not cost twice.
   */
  private static readonly FIRST_TIME = `
    local seen = 0
    for _, key in ipairs(KEYS) do
      if redis.call('EXISTS', key) == 1 then seen = 1 end
    end
    for _, key in ipairs(KEYS) do
      redis.call('SET', key, '1', 'EX', ARGV[1], 'NX')
    end
    return seen == 0 and 1 or 0
  `;

  private async firstTime(keys: string[], windowSec: number): Promise<boolean> {
    const first = await this.redis
      .eval(TrafficService.FIRST_TIME, keys.length, ...keys, String(windowSec))
      .catch(() => 0);
    return first === 1;
  }
}

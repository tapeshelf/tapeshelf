import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { APP_VERSION } from '../../common/version.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';

export type DependencyState = 'up' | 'down';

/** The worker writes this every WORKER_HEARTBEAT_SEC (worker.ts); it expires after four beats. */
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_SEC = 30;
/** An outbox event waiting longer than this means the relay is stuck. */
const OUTBOX_STUCK_MS = 10 * 60_000;
/**
 * A video "processing" with no word for this long is stuck past the watchdog, which takes such
 * videos up after 15 minutes: the watchdog itself is not working.
 */
const PROCESSING_STUCK_MS = 60 * 60_000;

export interface OpsReport {
  status: 'ok' | 'alert';
  /** Seconds since the last worker heartbeat; null = none within two minutes. */
  workerSeenSecAgo: number | null;
  outboxPending: number;
  /** Age of the oldest event not yet delivered, seconds. */
  outboxOldestSec: number | null;
  /** Events given up after every retry in the last day. */
  outboxParked24h: number;
  /** Videos "processing" with no change for an hour: past the watchdog. */
  videosStuck: number;
  /** Videos whose processing failed in the last day: for the record, not an alert. */
  videosFailed24h: number;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { db: DependencyState; redis: DependencyState };
  uptimeSec: number;
  /** The commit this API was built from (common/version.ts). */
  version: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    return {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      checks: { db, redis },
      uptimeSec: Math.round(process.uptime()),
      version: APP_VERSION,
    };
  }

  /**
   * For an external uptime monitor: alerts when no worker is alive or the outbox is
   * stuck — the things the containers' own health checks cannot see.
   */
  async ops(now = Date.now()): Promise<OpsReport> {
    const [beat, pending, oldest, parked, stuckVideos, failed] =
      await Promise.all([
        this.redis.get(WORKER_HEARTBEAT_KEY).catch(() => null),
        this.prisma.outboxEvent.count({ where: { processedAt: null } }),
        this.prisma.outboxEvent.findFirst({
          where: { processedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.outboxEvent.count({
          where: {
            lastError: { not: null },
            processedAt: { gt: new Date(now - 24 * 3600_000) },
          },
        }),
        this.prisma.video.count({
          where: {
            deletedAt: null,
            status: 'PROCESSING',
            OR: [{ stage: null }, { stage: { not: 'EDIT' } }],
            updatedAt: { lt: new Date(now - PROCESSING_STUCK_MS) },
          },
        }),
        this.prisma.video.count({
          where: {
            status: 'FAILED',
            updatedAt: { gt: new Date(now - 24 * 3600_000) },
          },
        }),
      ]);
    const workerSeenSecAgo = beat
      ? Math.round((now - Number(beat)) / 1000)
      : null;
    const oldestMs = oldest ? now - oldest.createdAt.getTime() : null;
    const workerDown =
      workerSeenSecAgo === null || workerSeenSecAgo > WORKER_HEARTBEAT_SEC * 4;
    const stuck = oldestMs !== null && oldestMs > OUTBOX_STUCK_MS;
    return {
      // A parked event gave up for good (a lost cancellation of a subscription, say): someone looks.
      status:
        workerDown || stuck || parked > 0 || stuckVideos > 0 ? 'alert' : 'ok',
      workerSeenSecAgo,
      outboxPending: pending,
      outboxOldestSec: oldestMs === null ? null : Math.round(oldestMs / 1000),
      outboxParked24h: parked,
      videosStuck: stuckVideos,
      videosFailed24h: failed,
    };
  }

  private async checkDb(): Promise<DependencyState> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyState> {
    try {
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

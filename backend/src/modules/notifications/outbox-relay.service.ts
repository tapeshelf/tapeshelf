import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { OutboxEvent } from '../../generated/prisma/client.js';
import type { OutboxPayloads } from '../../infra/outbox/outbox.types.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { BillingService } from '../billing/billing.service.js';
import type { ActiveNotificationType } from './notification.types.js';
import { NotificationsService } from './notifications.service.js';

const BATCH = 50;
/**
 * After this many failed attempts an event is parked (processedAt set, lastError kept) so it cannot
 * block the queue. Between attempts it waits (RETRY_BASE_MS doubling up to RETRY_MAX_MS): ten
 * attempts used to fit into a minute of drains, and a short outage of Paddle lost the cancellation
 * of a deleted account's subscription for good. Billing events try for about two days.
 */
const MAX_ATTEMPTS = 12;
const MAX_BILLING_ATTEMPTS = 48;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 3600_000;
/** How long a done delivery of an event is remembered: longer than an event keeps being retried. */
const DONE_TTL_S = 7 * 24 * 3600;
/** A drain stops taking new batches after this long; the next nudge or timer tick carries on. */
const DRAIN_BUDGET_MS = 60_000;

/**
 * Turns outbox rows into notifications, in id order (uuid v7 = creation order);
 * a failing event is retried on later drains, up to MAX_ATTEMPTS. One drain at a time across every
 * worker process: two relays reading the same pending rows would deliver each event twice.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Processes everything pending; returns how many events were handled (including failures).
   * Holds a transaction-scoped advisory lock (two-key form: never clashes with the per-user locks);
   * when another worker holds it, returns 0 at once: that drain picks up what is pending, and an
   * event committed just as it finishes waits at most for the next timer tick (5 s).
   */
  async drain(): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('tapeshelf'), hashtext('outbox-relay')) AS locked`;
        if (!row?.locked) return 0;
        return this.drainLocked();
      },
      { maxWait: 10_000, timeout: DRAIN_BUDGET_MS + 60_000 },
    );
  }

  private async drainLocked(): Promise<number> {
    const failed = new Set<string>();
    const deadline = Date.now() + DRAIN_BUDGET_MS;
    let handled = 0;
    while (Date.now() < deadline) {
      const batch = await this.prisma.outboxEvent.findMany({
        where: {
          processedAt: null,
          attempts: { lt: MAX_BILLING_ATTEMPTS },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
          ...(failed.size ? { id: { notIn: [...failed] } } : {}),
        },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (batch.length === 0) return handled;
      for (const event of batch) {
        handled++;
        try {
          await this.dispatch(event);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              processedAt: new Date(),
              attempts: { increment: 1 },
              lastError: null,
            },
          });
        } catch (err) {
          failed.add(event.id);
          const attempts = event.attempts + 1;
          const message = (err as Error).message.slice(0, 1000);
          this.logger.error(
            `Outbox ${event.type} ${event.id} failed (attempt ${attempts}): ${message}`,
          );
          const limit = event.type.startsWith('billing.')
            ? MAX_BILLING_ATTEMPTS
            : MAX_ATTEMPTS;
          const wait = Math.min(
            RETRY_BASE_MS * 2 ** (attempts - 1),
            RETRY_MAX_MS,
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              lastError: message,
              processedAt: attempts >= limit ? new Date() : null,
              nextAttemptAt: new Date(Date.now() + wait),
            },
          });
        }
      }
      // No early exit on a short batch: handling an event may write new ones (fan-out chunks),
      // and they belong to this drain. The loop ends when a fetch comes back empty.
    }
    return handled;
  }

  /**
   * One delivery of an event, done at most once: an event that failed halfway is retried as a whole,
   * and the people it had already reached got the notification and the email again, up to ten times.
   * A delivery is remembered once done; only a crash between the two repeats it once.
   */
  private async once(
    eventId: string,
    part: string,
    deliver: () => Promise<unknown>,
  ): Promise<void> {
    const key = `vs:outbox-done:${eventId}:${part}`;
    if (await this.redis.exists(key)) return;
    await deliver();
    await this.redis.set(key, '1', 'EX', DONE_TTL_S);
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    switch (event.type) {
      case 'video.processed': {
        const p = event.payload as unknown as OutboxPayloads['video.processed'];
        await this.once(event.id, 'author', () =>
          this.notifications.deliver(p.authorId, 'VIDEO_PROCESSED', {
            videoId: p.videoId,
            videoCode: p.code,
            title: p.title,
          }),
        );
        return;
      }
      case 'video.failed': {
        const p = event.payload as unknown as OutboxPayloads['video.failed'];
        await this.notifications.deliver(p.authorId, 'VIDEO_FAILED', {
          videoId: p.videoId,
          title: p.title,
          reason: p.reason,
        });
        return;
      }
      case 'video.removed': {
        const p = event.payload as unknown as OutboxPayloads['video.removed'];
        for (const holderId of p.holderIds)
          await this.once(event.id, holderId, () =>
            this.notifications.deliver(holderId, 'VIDEO_REMOVED', {
              videoId: p.videoId,
              title: p.title,
              // Known to this holder by an anonymous link: by its name.
              ...(p.maskedNames && holderId in p.maskedNames
                ? maskedAuthor(p.maskedNames[holderId]!)
                : { authorName: p.authorName }),
            }),
          );
        return;
      }
      case 'notify': {
        const p = event.payload as unknown as OutboxPayloads['notify'];
        for (const [i, d] of p.deliveries.entries())
          await this.once(event.id, String(i), () =>
            this.notifications.deliver(
              d.userId,
              d.type as ActiveNotificationType,
              d.payload as never,
            ),
          );
        return;
      }
      case 'billing.cancel': {
        const p = event.payload as unknown as OutboxPayloads['billing.cancel'];
        await this.billing.cancel(p.subscriptionId, p.when ?? 'now');
        return;
      }
      case 'billing.keep': {
        const p = event.payload as unknown as OutboxPayloads['billing.keep'];
        await this.billing.keep(p.subscriptionId);
        return;
      }
      default:
        this.logger.warn(`Unknown outbox event type ${event.type}; parked`);
    }
  }
}

/** An author known by an anonymous link: its name, or "Anonymous" in the reader's language. */
function maskedAuthor(name: string): { authorName: string; anonymous?: true } {
  return name ? { authorName: name } : { authorName: '', anonymous: true };
}

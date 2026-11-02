import { Injectable, Logger } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { dueReminder } from './plan.js';
import { PlansService } from './plans.service.js';

const DAY_MS = 24 * 3600 * 1000;
const BATCH = 200;

/**
 * Hourly tier.expire job: reminds a week before and on the last day,
 * then writes down the end of PREMIUM. Accounts already count as BASIC from the end date on
 * (effectiveTier), so a late run only delays the messages. Nothing on the shelf is touched: over
 * the BASIC quota, uploads simply stop until space is freed. Self-hosted instances have no tiers and
 * skip it.
 */
@Injectable()
export class PlanExpiryService {
  private readonly logger = new Logger(PlanExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly plans: PlansService,
    private readonly outbox: OutboxService,
  ) {}

  async run(now = new Date()): Promise<{ expired: number; reminded: number }> {
    if (!this.plans.hasTiers) return { expired: 0, reminded: 0 };
    const expired = await this.expire(now);
    const reminded =
      (await this.remind(now, {
        tierReminder: null,
        tierUntil: {
          gt: new Date(now.getTime() + DAY_MS),
          lte: new Date(now.getTime() + 7 * DAY_MS),
        },
      })) +
      (await this.remind(now, {
        OR: [{ tierReminder: null }, { tierReminder: 7 }],
        tierUntil: { gt: now, lte: new Date(now.getTime() + DAY_MS) },
      }));
    if (expired || reminded) {
      await this.outbox.nudge();
      this.logger.log(`Tiers: ${expired} ended, ${reminded} reminded`);
    }
    return { expired, reminded };
  }

  private async expire(now: Date): Promise<number> {
    const basic = (await this.settings.get('tiers')).BASIC;
    let done = 0;
    for (;;) {
      const due = await this.prisma.user.findMany({
        where: { tier: 'PREMIUM', tierUntil: { lte: now } },
        select: {
          id: true,
          status: true,
          storageUsedBytes: true,
          role: true,
          pageHidden: true,
          _count: {
            select: { anonymousLinks: { where: { deletedAt: null } } },
          },
        },
        take: BATCH,
      });
      if (!due.length) return done;
      for (const u of due)
        await this.prisma.$transaction(async (tx) => {
          // Conditional: an admin may have extended the tier since the read.
          const { count } = await tx.user.updateMany({
            where: { id: u.id, tier: 'PREMIUM', tierUntil: { lte: now } },
            data: {
              tier: 'BASIC',
              tierUntil: null,
              tierSource: null,
              tierReminder: null,
            },
          });
          if (!count) return;
          done++;
          // A hidden page opens with the end of Pro; an admin may keep it hidden.
          const reopened = u.pageHidden && u.role !== 'ADMIN';
          if (reopened)
            await tx.user.update({
              where: { id: u.id },
              data: { pageHidden: false },
            });
          if (u.status !== 'ACTIVE') return;
          await this.outbox.emit(tx, 'notify', {
            deliveries: [
              {
                userId: u.id,
                type: 'PLAN_EXPIRED',
                payload: {
                  maxFileBytes: basic.maxFileBytes,
                  storageQuotaBytes: basic.storageQuotaBytes,
                  overQuota:
                    Number(u.storageUsedBytes) > basic.storageQuotaBytes,
                  ...(reopened ? { pageReopened: true } : {}),
                  // Anonymous links stop opening until Pro is back; an admin's go on.
                  ...(u._count.anonymousLinks && u.role !== 'ADMIN'
                    ? { anonymousLinks: true }
                    : {}),
                },
              },
            ],
          });
        });
    }
  }

  /** Walks the candidates by id, so a row that turns out not to be due cannot loop forever. */
  private async remind(
    now: Date,
    where: Prisma.UserWhereInput,
  ): Promise<number> {
    let done = 0;
    let after: string | undefined;
    for (;;) {
      const batch = await this.prisma.user.findMany({
        where: {
          ...where,
          tier: 'PREMIUM',
          status: 'ACTIVE',
          // A subscription that renews by itself does not end: no reminders.
          subscriptions: {
            none: { status: { in: ['ACTIVE', 'TRIALING'] }, endsAt: null },
          },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: {
          id: true,
          tier: true,
          tierUntil: true,
          tierReminder: true,
          role: true,
          pageHidden: true,
          _count: {
            select: { anonymousLinks: { where: { deletedAt: null } } },
          },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (!batch.length) return done;
      after = batch[batch.length - 1]!.id;
      for (const u of batch) {
        const reminder = dueReminder(u, now);
        if (!reminder) continue;
        await this.prisma.$transaction(async (tx) => {
          // Conditional: the end date may have changed since the read (that re-arms the reminders).
          const { count } = await tx.user.updateMany({
            where: {
              id: u.id,
              tierUntil: u.tierUntil,
              tierReminder: u.tierReminder,
            },
            data: { tierReminder: reminder },
          });
          if (!count) return;
          done++;
          await this.outbox.emit(tx, 'notify', {
            deliveries: [
              {
                userId: u.id,
                type: 'PLAN_EXPIRING',
                payload: {
                  until: u.tierUntil!.toISOString(),
                  // The page will open when Pro ends.
                  ...(u.pageHidden && u.role !== 'ADMIN'
                    ? { pageHidden: true }
                    : {}),
                  // Anonymous links will stop opening.
                  ...(u._count.anonymousLinks && u.role !== 'ADMIN'
                    ? { anonymousLinks: true }
                    : {}),
                },
              },
            ],
          });
        });
      }
    }
  }
}

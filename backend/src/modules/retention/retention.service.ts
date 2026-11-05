import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { LINK_KEEP_DAYS } from '../links/link-rules.js';
import { PUSH_KEEP_DAYS } from '../notifications/push.service.js';

const DAY_MS = 24 * 3600 * 1000;

/** How long records are kept (the privacy policy says the same). */
export const RETENTION_DAYS = {
  /** Read notifications. */
  readNotifications: 90,
  /** Any notification, read or not. */
  notifications: 365,
  auditLog: 730,
  /** 13 months: the monthly count and a full year back. */
  downloads: 395,
  /** Sessions after they were closed or ran out. */
  closedSessions: 30,
  /** Email links after they expired or were used. */
  emailTokens: 30,
  /** Outbox events after they were delivered. */
  deliveredEvents: 30,
  /** Ids of handled Paddle webhooks: Paddle can replay a notification for 90 days. */
  billingEvents: 90,
  /** Temporary links after they ran out or were taken back. */
  shareLinks: LINK_KEEP_DAYS,
  /** What a push said: the phone fetches it within minutes; a week covers one switched off. */
  pushMessages: PUSH_KEEP_DAYS,
} as const;

/**
 * Daily retention sweep run by the worker. Messages, reports and account data are not touched
 * here: they live as long as the account (and reports as moderation records after it).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sweep(now = new Date()): Promise<Record<string, number>> {
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const R = RETENTION_DAYS;
    const counts = {
      notifications: (
        await this.prisma.notification.deleteMany({
          where: {
            OR: [
              { readAt: { lt: before(R.readNotifications) } },
              { createdAt: { lt: before(R.notifications) } },
            ],
          },
        })
      ).count,
      pushMessages: (
        await this.prisma.pushMessage.deleteMany({
          where: { createdAt: { lt: before(R.pushMessages) } },
        })
      ).count,
      auditLog: (
        await this.prisma.auditLog.deleteMany({
          where: { createdAt: { lt: before(R.auditLog) } },
        })
      ).count,
      downloads: (
        await this.prisma.downloadEvent.deleteMany({
          where: { startedAt: { lt: before(R.downloads) } },
        })
      ).count,
      sessions: (
        await this.prisma.session.deleteMany({
          where: {
            OR: [
              { revokedAt: { lt: before(R.closedSessions) } },
              { expiresAt: { lt: before(R.closedSessions) } },
            ],
          },
        })
      ).count,
      emailTokens: (
        await this.prisma.emailToken.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: before(R.emailTokens) } },
              { usedAt: { lt: before(R.emailTokens) } },
            ],
          },
        })
      ).count,
      outboxEvents: (
        await this.prisma.outboxEvent.deleteMany({
          where: { processedAt: { lt: before(R.deliveredEvents) } },
        })
      ).count,
      billingEvents: (
        await this.prisma.billingEvent.deleteMany({
          where: { receivedAt: { lt: before(R.billingEvents) } },
        })
      ).count,
      shareLinks: (
        await this.prisma.shareLink.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: before(R.shareLinks) } },
              { revokedAt: { lt: before(R.shareLinks) } },
            ],
          },
        })
      ).count,
    };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total) this.logger.log(`Retention removed ${JSON.stringify(counts)}`);
    return counts;
  }
}

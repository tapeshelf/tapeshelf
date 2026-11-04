import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  SETTING_DEFAULTS,
  type Settings,
  type TierLimits,
} from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import type { TierLimitsDto } from '../plans/plans.dto.js';
import { AdminVideosService } from './admin-videos.service.js';
import { USER_REF_SELECT, userRef } from './admin-mappers.js';
import type {
  AdminAuditQueryDto,
  AuditListDto,
  DashboardDto,
  ExtensionFunnelDto,
  SiteSettingsDto,
} from './admin.dto.js';

const WEEK_MS = 7 * 24 * 3600 * 1000;
const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];

/** Dashboard, site settings and the audit log. */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly videos: AdminVideosService,
  ) {}

  async dashboard(): Promise<DashboardDto> {
    const [
      users,
      videos,
      originals,
      trashCount,
      trashBytes,
      openReports,
      openRequests,
      outboxPending,
      queues,
      usersNew,
      openSupport,
      extension,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.video.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.video.aggregate({
        where: { deletedAt: null },
        _sum: { sizeBytes: true },
      }),
      this.prisma.video.count({
        where: { deletedAt: { not: null }, purgedAt: null },
      }),
      this.videos.trashBytes(),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.videoRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }),
      this.queueStats(),
      this.prisma.user.count({
        where: {
          createdAt: { gt: new Date(Date.now() - WEEK_MS) },
          status: { not: 'GUEST' },
        },
      }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.extensionFunnel(),
    ]);
    const byUser = (s: string) =>
      users.find((u) => u.status === s)?._count._all ?? 0;
    const byVideo = (s: string) =>
      videos.find((v) => v.status === s)?._count._all ?? 0;
    return {
      usersTotal: users
        .filter((u) => u.status !== 'GUEST')
        .reduce((n, u) => n + u._count._all, 0),
      usersActive: byUser('ACTIVE'),
      usersBanned: byUser('BANNED'),
      usersDeleted: byUser('DELETED'),
      usersNew,
      videosTotal: videos.reduce((n, v) => n + v._count._all, 0),
      videosReady: byVideo('READY'),
      videosProcessing: byVideo('QUEUED') + byVideo('PROCESSING'),
      videosFailed: byVideo('FAILED'),
      originalsBytes: Number(originals._sum.sizeBytes ?? 0n),
      trashCount,
      trashBytes,
      openReports,
      openRequests,
      openSupport,
      outboxPending,
      queues,
      extension,
    };
  }

  /**
   * The browser extension's funnel, on the server alone — the extension reports nothing:
   * connections, new accounts that connected it within a day of signing up (whatever the way of
   * signing up), videos it saved to shelves, all in the last 7 days; people connected now.
   */
  private async extensionFunnel(): Promise<ExtensionFunnelDto> {
    const since = new Date(Date.now() - WEEK_MS);
    const [row] = await this.prisma.$queryRaw<ExtensionFunnelDto[]>`
      SELECT
        (SELECT count(*)::int FROM "AppToken" t WHERE t."createdAt" > ${since}) AS connections,
        (SELECT count(DISTINCT u.id)::int FROM "User" u JOIN "AppToken" t ON t."userId" = u.id
          WHERE u."createdAt" > ${since} AND u.status <> 'GUEST'
            AND t."createdAt" <= u."createdAt" + interval '1 day') AS signups,
        (SELECT count(*)::int FROM "UploadSession" s
          WHERE s."appTokenId" IS NOT NULL AND s.status = 'COMPLETED'
            AND s."updatedAt" > ${since}) AS "shelfSaves",
        (SELECT count(DISTINCT t."userId")::int FROM "AppToken" t
          WHERE t."revokedAt" IS NULL) AS connected`;
    return row ?? { connections: 0, signups: 0, shelfSaves: 0, connected: 0 };
  }

  async getSettings(): Promise<SiteSettingsDto> {
    const entries = await Promise.all(
      SETTING_KEYS.map(async (k) => [k, await this.settings.get(k)] as const),
    );
    return Object.fromEntries(entries) as unknown as SiteSettingsDto;
  }

  /** Saves every changed key (applied at once: the settings cache is dropped) and audits the diff. */
  async updateSettings(
    actorId: string,
    dto: SiteSettingsDto,
  ): Promise<SiteSettingsDto> {
    const before = await this.getSettings();
    const next: Settings = {
      usernameChangeDays: dto.usernameChangeDays,
      requestCooldownDays: dto.requestCooldownDays,
      requestHintMinShows: dto.requestHintMinShows,
      paymentGraceDays: dto.paymentGraceDays,
      registrationOpen: dto.registrationOpen ?? before.registrationOpen,
      tiers: {
        BASIC: limits(dto.tiers.BASIC),
        PREMIUM: limits(dto.tiers.PREMIUM),
      },
      limits: {
        maxFileBytes: dto.limits.maxFileBytes,
        storageQuotaBytes: dto.limits.storageQuotaBytes,
        requestsPerDay: dto.limits.requestsPerDay,
        trashRetentionDays: dto.limits.trashRetentionDays,
        extensionPerDay: dto.limits.extensionPerDay,
      },
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of SETTING_KEYS) {
      if (JSON.stringify(before[key]) === JSON.stringify(next[key])) continue;
      changes[key] = { from: before[key], to: next[key] };
      await this.settings.set(key, next[key]);
    }
    if (Object.keys(changes).length)
      await this.audit.log({
        actorId,
        action: 'settings.update',
        targetType: 'settings',
        meta: changes,
      });
    return this.getSettings();
  }

  async auditLog(query: AdminAuditQueryDto): Promise<AuditListDto> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.actor
        ? { actor: { username: query.actor.toLowerCase() } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: USER_REF_SELECT } },
        orderBy: { id: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 50,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: r.actor ? userRef(r.actor) : null,
        targetType: r.targetType,
        targetId: r.targetId,
        meta: (r.meta ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  }

  private async queueStats() {
    const queues = [
      this.queues.remux,
      this.queues.transcode,
      this.queues.thumbnail,
      this.queues.mail,
      this.queues.outbox,
    ];
    return Promise.all(
      queues.map(async (q) => {
        const c = await q
          .getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized')
          .catch(() => ({}) as Record<string, number>);
        return {
          name: q.name,
          waiting: (c['waiting'] ?? 0) + (c['prioritized'] ?? 0),
          active: c['active'] ?? 0,
          delayed: c['delayed'] ?? 0,
          failed: c['failed'] ?? 0,
        };
      }),
    );
  }
}

/** Plain copy of the validated DTO (only the known keys reach the database). */
function limits(t: TierLimitsDto): TierLimits {
  return {
    maxFileBytes: t.maxFileBytes,
    storageQuotaBytes: t.storageQuotaBytes,
    requestsPerDay: t.requestsPerDay,
    downloadsPerMonth: t.downloadsPerMonth,
    downloadSpeedBytesPerSec: t.downloadSpeedBytesPerSec,
    downloadConcurrency: t.downloadConcurrency,
    trafficBytesPerMonth: t.trafficBytesPerMonth,
    trashRetentionDays: t.trashRetentionDays,
    apiRateMultiplier: t.apiRateMultiplier,
    extensionPerDay: t.extensionPerDay,
  };
}

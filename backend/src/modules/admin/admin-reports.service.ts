import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ReportStatus,
  ReportTarget,
} from '../../generated/prisma/enums.js';
import type { Delivery } from '../../infra/outbox/outbox.types.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  AdminReportDto,
  AdminReportListDto,
  ReportAction,
} from '../reports/reports.dto.js';
import { UsersService } from '../users/users.service.js';
import { AdminVideosService } from './admin-videos.service.js';

const USER = {
  select: {
    id: true,
    username: true,
    displayName: true,
    avatarKey: true,
    status: true,
  },
} as const;

const REPORT_INCLUDE = {
  reporter: USER,
  targetUser: USER,
  video: {
    select: {
      id: true,
      title: true,
      thumbnailKey: true,
      thumbnailSmallKey: true,
      sensitive: true,
      visibility: true,
      deletedAt: true,
      purgedAt: true,
    },
  },
} satisfies Prisma.ReportInclude;

type LoadedReport = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

/**
 * Reports: the queue, and resolving or dismissing a report. A decision
 * closes every open report on the same target at once; each reporter gets REPORT_RESOLVED.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly accounts: AccountsService,
    private readonly videos: AdminVideosService,
    private readonly users: UsersService,
  ) {}

  async list(query: {
    status?: ReportStatus;
    targetType?: ReportTarget;
    /** Reports about this account (its profile or its videos). */
    userId?: string;
    offset?: number;
    limit?: number;
  }): Promise<AdminReportListDto> {
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.userId ? { targetUserId: query.userId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: REPORT_INCLUDE,
        // The open queue is worked oldest first; history newest first.
        orderBy: { id: query.status === 'OPEN' ? 'asc' : 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 30,
      }),
      this.prisma.report.count({ where }),
    ]);
    const open = await this.openCounts(rows);
    return {
      items: rows.map((r) => this.toDto(r, open.get(targetKey(r)) ?? 0)),
      total,
    };
  }

  async resolve(
    actorId: string,
    id: string,
    action: ReportAction,
    note?: string,
    takedown: { message?: string; blockFile?: boolean } = {},
  ): Promise<AdminReportDto> {
    const r = await this.loadOpen(id);
    if (action === 'DELETE_VIDEO') {
      if (!r.videoId) throw badAction();
      // The reported rule is the reason the author is given; the file is blocked by default.
      if (!r.video?.deletedAt)
        await this.videos.delete(actorId, r.videoId, {
          rule: r.reason,
          message: takedown.message,
          blockFile: takedown.blockFile ?? true,
        });
    } else if (action === 'BAN_USER') {
      if (r.targetUser.status === 'ACTIVE')
        await this.accounts.ban(
          actorId,
          r.targetUserId,
          note || `report ${r.id}`,
        );
    }
    await this.close(actorId, r, 'RESOLVED', action, note);
    return this.get(id);
  }

  async dismiss(
    actorId: string,
    id: string,
    note?: string,
  ): Promise<AdminReportDto> {
    const r = await this.loadOpen(id);
    await this.close(actorId, r, 'DISMISSED', null, note);
    return this.get(id);
  }

  /** Closes every open report on r's target with one decision and tells each reporter. */
  private async close(
    actorId: string,
    r: LoadedReport,
    status: 'RESOLVED' | 'DISMISSED',
    action: ReportAction | null,
    note?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const group = await tx.report.findMany({
        where: {
          status: 'OPEN',
          targetUserId: r.targetUserId,
          videoId: r.videoId,
          targetType: r.targetType,
        },
        select: { id: true, reporterId: true },
      });
      const now = new Date();
      await tx.report.updateMany({
        where: { id: { in: group.map((g) => g.id) } },
        data: {
          status,
          action,
          note: note || null,
          resolvedById: actorId,
          resolvedAt: now,
        },
      });
      const title =
        r.targetType === 'VIDEO'
          ? (r.video?.title ?? '')
          : r.targetUser.displayName;
      const deliveries: Delivery[] = group.map((g) => ({
        userId: g.reporterId,
        type: 'REPORT_RESOLVED',
        payload: {
          reportId: g.id,
          outcome: status === 'RESOLVED' ? 'actionTaken' : 'noViolation',
          targetType: r.targetType,
          title,
        },
      }));
      await this.outbox.emit(tx, 'notify', { deliveries });
      await this.audit.log(
        {
          actorId,
          action: status === 'RESOLVED' ? 'report.resolve' : 'report.dismiss',
          targetType: 'report',
          targetId: r.id,
          meta: {
            target: r.targetType,
            username: r.targetUser.username,
            ...(r.video ? { videoId: r.video.id, title: r.video.title } : {}),
            ...(action ? { decision: action } : {}),
            ...(note ? { note } : {}),
            reports: group.length,
          },
        },
        tx,
      );
    });
    await this.outbox.nudge();
  }

  private async get(id: string): Promise<AdminReportDto> {
    const r = await this.prisma.report.findUniqueOrThrow({
      where: { id },
      include: REPORT_INCLUDE,
    });
    const open = await this.openCounts([r]);
    return this.toDto(r, open.get(targetKey(r)) ?? 0);
  }

  private async loadOpen(id: string): Promise<LoadedReport> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });
    if (!r)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'reportNotFound',
        'errors.notFound',
      );
    if (r.status !== 'OPEN')
      throw new AppException(
        HttpStatus.CONFLICT,
        'reportClosed',
        'errors.admin.reportClosed',
      );
    return r;
  }

  /** Open reports per target among the given rows' targets. */
  private async openCounts(rows: LoadedReport[]): Promise<Map<string, number>> {
    if (rows.length === 0) return new Map();
    const groups = await this.prisma.report.groupBy({
      by: ['targetUserId', 'videoId'],
      where: {
        status: 'OPEN',
        targetUserId: { in: [...new Set(rows.map((r) => r.targetUserId))] },
      },
      _count: { _all: true },
    });
    return new Map(
      groups.map((g) => [
        `${g.targetUserId}:${g.videoId ?? ''}`,
        g._count._all,
      ]),
    );
  }

  private toDto(r: LoadedReport, openOnTarget: number): AdminReportDto {
    const user = (u: LoadedReport['reporter']) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.users.mediaUrl(u.avatarKey),
      status: u.status,
    });
    return {
      id: r.id,
      targetType: r.targetType,
      reason: r.reason,
      comment: r.comment,
      status: r.status,
      action: r.action,
      note: r.note,
      reporter: user(r.reporter),
      targetUser: user(r.targetUser),
      video: r.video
        ? {
            id: r.video.id,
            title: r.video.title,
            thumbnailUrl:
              r.video.thumbnailKey && !r.video.purgedAt
                ? this.storage.publicUrl(
                    r.video.thumbnailSmallKey ?? r.video.thumbnailKey,
                  )
                : null,
            sensitive: r.video.sensitive,
            visibility: r.video.visibility,
            deletedAt: r.video.deletedAt?.toISOString() ?? null,
          }
        : null,
      openOnTarget,
      resolvedBy: r.resolvedById,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

function targetKey(r: {
  targetUserId: string;
  videoId: string | null;
}): string {
  return `${r.targetUserId}:${r.videoId ?? ''}`;
}

const badAction = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'reportAction',
    'errors.admin.reportAction',
  );

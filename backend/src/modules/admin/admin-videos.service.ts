import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BlocklistService } from '../blocklist/blocklist.service.js';
import { effectiveTier } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { IN_TRASH } from '../trash/trash-state.js';
import { processUnfinished } from '../trash/process-unfinished.js';
import {
  VideoPurgeService,
  videoPrefixes,
} from '../trash/video-purge.service.js';
import { StreamingService } from '../streaming/streaming.service.js';
import { VideosService } from '../videos/videos.service.js';
import {
  USER_REF_SELECT,
  UUID_RE,
  VIDEO_ROW_INCLUDE,
  rowCounts,
  type UserRefRow,
  videoRow,
} from './admin-mappers.js';
import type {
  AdminBulkResultDto,
  AdminDeleteVideoDto,
  AdminDeleteVideosDto,
  AdminTrashListDto,
  AdminTrashQueryDto,
  AdminVideoDetailDto,
  AdminVideoListDto,
  AdminVideoRowDto,
  AdminVideosQueryDto,
  SourceMetadataDto,
  TrashResultDto,
  UpdateAdminVideoDto,
} from './admin.dto.js';
import { dropLostCopies } from './lost-copies.js';
import { StacksService } from '../collection/stacks.service.js';

/** S3 prefixes of everything a video owns (uploads.service, video-pipeline.service). */

const SORTS: Record<string, Prisma.VideoOrderByWithRelationInput[]> = {
  created: [{ id: 'desc' }],
  size: [{ sizeBytes: 'desc' }, { id: 'desc' }],
  title: [{ title: 'asc' }, { id: 'desc' }],
};

const MEASURE_CONCURRENCY = 4;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Videos and Trash: every video including
 * private and deleted ones; deleted videos keep their files until the admin erases them from S3
 * here — nothing else ever does.
 */
@Injectable()
export class AdminVideosService {
  private readonly logger = new Logger(AdminVideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly videos: VideosService,
    private readonly purger: VideoPurgeService,
    private readonly blocklist: BlocklistService,
    private readonly stacks: StacksService,
    private readonly plans: PlansService,
    private readonly streaming: StreamingService,
  ) {}

  async list(query: AdminVideosQueryDto): Promise<AdminVideoListDto> {
    const scope = query.scope ?? 'live';
    const q = query.q?.trim();
    const where: Prisma.VideoWhereInput = {
      ...(scope === 'live' ? { deletedAt: null } : {}),
      ...(scope === 'trash' ? IN_TRASH : {}),
      ...(scope === 'purged' ? { purgedAt: { not: null } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.author
        ? { author: { username: query.author.toLowerCase() } }
        : {}),
      ...(q
        ? UUID_RE.test(q)
          ? { id: q }
          : { title: { contains: q, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        include: VIDEO_ROW_INCLUDE,
        orderBy: SORTS[query.sort ?? 'created'],
        skip: query.offset ?? 0,
        take: query.limit ?? 30,
      }),
      this.prisma.video.count({ where }),
    ]);
    return { items: await this.rows(rows), total };
  }

  async detail(id: string): Promise<AdminVideoDetailDto> {
    const v = await this.prisma.video.findUnique({
      where: { id },
      include: {
        ...VIDEO_ROW_INCLUDE,
        frames: { orderBy: { index: 'asc' } },
      },
    });
    if (!v) throw notFound();
    const [openRequests, openReports, deletedBy] = await Promise.all([
      this.prisma.videoRequest.count({
        where: {
          status: 'OPEN',
          offers: { some: { items: { some: { videoId: id } } } },
        },
      }),
      this.prisma.report.count({ where: { videoId: id, status: 'OPEN' } }),
      v.deletedById
        ? this.prisma.user.findUnique({
            where: { id: v.deletedById },
            select: USER_REF_SELECT,
          })
        : null,
    ]);
    const files = !v.purgedAt;
    const counts = (await rowCounts(this.prisma, [v.id])).get(v.id)!;
    return Object.assign(videoRow(this.storage, v, counts, deletedBy), {
      description: v.description,
      originalFilename: v.originalFilename,
      mimeType: v.mimeType,
      probe: (v.probe as Record<string, unknown> | null) ?? null,
      sourceMetadata: (v.sourceMetadata as SourceMetadataDto | null) ?? null,
      failDetail: v.failDetail,
      processingAttempts: v.processingAttempts,
      processedAt: v.processedAt?.toISOString() ?? null,
      keyVersion: v.keyVersion,
      segmentCount: v.segmentCount,
      contactSheetUrl:
        files && v.contactSheetKey
          ? this.storage.publicUrl(v.contactSheetKey)
          : null,
      frames: files
        ? v.frames.map((f) => ({
            index: f.index,
            timestampSec: f.timestampSec,
            url: this.storage.publicUrl(f.key),
          }))
        : [],
      openRequests,
      openReports,
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateAdminVideoDto,
  ): Promise<AdminVideoDetailDto> {
    const v = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
    });
    if (!v) throw notFound();
    const changes: Record<string, unknown> = {};
    if (dto.visibility !== undefined && dto.visibility !== v.visibility)
      changes['visibility'] = { from: v.visibility, to: dto.visibility };
    if (dto.sensitive !== undefined && dto.sensitive !== v.sensitive)
      changes['sensitive'] = { from: v.sensitive, to: dto.sensitive };
    if (Object.keys(changes).length)
      await this.prisma.$transaction(async (tx) => {
        await tx.video.update({
          where: { id },
          data: {
            visibility: dto.visibility,
            sensitive: dto.sensitive,
          },
        });
        await this.audit.log(
          {
            actorId,
            action: 'video.update',
            targetType: 'video',
            targetId: id,
            meta: { title: v.title, ...changes },
          },
          tx,
        );
      });
    return this.detail(id);
  }

  /**
   * Into the trash with reason ADMIN: the author gets a statement of reasons — the
   * rule and the admin's words — other holders the usual "removed"; the file may go on the
   * blocklist so it cannot be uploaded again.
   */
  async delete(
    actorId: string,
    id: string,
    takedown: AdminDeleteVideoDto,
  ): Promise<void> {
    const v = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        title: true,
        sizeBytes: true,
        originalSha256: true,
        author: { select: { status: true } },
      },
    });
    if (!v) throw notFound();
    const message = takedown.message || null;
    await this.prisma.$transaction(async (tx) => {
      await this.videos.softDeleteInTx(tx, actorId, [v], 'ADMIN', [v.authorId]);
      await tx.video.update({
        where: { id },
        data: { takedownRule: takedown.rule, takedownNote: message },
      });
      if (takedown.blockFile)
        await this.blocklist.block(tx, v, takedown.rule, actorId);
      if (v.author.status === 'ACTIVE' && v.authorId !== actorId)
        await this.outbox.emit(tx, 'notify', {
          deliveries: [
            {
              userId: v.authorId,
              type: 'VIDEO_TAKEN_DOWN',
              payload: {
                videoId: id,
                title: v.title,
                rule: takedown.rule,
                message,
              },
            },
          ],
        });
      await this.audit.log(
        {
          actorId,
          action: 'video.delete',
          targetType: 'video',
          targetId: id,
          meta: {
            title: v.title,
            rule: takedown.rule,
            ...(message ? { message } : {}),
            ...(takedown.blockFile ? { blocked: true } : {}),
          },
        },
        tx,
      );
    });
    await this.outbox.nudge();
    // An original hashed before blocks existed gets its hash in the background.
    if (takedown.blockFile && !v.originalSha256)
      await this.queues.enqueueHashBackfill();
  }

  /** The same removal for several videos; one already deleted or gone is skipped. */
  async deleteMany(
    actorId: string,
    dto: AdminDeleteVideosDto,
  ): Promise<AdminBulkResultDto> {
    const skipped: string[] = [];
    const ids = [...new Set(dto.videoIds)];
    for (const id of ids) {
      try {
        await this.delete(actorId, id, dto);
      } catch (err) {
        if (!(err instanceof AppException)) throw err;
        skipped.push(id);
      }
    }
    return { done: ids.length - skipped.length, skipped };
  }

  /**
   * run processing again for a failed (or stuck) video. A READY video is left
   * alone: reprocessing would take it off every page and could void open exchange offers.
   */
  async reprocess(actorId: string, id: string): Promise<AdminVideoDetailDto> {
    const v = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
    });
    if (!v) throw notFound();
    if (v.status === 'READY')
      throw new AppException(
        HttpStatus.CONFLICT,
        'alreadyProcessed',
        'errors.admin.alreadyProcessed',
      );
    // Not ready because it is being edited (or is an edited copy being made): the editor's
    // render finishes it; processing it as an upload would undo that.
    if (v.stage === 'EDIT')
      throw new AppException(
        HttpStatus.CONFLICT,
        'editInProgress',
        'errors.editor.inProgress',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.video.update({
        where: { id },
        data: {
          status: 'QUEUED',
          stage: null,
          progress: 0,
          failReason: null,
          failDetail: null,
        },
      });
      await this.audit.log(
        {
          actorId,
          action: 'video.reprocess',
          targetType: 'video',
          targetId: id,
          meta: { title: v.title, from: v.status },
        },
        tx,
      );
    });
    // A job still waiting or running under the same id is kept (BullMQ ignores the duplicate).
    await this.queues.enqueueProcessing({ videoId: id, userId: v.authorId });
    return this.detail(id);
  }

  // ------------------------------------------------------------------- trash

  /**
   * The trash: first what has left its author's trash for good and waits for the admin —
   * emptied, deleted from there, time over, account blocked or gone, removed by an admin — newest
   * first; then what the authors can still restore, with the day it leaves their trash.
   */
  async trash(query: AdminTrashQueryDto): Promise<AdminTrashListDto> {
    const q = query.q?.trim();
    const where: Prisma.VideoWhereInput = {
      ...IN_TRASH,
      ...(query.state === 'out' ? { trashExitAt: { not: null } } : {}),
      ...(query.state === 'user' ? { trashExitAt: null } : {}),
      ...(query.exit ? { trashExit: query.exit } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { author: { username: { contains: q.toLowerCase() } } },
            ],
          }
        : {}),
    };
    const [rows, total, waiting, inUserTrash] = await Promise.all([
      this.prisma.video.findMany({
        where,
        include: {
          ...VIDEO_ROW_INCLUDE,
          author: {
            select: { ...USER_REF_SELECT, tier: true, tierUntil: true },
          },
        },
        orderBy: [
          { trashExitAt: { sort: 'desc', nulls: 'last' } },
          { deletedAt: 'desc' },
          { id: 'desc' },
        ],
        skip: query.offset ?? 0,
        take: query.limit ?? 30,
      }),
      this.prisma.video.count({ where }),
      this.prisma.video.count({
        where: { ...IN_TRASH, trashExitAt: { not: null } },
      }),
      this.prisma.video.count({ where: { ...IN_TRASH, trashExitAt: null } }),
    ]);
    await this.measure(rows.filter((r) => r.storedBytes === null));
    const retention = {
      BASIC: (await this.plans.limitsFor('BASIC')).trashRetentionDays,
      PREMIUM: (await this.plans.limitsFor('PREMIUM')).trashRetentionDays,
    };
    const items = await this.rows(rows);
    rows.forEach((r, i) => {
      if (r.trashExitAt || !r.deletedAt) return;
      const days = retention[effectiveTier(r.author)];
      items[i]!.restorableUntil = new Date(
        r.deletedAt.getTime() + days * DAY_MS,
      ).toISOString();
    });
    return {
      items,
      total,
      totalBytes: await this.trashBytes(),
      waiting,
      inUserTrash,
    };
  }

  /** Measured bytes where known, the original size otherwise. */
  async trashBytes(): Promise<number> {
    const [measured, unmeasured] = await Promise.all([
      this.prisma.video.aggregate({
        where: { ...IN_TRASH, storedBytes: { not: null } },
        _sum: { storedBytes: true },
      }),
      this.prisma.video.aggregate({
        where: { ...IN_TRASH, storedBytes: null },
        _sum: { sizeBytes: true },
      }),
    ]);
    return (
      Number(measured._sum.storedBytes ?? 0n) +
      Number(unmeasured._sum.sizeBytes ?? 0n)
    );
  }

  /** Erase from S3 for good: only here, by the admin. */
  purge(actorId: string, ids: string[]): Promise<TrashResultDto> {
    return this.purger.purge(actorId, ids);
  }

  /**
   * Back from the trash (the counterpart of purge): the
   * video reappears on its author's shelf and counts against their quota again. Its holders get it
   * back only if it was still in the author's trash or an admin had removed it; one that left the
   * author's trash for good was lost to them. Not possible once purged or when
   * the author deleted their account.
   */
  async restore(actorId: string, ids: string[]): Promise<TrashResultDto> {
    const rows = await this.prisma.video.findMany({
      where: {
        id: { in: ids },
        ...IN_TRASH,
        author: { status: { not: 'DELETED' } },
      },
      select: {
        id: true,
        title: true,
        authorId: true,
        sizeBytes: true,
        renderBytes: true,
        trashExit: true,
      },
    });
    const done = new Set<string>();
    const lost: [string, string][] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const v of rows) {
        // Only what is still in the trash: a second restore of the same video, or one being erased
        // right now, changes nothing (the size was added twice).
        const { count } = await tx.video.updateMany({
          where: { id: v.id, ...IN_TRASH },
          data: {
            deletedAt: null,
            deletedById: null,
            deleteReason: null,
            trashExit: null,
            trashExitAt: null,
            storedBytes: null,
            takedownRule: null,
            takedownNote: null,
          },
        });
        if (count === 0) continue;
        done.add(v.id);
        if (v.trashExit && v.trashExit !== 'ADMIN')
          for (const holderId of await dropLostCopies(tx, this.stacks, v.id))
            lost.push([v.id, holderId]);
        // A removal undone is no reason to keep the file out.
        await this.blocklist.unblock(tx, v.id);
        await tx.user.update({
          where: { id: v.authorId },
          data: {
            storageUsedBytes: {
              increment: v.sizeBytes + (v.renderBytes ?? 0n),
            },
          },
        });
        await this.audit.log(
          {
            actorId,
            action: 'video.restore',
            targetType: 'video',
            targetId: v.id,
            meta: { title: v.title },
          },
          tx,
        );
      }
    });
    for (const [videoId, holderId] of lost)
      await this.streaming.forgetDecision(videoId, holderId);
    await processUnfinished(this.prisma, this.queues, [...done]);
    return {
      done: done.size,
      bytes: 0,
      skipped: ids.filter((id) => !done.has(id)),
    };
  }

  /** Measures S3 usage of trashed videos once (they no longer change) and stores it. */
  private async measure(rows: { id: string }[]): Promise<void> {
    for (let i = 0; i < rows.length; i += MEASURE_CONCURRENCY)
      await Promise.all(
        rows.slice(i, i + MEASURE_CONCURRENCY).map(async (r) => {
          try {
            const p = videoPrefixes(r.id);
            const size =
              (await this.storage.prefixSize('private', p.private)) +
              (await this.storage.prefixSize('public', p.public));
            await this.prisma.video.update({
              where: { id: r.id },
              data: { storedBytes: size },
            });
            Object.assign(r, { storedBytes: BigInt(size) });
          } catch (err) {
            this.logger.warn(
              `Cannot measure video ${r.id}: ${(err as Error).message}`,
            );
          }
        }),
      );
  }

  private async rows(
    rows: (Parameters<typeof videoRow>[1] & { deletedById: string | null })[],
  ): Promise<AdminVideoRowDto[]> {
    const ids = [
      ...new Set(
        rows.map((r) => r.deletedById).filter((x): x is string => !!x),
      ),
    ];
    const [counted, deleters] = await Promise.all([
      rowCounts(
        this.prisma,
        rows.map((r) => r.id),
      ),
      ids.length
        ? this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: USER_REF_SELECT,
          })
        : Promise.resolve([] as UserRefRow[]),
    ]);
    const byId = new Map(deleters.map((u) => [u.id, u]));
    return rows.map((r) =>
      videoRow(
        this.storage,
        r,
        counted.get(r.id)!,
        r.deletedById ? (byId.get(r.deletedById) ?? null) : null,
      ),
    );
  }
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );

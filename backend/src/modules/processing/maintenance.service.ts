import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { FilesDeleteJob } from '../../infra/queue/queue.types.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  OLD_FILES_GRACE_MS,
  type SourceInfo,
  asMp4,
  editInProgress,
} from '../editor/edit-job.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  smallFrameKey,
  smallThumbKey,
  toPreview,
} from '../videos/video-previews.js';
import { SHEET_VERSION } from './contact-sheet.js';
import { EditRenderService } from './edit-render.service.js';
import { VideoPipelineService } from './video-pipeline.service.js';

const TMP_MAX_AGE_MS = 24 * 3600 * 1000;
/** Kept by the scratch cleanup: fontconfig's cache of the sheet fonts (contact-sheet.ts). */
const TMP_KEEP = new Set(['fontconfig-cache']);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const BACKFILL_BATCH = 20;
/** A video "processing" or "being edited" this long without a word from its job has none. */
const STUCK_AFTER_MS = 15 * 60_000;
/** Runs a video may begin before the watchdog stops handing it to processing again. */
const MAX_PROCESSING_RUNS = 3;
/** The watchdog's failures have no job to tell the owner's shelf through: the notification does. */
const NO_SINK = { updateProgress: async () => undefined };

/** Housekeeping jobs run by the worker on a schedule. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly tmpRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
    private readonly pipeline: VideoPipelineService,
    private readonly render: EditRenderService,
    config: ConfigService<Env, true>,
  ) {
    this.tmpRoot = config.get('WORKER_TMP_DIR', { infer: true });
  }

  /**
   * Videos whose processing stopped without an end: the job was lost (Redis gone between a
   * commit and its enqueue, a video brought back from the trash), or its worker died on it and the
   * queue's own give-up did not get through. Each goes to processing again, or fails once it has
   * begun MAX_PROCESSING_RUNS runs. An edit whose render is gone fails as a failed render does.
   * Uploads that never began are left, unless a browser's upload session shows one was sent.
   */
  async reviveStuck(): Promise<{
    requeued: number;
    failed: number;
    edits: number;
  }> {
    const before = new Date(Date.now() - STUCK_AFTER_MS);
    const done = { requeued: 0, failed: 0, edits: 0 };
    const stuck = await this.prisma.video.findMany({
      where: {
        deletedAt: null,
        updatedAt: { lt: before },
        OR: [
          {
            status: 'PROCESSING',
            OR: [{ stage: null }, { stage: { not: 'EDIT' } }],
          },
          { status: 'QUEUED', processingAttempts: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        authorId: true,
        status: true,
        processingAttempts: true,
        updatedAt: true,
      },
    });
    for (const v of stuck) {
      if (await this.queues.hasProcessingJob(v.id)) continue;
      const data = {
        videoId: v.id,
        userId: v.authorId,
      };
      if (v.processingAttempts >= MAX_PROCESSING_RUNS) {
        const detail = `processing stopped ${v.processingAttempts} times without an end`;
        if (await this.pipeline.abandon(data, NO_SINK, detail)) done.failed++;
        continue;
      }
      // Only as it was found: a job that began meanwhile has it.
      const { count } = await this.prisma.video.updateMany({
        where: { id: v.id, status: v.status, updatedAt: v.updatedAt },
        data: { status: 'QUEUED', stage: null, progress: 0 },
      });
      if (!count) continue;
      await this.queues.enqueueProcessing(data);
      done.requeued++;
    }
    // Uploads from a browser whose job never came — Redis gone between the commit and the enqueue.
    // Never begun, but the session says it was sent.
    const lost = await this.prisma.$queryRaw<
      { id: string; authorId: string }[]
    >`
      SELECT v.id, v."authorId" FROM "Video" v
      JOIN "UploadSession" s ON s."videoId" = v.id AND s.status = 'COMPLETED'
      WHERE v.status = 'QUEUED' AND v."processingAttempts" = 0 AND v."deletedAt" IS NULL
        AND v."updatedAt" < ${before}`;
    for (const v of lost) {
      if (await this.queues.hasProcessingJob(v.id)) continue;
      await this.queues.enqueueProcessing({
        videoId: v.id,
        userId: v.authorId,
      });
      done.requeued++;
    }
    const editing = await this.prisma.video.findMany({
      where: { updatedAt: { lt: before }, editJob: { not: Prisma.DbNull } },
      select: { id: true, editRevision: true, editJob: true },
    });
    for (const v of editing) {
      if (!editInProgress(v.editJob)) continue;
      if (await this.queues.hasEditJob(v.id, v.editRevision)) continue;
      if (
        await this.render.abandon({ videoId: v.id, revision: v.editRevision })
      )
        done.edits++;
    }
    if (done.requeued || done.failed || done.edits)
      this.logger.warn(
        `Stuck videos: ${done.requeued} processed again, ${done.failed} failed, ${done.edits} edit(s) failed`,
      );
    return done;
  }

  /** Abandoned browser uploads: abort in S3, release the quota reservation. */
  async expireUploads(): Promise<number> {
    const n = await this.uploads.expireStale();
    if (n) this.logger.log(`Expired ${n} abandoned upload(s)`);
    return n;
  }

  /** Scratch directories older than a day (crashed jobs). */
  async cleanupTmp(): Promise<number> {
    let removed = 0;
    const entries = await readdir(this.tmpRoot, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (!entry.isDirectory() || TMP_KEEP.has(entry.name)) continue;
      const path = join(this.tmpRoot, entry.name);
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > TMP_MAX_AGE_MS) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    }
    if (removed) this.logger.log(`Removed ${removed} stale scratch dir(s)`);
    return removed;
  }

  /**
   * Nightly: storageUsedBytes = sum of the author's non-deleted originals and
   * of the edited files made from them.
   */
  async reconcileQuotas(): Promise<number> {
    const changed = await this.prisma.$executeRaw`
      UPDATE "User" u
      SET "storageUsedBytes" = COALESCE(v.total, 0)
      FROM (
        SELECT usr.id, (SELECT SUM(vd."sizeBytes" + COALESCE(vd."renderBytes", 0)) FROM "Video" vd WHERE vd."authorId" = usr.id AND vd."deletedAt" IS NULL) AS total
        FROM "User" usr
      ) v
      WHERE v.id = u.id AND u."storageUsedBytes" <> COALESCE(v.total, 0)
    `;
    if (changed)
      this.logger.warn(`Quota reconcile corrected ${changed} account(s)`);
    return changed;
  }

  /**
   * Edits saved while they still kept the original become final, as a save is now:
   * the edited file becomes the video's own, the original and its playback go (hours later, so the
   * editor that may be playing it finishes). Live videos only: a deleted one keeps its files for the
   * admin trash and is baked when it comes back. No-op once done.
   */
  async bakeEdits(): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: { deletedAt: null, renderKey: { not: null } },
      select: { id: true },
    });
    let done = 0;
    for (const { id } of videos) {
      const gone = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Video" WHERE id = ${id}::uuid FOR UPDATE`;
        const v = await tx.video.findUnique({ where: { id } });
        if (!v || v.deletedAt || !v.renderKey || editInProgress(v.editJob))
          return null;
        await tx.video.update({
          where: { id },
          data: {
            originalKey: v.renderKey,
            originalFilename: asMp4(v.originalFilename),
            mimeType: 'video/mp4',
            sizeBytes: v.renderBytes ?? 0n,
            // Hashed again when a block needs it (blocklist backfill).
            originalSha256: null,
            edit: Prisma.DbNull,
            renderKey: null,
            renderBytes: null,
            sourceKeyVersion: null,
            sourceInfo: Prisma.DbNull,
            // A failed save was made against the original: it would not fit any more.
            editJob: Prisma.DbNull,
          },
        });
        await tx.user.update({
          where: { id: v.authorId },
          data: { storageUsedBytes: { decrement: v.sizeBytes } },
        });
        const kept = v.sourceInfo as SourceInfo | null;
        return [
          v.originalKey,
          ...(kept?.hlsPrefix && kept.hlsPrefix !== v.hlsPrefix
            ? [`${kept.hlsPrefix}/`]
            : []),
        ];
      });
      if (!gone) continue;
      await this.queues.enqueueFilesDelete(
        { private: gone, public: [] },
        OLD_FILES_GRACE_MS,
      );
      done++;
    }
    if (done) this.logger.log(`Made ${done} earlier edit(s) final`);
    return done;
  }

  /**
   * Contact sheets of an older design are drawn again (SHEET_VERSION), and so are those without the
   * copy that has no link on it; no-op once done.
   */
  async refreshSheets(): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: {
        deletedAt: null,
        status: 'READY',
        contactSheetKey: { not: null },
        OR: [{ sheetVersion: { lt: SHEET_VERSION } }, { plainSheetKey: null }],
      },
      select: { id: true, authorId: true },
    });
    for (const v of videos)
      await this.queues.enqueueSheet({ videoId: v.id, userId: v.authorId });
    if (videos.length)
      this.logger.log(`Drawing ${videos.length} contact sheet(s) again`);
    return videos.length;
  }

  /**
   * A replaced version's files, hours after the edit that replaced it. Every key is tried;
   * a failure fails the job after the rest, and the queue tries it again (deleting twice is
   * harmless). It stopped at the first error, never came back, and the files stayed in the bucket
   * for good, out of the quota.
   */
  async deleteFiles(job: FilesDeleteJob): Promise<number> {
    let done = 0;
    const failed: string[] = [];
    for (const [bucket, list] of [
      ['private', job.private],
      ['public', job.public],
    ] as const)
      for (const item of list) {
        try {
          if (item.endsWith('/')) await this.storage.deletePrefix(bucket, item);
          else await this.storage.deleteObjects(bucket, [item]);
          done++;
        } catch (err) {
          failed.push(`${bucket}:${item} (${(err as Error).message})`);
        }
      }
    if (failed.length)
      throw new Error(`Files not deleted: ${failed.join('; ')}`);
    return done;
  }

  /**
   * What the player streams, for videos packaged before it was measured: the
   * segments under the current HLS prefix, added up from storage. Until measured, such a video
   * counts against traffic by its file. A video whose segments cannot be read is logged, skipped
   * and tried again on the next worker start.
   */
  async measurePlayback(): Promise<number> {
    let done = 0;
    const failed: string[] = [];
    for (;;) {
      const videos = await this.prisma.video.findMany({
        where: {
          status: 'READY',
          hlsPrefix: { not: null },
          playbackBytes: null,
          purgedAt: null,
          id: { notIn: failed },
        },
        select: { id: true, hlsPrefix: true },
        take: BACKFILL_BATCH,
      });
      if (!videos.length) break;
      for (const video of videos) {
        try {
          const objects = await this.storage.listSizes(
            'private',
            `${video.hlsPrefix!}/`,
          );
          const bytes = objects
            .filter((o) => o.key.endsWith('.ts'))
            .reduce((sum, o) => sum + o.size, 0);
          if (bytes === 0) throw new Error('no segments under the prefix');
          // Only while still unmeasured: a reprocess meanwhile wrote its own number.
          const { count } = await this.prisma.video.updateMany({
            where: { id: video.id, playbackBytes: null },
            data: { playbackBytes: BigInt(bytes) },
          });
          if (count) done++;
        } catch (err) {
          failed.push(video.id);
          this.logger.warn(
            `Playback size of video ${video.id} not measured: ${(err as Error).message}`,
          );
        }
      }
    }
    if (done) this.logger.log(`Measured the playback size of ${done} video(s)`);
    return done;
  }

  /**
   * Small WebP frames and thumbnail for videos processed before they existed.
   * Built from the stored JPEGs, so the original is not touched; a video that fails is logged and
   * skipped (its tiles keep the JPEGs) and retried on the next worker start.
   */
  async backfillPreviews(): Promise<number> {
    let done = 0;
    const failed: string[] = [];
    for (;;) {
      const videos = await this.prisma.video.findMany({
        where: {
          deletedAt: null,
          assetPrefix: { not: null },
          contactSheetKey: { not: null },
          id: { notIn: failed },
          OR: [
            { smallFrames: false },
            { thumbnailKey: { not: null }, thumbnailSmallKey: null },
          ],
        },
        include: { frames: true },
        take: BACKFILL_BATCH,
      });
      if (!videos.length) break;
      for (const video of videos) {
        try {
          await this.backfillVideo(video);
          done++;
        } catch (err) {
          failed.push(video.id);
          this.logger.warn(
            `Previews for video ${video.id} failed: ${(err as Error).message}`,
          );
        }
      }
    }
    if (done) this.logger.log(`Generated small previews for ${done} video(s)`);
    return done;
  }

  private async backfillVideo(video: {
    id: string;
    assetPrefix: string | null;
    thumbnailKey: string | null;
    thumbnailFrameIndex: number | null;
    smallFrames: boolean;
    frames: { index: number; key: string }[];
  }): Promise<void> {
    const prefix = video.assetPrefix!;
    if (!video.smallFrames)
      await this.storage.putMany(
        'public',
        await Promise.all(
          video.frames.map(async (f) => ({
            key: smallFrameKey(prefix, f.index),
            body: await toPreview(
              await this.storage.getBuffer('public', f.key),
            ),
            contentType: 'image/webp',
            cacheControl: IMMUTABLE,
          })),
        ),
        4,
      );
    let thumbnailSmallKey: string | null = null;
    if (video.thumbnailFrameIndex !== null)
      thumbnailSmallKey = smallFrameKey(prefix, video.thumbnailFrameIndex);
    else if (video.thumbnailKey) {
      thumbnailSmallKey = smallThumbKey(video.thumbnailKey);
      await this.storage.put('public', {
        key: thumbnailSmallKey,
        body: await toPreview(
          await this.storage.getBuffer('public', video.thumbnailKey),
        ),
        contentType: 'image/webp',
        cacheControl: IMMUTABLE,
      });
    }
    // The thumbnail may have changed meanwhile: then only the frames are marked and the next pass redoes it.
    const { count } = await this.prisma.video.updateMany({
      where: { id: video.id, thumbnailKey: video.thumbnailKey },
      data: { smallFrames: true, thumbnailSmallKey },
    });
    if (!count)
      await this.prisma.video.update({
        where: { id: video.id },
        data: { smallFrames: true },
      });
  }
}

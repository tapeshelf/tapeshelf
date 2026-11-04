import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import type { Env } from '../../config/env.js';
import { Prisma, type Video } from '../../generated/prisma/client.js';
import type { ProcessingStage } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import type {
  EditProgressEvent,
  EditRenderJob,
  VideoJobResult,
  VideoProgressEvent,
  VideoRemovedEvent,
} from '../../infra/queue/queue.types.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { sha256Of } from '../blocklist/blocklist.service.js';
import {
  createCopyPlaceholder,
  dropCopyPlaceholder,
} from '../editor/edit-copy.js';
import {
  type EditJob,
  type EditJobStatus,
  OLD_FILES_GRACE_MS,
  READY_AGAIN,
  type SourceInfo,
  asMp4,
  editInProgress,
} from '../editor/edit-job.js';
import { planRender, renderArgs } from '../editor/render-plan.js';
import { runHls } from './ffmpeg.js';
import { firstLine, probeFile, type ProbeSummary } from './ffprobe.js';
import { HeavySlots } from './heavy-slots.js';
import {
  type AssetReporter,
  VideoPipelineService,
  probeJson,
} from './video-pipeline.service.js';

/** The pipeline's own limit for the long side (ffmpeg.ts SCALE_FILTER). */
const MAX_LONG_SIDE = 1920;
const FONT_FILE = 'fonts/JetBrainsMono-SemiBold.ttf';
const DB_WRITE_INTERVAL_MS = 2_000;
const CANCEL_CHECK_MS = 3_000;

export interface EditJobContext {
  data: EditRenderJob;
  updateProgress(
    event: EditProgressEvent | VideoProgressEvent | VideoRemovedEvent,
  ): Promise<void>;
}

/**
 * Of an edit's progress, the render's share; the rest is packaging it (frames, HLS, upload), for
 * the same video and for a copy alike.
 */
const RENDER_SHARE = 55;

/** The edit was cancelled, replaced by another, or the video went: the work is thrown away. */
class Stale extends Error {}

/**
 * The worker side of the video editor. A render never touches what people
 * see until it is complete: the new version is made under fresh keys (a new HLS key version, a new
 * asset prefix, its own file), swapped in by one transaction, and the replaced version's files are
 * deleted hours later, so nobody watching is cut off. A failure leaves the video as it was and tells
 * the editor why.
 */
@Injectable()
export class EditRenderService {
  private readonly logger = new Logger(EditRenderService.name);
  private readonly tmpRoot: string;
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly fontFile: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pipeline: VideoPipelineService,
    private readonly outbox: OutboxService,
    private readonly queues: QueueService,
    private readonly slots: HeavySlots,
    config: ConfigService<Env, true>,
  ) {
    this.tmpRoot = config.get('WORKER_TMP_DIR', { infer: true });
    this.ffmpeg = config.get('FFMPEG_PATH', { infer: true });
    this.ffprobe = config.get('FFPROBE_PATH', { infer: true });
    this.fontFile = resolve(
      config.get('ASSETS_DIR', { infer: true }),
      FONT_FILE,
    );
  }

  async run(ctx: EditJobContext): Promise<VideoJobResult> {
    const { videoId, revision } = ctx.data;
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    const job = (video?.editJob ?? null) as EditJob | null;
    const unchanged = {
      videoId,
      userId: video?.authorId ?? '',
      changed: false,
    };
    if (!video || video.editRevision !== revision || !job) return unchanged;
    // Deleted while its edit waited: the edit goes, so the video does not come back from the trash
    // "being edited" and its copy does not stay on the shelf half made.
    if (video.deletedAt) {
      if (editInProgress(job))
        await this.letGo(
          video,
          job,
          revision,
          new EditProgress(this.prisma, ctx, video, job),
        );
      return unchanged;
    }
    // Saved before copies were put on the shelf at once: it is put there now.
    if (job.mode === 'copy' && !job.copyId) {
      job.copyId = await this.prisma.$transaction((tx) =>
        createCopyPlaceholder(tx, video, job.copyTitle ?? video.title),
      );
      await this.prisma.video.updateMany({
        where: { id: videoId, editRevision: revision },
        data: { editJob: job as unknown as Prisma.InputJsonValue },
      });
    }

    const progress = new EditProgress(this.prisma, ctx, video, job);
    const work = join(this.tmpRoot, `edit-${videoId}-${revision}`);
    // What this run uploaded, deleted again if it does not end in the swap.
    const made = { private: [] as string[], public: [] as string[] };
    const abort = new AbortController();
    // A check that fails (the database restarting) is just skipped: an unhandled rejection here
    // used to end the whole worker process, every ffmpeg with it.
    let checking = false;
    const watch = setInterval(() => {
      if (checking) return;
      checking = true;
      this.wanted(videoId, revision, job.copyId)
        .then((ok) => ok || abort.abort())
        .catch(() => undefined)
        .finally(() => (checking = false));
    }, CANCEL_CHECK_MS);
    await mkdir(work, { recursive: true });
    try {
      // A "back to the original" saved before has nothing to go back to any more.
      if (!job.spec) throw new Stale();
      await progress.set('rendering', 0, true);
      // The video as it is now: an edit kept aside before (not baked yet), else its file.
      const original = await this.pipeline.downloadSource(
        video.renderKey ?? video.originalKey,
        Number(video.renderBytes ?? video.sizeBytes),
        join(
          work,
          `original${video.renderKey ? '.mp4' : safeExt(video.originalFilename)}`,
        ),
      );
      const source = await this.probe(original);
      const input = {
        width: source.displayWidth,
        height: source.displayHeight,
        durationSec: source.durationSec,
        hasAudio: !!source.audio,
        hdr: source.hdr,
      };
      const rendered = join(work, 'render.mp4');
      // An ffmpeg without zimg cannot bring HDR to SDR: then the render goes as it is, as an
      // upload's packaging falls back (video-pipeline.service.ts packageHls).
      let failure: unknown = null;
      for (const tonemap of input.hdr ? [true, false] : [true]) {
        const plan = planRender(job.spec!, input, {
          dir: work,
          fontFile: this.fontFile,
          maxLongSide: MAX_LONG_SIDE,
          tonemap,
        });
        for (const f of plan.files)
          await writeFile(join(work, f.name), f.content, 'utf8');
        try {
          await this.slots.run(() =>
            runHls(renderArgs(plan, original, rendered, this.slots.threads), {
              ffmpeg: this.ffmpeg,
              durationSec: plan.output.durationSec,
              onProgress: (f) =>
                void progress.set('rendering', f * RENDER_SHARE),
              signal: abort.signal,
            }),
          );
          failure = null;
          break;
        } catch (err) {
          if (abort.signal.aborted) throw new Stale();
          failure = err;
          this.logger.warn(
            `Video ${videoId}: render${tonemap && input.hdr ? ' (HDR to SDR)' : ''} failed: ${firstLine(err)}`,
          );
        }
      }
      if (failure) throw new RenderFailed(firstLine(failure));
      if (!(await this.wanted(videoId, revision, job.copyId)))
        throw new Stale();
      return job.mode === 'copy'
        ? await this.copy(video, job, rendered, work, progress, made)
        : await this.replace(video, job, rendered, work, progress, made);
    } catch (err) {
      await this.forget(made);
      if (err instanceof Stale) {
        this.logger.log(
          `Video ${videoId}: edit ${revision} dropped (cancelled or replaced)`,
        );
        await this.letGo(video, job, revision, progress);
        return unchanged;
      }
      const code = err instanceof RenderFailed ? 'render' : 'internal';
      this.logger.error(
        `Video ${videoId}: edit ${revision} failed: ${firstLine(err)}`,
      );
      await this.fail(video, job, revision, code, progress);
      return unchanged;
    } finally {
      clearInterval(watch);
      await rm(work, { recursive: true, force: true });
    }
  }

  /**
   * The edit failed: the video stays as it was and is watchable again; a copy being made leaves
   * the shelf. Whoever saved need not have waited in the editor: they are told.
   */
  private async fail(
    video: Video,
    job: EditJob,
    revision: number,
    code: 'render' | 'internal',
    progress: EditProgress,
  ): Promise<void> {
    const failed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.video.updateMany({
        where: { id: video.id, editRevision: revision },
        data: {
          editJob: {
            ...job,
            status: 'failed',
            error: code,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      if (!count) return false;
      if (job.copyId) await dropCopyPlaceholder(tx, job.copyId);
      else
        await tx.video.updateMany({
          where: { id: video.id, stage: 'EDIT' },
          data: READY_AGAIN,
        });
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          {
            userId: job.requestedById,
            type: 'VIDEO_EDIT_FAILED',
            payload: {
              videoId: video.id,
              videoCode: video.code,
              title: video.title,
            },
          },
        ],
      });
      return true;
    });
    await this.outbox.nudge();
    if (failed) await progress.ended(job);
    await progress.emit('failed', 0);
  }

  /**
   * The edit was cancelled, its video or copy deleted, or another edit took its place. What the
   * cancel did not already put back is put back here (a deleted original: its copy goes, and the
   * video is not left "being edited" in the trash).
   */
  private async letGo(
    video: Video,
    job: EditJob,
    revision: number,
    progress: EditProgress,
  ): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.video.updateMany({
        where: { id: video.id, editRevision: revision },
        data: {
          editJob: Prisma.DbNull,
          ...(job.copyId ? {} : READY_AGAIN),
        },
      });
      const dropped = job.copyId
        ? await dropCopyPlaceholder(tx, job.copyId)
        : false;
      return count > 0 || dropped;
    });
    if (changed) await progress.ended(job);
  }

  /**
   * A render the queue gave up on (its worker died twice on it): as a failure, so the video does
   * not stay "being edited" (processing.workers.ts).
   */
  async abandon(data: EditRenderJob): Promise<boolean> {
    const video = await this.prisma.video.findUnique({
      where: { id: data.videoId },
    });
    const job = video?.editJob;
    if (!video || video.editRevision !== data.revision || !editInProgress(job))
      return false;
    await this.fail(
      video,
      job,
      data.revision,
      'internal',
      new EditProgress(
        this.prisma,
        { data, updateProgress: async () => undefined },
        video,
        job,
      ),
    );
    return true;
  }

  /**
   * Into the same video: the render becomes the video — its file, its playback, its frames —
   * and what it was made from goes, the original too. An edit cannot be undone; the next one starts
   * from this version. Whoever began watching the old version finishes it: its files go hours later.
   */
  private async replace(
    video: Video,
    job: EditJob,
    rendered: string,
    work: string,
    progress: EditProgress,
    made: { private: string[]; public: string[] },
  ): Promise<VideoJobResult> {
    const summary = await this.probe(rendered);
    const bytes = (await stat(rendered)).size;
    const tail = progress.band(RENDER_SHARE, 99);
    const assets = await this.pipeline.buildAssets(
      video,
      summary,
      rendered,
      work,
      tail,
      bytes,
    );
    made.public.push(`${assets.prefix}/`);
    const keyVersion =
      Math.max(video.keyVersion, video.sourceKeyVersion ?? 0) + 1;
    // The render is H.264/AAC in SDR with a keyframe every two seconds: it is packaged as it is,
    // never encoded a second time — not even when it is bigger than an upload may be remuxed at
    // (a square from 4K), where an upload would be.
    const packaged = await this.pipeline.packageHls(
      summary,
      'remux',
      rendered,
      work,
      tail,
    );
    const hls = await this.pipeline.encryptAndUpload(
      video,
      packaged,
      summary,
      work,
      tail,
      keyVersion,
    );
    made.private.push(`${hls.prefix}/`);
    const originalKey = `videos/${video.id}/original-${token()}.mp4`;
    await this.storage.put('private', {
      key: originalKey,
      path: rendered,
      contentType: 'video/mp4',
    });
    made.private.push(originalKey);
    // The video's file is known by its hash, as an upload's (a takedown blocks it).
    const sha256 = await sha256Of(createReadStream(rendered));
    const before = video.sizeBytes + (video.renderBytes ?? 0n);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, video.id, job.revision);
      await this.pipeline.writeAssets(tx, video.id, assets);
      await tx.video.update({
        where: { id: video.id },
        data: {
          // Watchable again, in its new version (it was "being edited").
          ...READY_AGAIN,
          keyVersion,
          hlsPrefix: hls.prefix,
          segmentCount: hls.segmentCount,
          playbackBytes: BigInt(hls.bytes),
          width: packaged.width,
          height: packaged.height,
          durationSec: summary.durationSec,
          probe: probeJson(summary, packaged.mode),
          processedAt: new Date(),
          originalKey,
          originalFilename: asMp4(video.originalFilename),
          mimeType: 'video/mp4',
          sizeBytes: BigInt(bytes),
          originalSha256: sha256,
          edit: Prisma.DbNull,
          renderKey: null,
          renderBytes: null,
          editJob: Prisma.DbNull,
          sourceKeyVersion: null,
          sourceInfo: Prisma.DbNull,
        },
      });
      await tx.user.update({
        where: { id: video.authorId },
        data: { storageUsedBytes: { increment: BigInt(bytes) - before } },
      });
      await this.announce(tx, video, job);
    });
    made.private.length = 0;
    made.public.length = 0;
    await this.outbox.nudge();
    // Everything the video was until now: its file and playback, an original an earlier edit kept
    // aside (before), its frames.
    const kept = video.sourceInfo as SourceInfo | null;
    await this.queues.enqueueFilesDelete(
      {
        private: [
          video.originalKey,
          ...(video.renderKey ? [video.renderKey] : []),
          ...(video.hlsPrefix ? [`${video.hlsPrefix}/`] : []),
          ...(kept?.hlsPrefix && kept.hlsPrefix !== video.hlsPrefix
            ? [`${kept.hlsPrefix}/`]
            : []),
        ],
        public: video.assetPrefix ? [`${video.assetPrefix}/`] : [],
      },
      grace(video),
    );
    await progress.ended(job);
    await progress.emit('done', 100);
    return { videoId: video.id, userId: video.authorId, changed: true };
  }

  /**
   * As a new video of the author, made here like the save into the same video: the render is its
   * original, its frames and HLS are made from it at once. The copy has been on the shelf
   * since the save, "being edited", next to the original; now it is filled in and ready.
   */
  private async copy(
    video: Video,
    job: EditJob,
    rendered: string,
    work: string,
    progress: EditProgress,
    made: { private: string[]; public: string[] },
  ): Promise<VideoJobResult> {
    const summary = await this.probe(rendered);
    const bytes = (await stat(rendered)).size;
    const id = job.copyId!;
    const title = job.copyTitle ?? video.title;
    const { code } = await this.prisma.video.findUniqueOrThrow({
      where: { id },
      select: { code: true },
    });
    // The new video as the pipeline's steps see it: its own id (prefixes, the HLS key), title and
    // link (the contact sheet carries them) and first key version.
    const draft: Video = {
      ...video,
      id,
      code,
      title,
      keyVersion: 1,
      assetPrefix: null,
      hlsPrefix: null,
    };
    const tail = progress.band(RENDER_SHARE, 99);
    made.private.push(`videos/${id}/`);
    const assets = await this.pipeline.buildAssets(
      draft,
      summary,
      rendered,
      work,
      tail,
      bytes,
      async () => {
        if (!(await this.wanted(video.id, job.revision, id))) throw new Stale();
      },
    );
    made.public.push(`${assets.prefix}/`);
    // Packaged as it is, as in replace().
    const packaged = await this.pipeline.packageHls(
      summary,
      'remux',
      rendered,
      work,
      tail,
    );
    const hls = await this.pipeline.encryptAndUpload(
      draft,
      packaged,
      summary,
      work,
      tail,
      draft.keyVersion,
    );
    const key = `videos/${id}/original.mp4`;
    await this.storage.put('private', {
      key,
      path: rendered,
      contentType: 'video/mp4',
    });
    // The new video's file is known by its hash like an upload's (a takedown blocks it).
    const sha256 = await sha256Of(createReadStream(rendered));
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, video.id, job.revision);
      const now = new Date();
      const filled = await tx.video.updateMany({
        where: { id, deletedAt: null, stage: 'EDIT' },
        data: {
          ...READY_AGAIN,
          originalKey: key,
          sizeBytes: BigInt(bytes),
          originalSha256: sha256,
          keyVersion: draft.keyVersion,
          hlsPrefix: hls.prefix,
          segmentCount: hls.segmentCount,
          playbackBytes: BigInt(hls.bytes),
          durationSec: summary.durationSec,
          probe: probeJson(summary, packaged.mode),
          processedAt: now,
          readyAt: now,
        },
      });
      // Deleted from the shelf meanwhile: the copy is not wanted.
      if (!filled.count) throw new Stale();
      await this.pipeline.writeAssets(tx, id, assets);
      const created = await tx.video.update({
        where: { id },
        data: { width: packaged.width, height: packaged.height },
        select: { code: true },
      });
      await tx.user.update({
        where: { id: video.authorId },
        data: { storageUsedBytes: { increment: BigInt(bytes) } },
      });
      await tx.video.update({
        where: { id: video.id },
        data: { editJob: Prisma.DbNull },
      });
      // "Ready", as after an upload (the pipeline's process()).
      await this.outbox.emit(tx, 'video.processed', {
        videoId: id,
        code: created.code,
        authorId: video.authorId,
        title,
        notifyFollowers: true,
        private: video.visibility === 'PRIVATE',
      });
    });
    made.private.length = 0;
    made.public.length = 0;
    await this.outbox.nudge();
    await progress.ended(job);
    await progress.emit('done', 100, id);
    // The new video is pushed to the author's lists (VideoEventsRelay).
    return { videoId: id, userId: video.authorId, changed: true };
  }

  /** The row is locked and still wants this edit; otherwise the work is stale. */
  private async claim(
    tx: Prisma.TransactionClient,
    videoId: string,
    revision: number,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      { editRevision: number; deletedAt: Date | null }[]
    >`
      SELECT "editRevision", "deletedAt" FROM "Video" WHERE id = ${videoId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row || row.deletedAt || row.editRevision !== revision)
      throw new Stale();
  }

  /** "Ready" for the author's own edit, as after an upload; a moderator's edit: one word of it. */
  private async announce(
    tx: Prisma.TransactionClient,
    video: Video,
    job: EditJob,
  ): Promise<void> {
    if (job.requestedById === video.authorId)
      await this.outbox.emit(tx, 'video.processed', {
        videoId: video.id,
        code: video.code,
        authorId: video.authorId,
        title: video.title,
        notifyFollowers: false,
      });
    else
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          {
            userId: video.authorId,
            type: 'VIDEO_EDITED',
            payload: {
              videoId: video.id,
              videoCode: video.code,
              title: video.title,
            },
          },
        ],
      });
  }

  /** The edit is still wanted: its video there, its revision current, its copy not deleted. */
  private async wanted(
    videoId: string,
    revision: number,
    copyId?: string,
  ): Promise<boolean> {
    const v = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { editRevision: true, deletedAt: true },
    });
    if (!v || v.deletedAt || v.editRevision !== revision) return false;
    if (!copyId) return true;
    const copy = await this.prisma.video.findUnique({
      where: { id: copyId },
      select: { deletedAt: true },
    });
    return !!copy && !copy.deletedAt;
  }

  private async probe(file: string): Promise<ProbeSummary> {
    const outcome = await probeFile(file, { ffprobe: this.ffprobe });
    if (!outcome.ok)
      throw new RenderFailed(`${outcome.reason}: ${outcome.detail}`);
    return outcome.summary;
  }

  private async forget(made: {
    private: string[];
    public: string[];
  }): Promise<void> {
    for (const [bucket, list] of [
      ['private', made.private],
      ['public', made.public],
    ] as const)
      for (const item of list)
        await (
          item.endsWith('/')
            ? this.storage.deletePrefix(bucket, item)
            : this.storage.deleteObjects(bucket, [item])
        ).catch(() => undefined);
  }
}

class RenderFailed extends Error {}

/**
 * Progress of an edit: `editJob.progress` in the database (the editor polls it) and the tile's
 * progress of the video being edited — or of the copy being made — at most every couple of
 * seconds; a `video.edit` event to the requester's websocket and a `video.progress` one to the
 * author's, whose shelf shows the video as "being edited".
 */
class EditProgress {
  private lastWrite = 0;
  private last = -1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EditJobContext,
    private readonly video: Video,
    private readonly job: EditJob,
  ) {}

  /** The video whose tile shows the edit: the copy being made, or the video itself. */
  private get shown(): string {
    return this.job.copyId ?? this.video.id;
  }

  async set(status: EditJobStatus, pct: number, force = false): Promise<void> {
    // Never backwards, whatever a step's own estimate does.
    const value = Math.max(this.last, Math.min(99, Math.round(pct)), 0);
    if (!force && value === this.last) return;
    this.last = value;
    await this.emit(status, value);
    await this.tell({
      videoId: this.shown,
      userId: this.video.authorId,
      status: 'PROCESSING',
      stage: 'EDIT',
      progress: value,
    });
    const now = Date.now();
    if (!force && now - this.lastWrite < DB_WRITE_INTERVAL_MS) return;
    this.lastWrite = now;
    await this.prisma.video
      .updateMany({
        where: { id: this.video.id, editRevision: this.job.revision },
        data: {
          editJob: {
            ...this.job,
            status,
            progress: value,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
    await this.prisma.video
      .updateMany({
        where: { id: this.shown, stage: 'EDIT' },
        data: { progress: value },
      })
      .catch(() => undefined);
  }

  async emit(
    status: EditProgressEvent['edit']['status'],
    progress: number,
    copyId?: string,
  ): Promise<void> {
    await this.tell({
      videoId: this.video.id,
      userId: this.job.requestedById,
      edit: { status, progress },
      ...(copyId ? { copyId } : {}),
    });
  }

  /** The edit is over: the video is watchable again, or the copy that was not made has gone. */
  async ended(job: EditJob): Promise<void> {
    const author = this.video.authorId;
    const done =
      job.mode === 'copy' &&
      !!job.copyId &&
      !!(await this.prisma.video.findFirst({
        where: { id: job.copyId, status: 'READY' },
        select: { id: true },
      }));
    if (job.mode === 'copy' && job.copyId && !done)
      await this.tell({ videoId: job.copyId, userId: author, removed: true });
    else
      await this.tell({
        videoId: this.shown,
        userId: author,
        status: 'READY',
        stage: null,
        progress: 100,
      });
  }

  /** The pipeline's own stages (frames … upload, 0–100) mapped into `from…to` of the edit. */
  band(from: number, to: number): AssetReporter {
    return {
      report: (_stage: ProcessingStage | null, pct: number) =>
        this.set('rendering', from + ((to - from) * pct) / 100),
    };
  }

  private async tell(
    event: EditProgressEvent | VideoProgressEvent | VideoRemovedEvent,
  ): Promise<void> {
    await this.ctx.updateProgress(event).catch(() => undefined);
  }
}

/** Long enough that anyone who began watching the replaced version can finish it. */
function grace(video: Video): number {
  return Math.max(OLD_FILES_GRACE_MS, (video.durationSec ?? 0) * 2000);
}

function token(): string {
  return randomBytes(8).toString('hex');
}

function safeExt(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

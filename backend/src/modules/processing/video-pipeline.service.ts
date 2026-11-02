import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, statfs } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

import type { Env } from '../../config/env.js';
import type { Prisma, Video } from '../../generated/prisma/client.js';
import type { ProcessingStage } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { BlocklistService, sha256Of } from '../blocklist/blocklist.service.js';
import type {
  ProcessVideoJob,
  ProcessingMode,
  SheetJob,
  ThumbnailJob,
  VideoJobResult,
  VideoProgressEvent,
} from '../../infra/queue/queue.types.js';
import {
  StorageService,
  type PutItem,
} from '../../infra/storage/storage.service.js';
import {
  SHEET_FRAMES,
  SHEET_VERSION,
  configureSheetFonts,
  renderContactSheet,
} from './contact-sheet.js';
import {
  HLS_SEGMENT_SEC,
  buildHlsArgs,
  extractFrame,
  runHls,
} from './ffmpeg.js';
import { FRAME_SLOTS, HeavySlots } from './heavy-slots.js';
import { muxTracks } from './mux.js';
import { readSourceMetadata, stripMetadata } from './source-metadata.js';
import {
  demoRejection,
  firstLine,
  probeDimensions,
  probeFile,
  type ProbeSummary,
} from './ffprobe.js';
import {
  isCustomThumbKey,
  smallFrameKey,
  smallThumbKey,
  toPreview,
} from '../videos/video-previews.js';
import {
  buildPlaylists,
  deriveHlsKey,
  hlsPrefixOf,
  longestSegmentSec,
  segmentCipher,
} from './hls-crypto.js';
import {
  ProgressReporter,
  STAGE_BAND,
  inBand,
  type ProgressSink,
} from './progress-reporter.js';

/** What the pipeline needs from a BullMQ job; tests call it with a plain object. */
export interface JobContext<T> {
  data: T;
  attemptsMade: number;
  maxAttempts: number;
  updateProgress(event: VideoProgressEvent): Promise<void>;
}

/** The file is not acceptable: the video becomes FAILED with this reason (no retry). */
/**
 * The video was deleted (or erased) while it was being processed: the job stops, nothing turns
 * READY, nobody is told, and files uploaded after an erasure are removed again.
 */
class VideoGone extends Error {
  constructor() {
    super('video deleted during processing');
  }
}

export class RejectedError extends Error {
  constructor(
    readonly reason: string,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export const DEFAULT_THUMBNAIL_FRAME = 7;
const FRAME_CONCURRENCY = FRAME_SLOTS;
const UPLOAD_CONCURRENCY = 6;
const TMP_SPACE_FACTOR = 2.5;
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Everything the worker does to a video: probe → frames → sheet → package → encrypt → upload. */
@Injectable()
export class VideoPipelineService {
  private readonly logger = new Logger(VideoPipelineService.name);
  private readonly tmpRoot: string;
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly kek: Buffer;
  private readonly publicUrl: string;
  private readonly siteName: string;
  private readonly demo: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocklist: BlocklistService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
    private readonly slots: HeavySlots,
    config: ConfigService<Env, true>,
  ) {
    this.tmpRoot = config.get('WORKER_TMP_DIR', { infer: true });
    this.ffmpeg = config.get('FFMPEG_PATH', { infer: true });
    this.ffprobe = config.get('FFPROBE_PATH', { infer: true });
    this.kek = Buffer.from(config.get('KEK', { infer: true }), 'hex');
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.siteName = config.get('SITE_NAME', { infer: true });
    this.demo = config.get('DEMO_MODE', { infer: true });
    configureSheetFonts(
      config.get('ASSETS_DIR', { infer: true }),
      this.tmpRoot,
    );
  }

  // ------------------------------------------------------------------ process

  async process(job: JobContext<ProcessVideoJob>): Promise<VideoJobResult> {
    const { videoId, userId } = job.data;
    const result = (changed: boolean): VideoJobResult => ({
      videoId,
      userId,
      changed,
    });
    let video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { frames: { select: { index: true } } },
    });
    if (!video || video.deletedAt) return result(false);
    // The transcode works in a folder of its own: the remux job that handed it over clears its
    // folder after the hand-off, and a shared one lost its segments under ffmpeg.
    const work = join(
      this.tmpRoot,
      job.data.mode === 'transcode' ? `${videoId}-transcode` : videoId,
    );
    await mkdir(work, { recursive: true });
    const reporter = new ProgressReporter(this.prisma, job, videoId, userId);
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'PROCESSING',
        stage: 'PROBE',
        progress: job.data.mode ? STAGE_BAND.PACKAGE[0] : 0,
        failReason: null,
        failDetail: null,
        processingAttempts: { increment: 1 },
      },
    });
    await reporter.report('PROBE', job.data.mode ? STAGE_BAND.PACKAGE[0] : 0, {
      force: true,
    });

    try {
      let original = await this.ensureOriginal(video, work);
      // Video and audio uploaded apart: one file before anything looks at it.
      if (video.audioKey)
        ({ video, original } = await this.muxAudio(video, original, work));
      // A file never processed yet: once it is known to be a video, what it says about itself is
      // kept for the admin and taken out of it, the cleaned file becomes the original.
      // Videos processed before keep theirs.
      if (video.sourceMetadata === null && video.processedAt === null) {
        const raw = await sha256Of(createReadStream(original));
        // Blocks made before the cleaning know a file by its hash as uploaded.
        if (await this.blocklist.isBlocked(raw))
          throw new RejectedError('blocked', `blocklisted sha256 ${raw}`);
        const check = await probeFile(original, { ffprobe: this.ffprobe });
        if (!check.ok) throw new RejectedError(check.reason, check.detail);
        ({ video, original } = await this.cleanOriginal(video, original, work));
      }
      // A file removed for breaking the rules does not come back.
      const sha256 =
        video.originalSha256 ?? (await sha256Of(createReadStream(original)));
      if (!video.originalSha256)
        await this.blocklist.recordHash(videoId, sha256);
      if (await this.blocklist.isBlocked(sha256))
        throw new RejectedError('blocked', `blocklisted sha256 ${sha256}`);
      const outcome = await probeFile(original, { ffprobe: this.ffprobe });
      if (!outcome.ok) throw new RejectedError(outcome.reason, outcome.detail);
      const summary = outcome.summary;
      const overDemo =
        this.demo && !job.data.seed ? demoRejection(summary) : null;
      if (overDemo) throw new RejectedError('demoLimit', overDemo);
      const mode: ProcessingMode = job.data.mode ?? summary.decision;

      const hasAssets =
        video.frames.length === SHEET_FRAMES &&
        !!video.assetPrefix &&
        !!video.contactSheetKey;
      if (!job.data.mode || !hasAssets)
        await this.generateAssets(video, summary, original, work, reporter);

      if (mode === 'transcode' && job.data.mode !== 'transcode') {
        // Hand the CPU-bound part to the transcode queue so short remux jobs are not stuck behind it.
        await this.prisma.video.update({
          where: { id: videoId },
          data: {
            status: 'QUEUED',
            stage: null,
            progress: STAGE_BAND.PACKAGE[0],
            durationSec: summary.durationSec,
            probe: probeJson(summary, mode),
          },
        });
        await reporter.report(null, STAGE_BAND.PACKAGE[0], {
          force: true,
          status: 'QUEUED',
        });
        // The transcode job downloads the original again. Kept here, the originals of every video
        // waiting for a transcode filled the scratch disk, and new uploads failed with "insufficient
        // scratch space" instead of waiting. Cleared before
        // the hand-off: cleared after it, an idle transcode worker had already begun.
        await rm(work, { recursive: true, force: true });
        await this.queues.enqueueProcessing({
          ...job.data,
          mode: 'transcode',
        });
        return result(true);
      }

      const packaged = await this.packageHls(
        summary,
        mode,
        original,
        work,
        reporter,
      );
      await this.assertAlive(videoId);
      const hls = await this.encryptAndUpload(
        video,
        packaged,
        summary,
        work,
        reporter,
      );
      // READY and the "processed" event commit together: no notification without the state.
      await this.prisma.$transaction(async (tx) => {
        // processedAt is set on every successful run: still null means this is the first READY.
        const before = await tx.video.findUniqueOrThrow({
          where: { id: videoId },
          select: { processedAt: true, visibility: true, deletedAt: true },
        });
        if (before.deletedAt) throw new VideoGone();
        const now = new Date();
        const updated = await tx.video.update({
          where: { id: videoId },
          data: {
            status: 'READY',
            stage: null,
            progress: 100,
            durationSec: summary.durationSec,
            width: packaged.width,
            height: packaged.height,
            probe: probeJson(summary, packaged.mode),
            hlsPrefix: hls.prefix,
            segmentCount: hls.segmentCount,
            processedAt: now,
            // Its place in "What's new": when it first appeared, not when it was redone.
            ...(before.processedAt === null ? { readyAt: now } : {}),
            failReason: null,
            failDetail: null,
          },
          select: { title: true, authorId: true, code: true },
        });
        await this.outbox.emit(tx, 'video.processed', {
          videoId,
          code: updated.code,
          authorId: updated.authorId,
          title: updated.title,
          notifyFollowers: before.processedAt === null,
          private: before.visibility === 'PRIVATE',
        });
      });
      await this.outbox.nudge();
      await reporter.report(null, 100, { force: true, status: 'READY' });
      if (video.hlsPrefix && video.hlsPrefix !== hls.prefix)
        await this.storage
          .deletePrefix('private', `${video.hlsPrefix}/`)
          .catch(() => undefined);
      await rm(work, { recursive: true, force: true });
      return result(true);
    } catch (err) {
      if (err instanceof VideoGone) {
        await this.dropAfterErasure(videoId);
        await rm(work, { recursive: true, force: true });
        return result(false);
      }
      if (err instanceof RejectedError) {
        await this.fail(videoId, err.reason, err.detail, reporter);
        await rm(work, { recursive: true, force: true });
        return result(true);
      }
      const final = job.attemptsMade + 1 >= job.maxAttempts;
      this.logger.error(
        `Video ${videoId}: processing error (attempt ${job.attemptsMade + 1}/${job.maxAttempts}): ${firstLine(err)}`,
      );
      if (!final) throw err;
      await this.fail(videoId, 'internal', firstLine(err), reporter);
      await rm(work, { recursive: true, force: true });
      return result(true);
    }
  }

  // ---------------------------------------------------------------- thumbnail

  /** Custom thumbnail at an arbitrary second; reads the original straight from S3. */
  async thumbnail(job: JobContext<ThumbnailJob>): Promise<VideoJobResult> {
    const { videoId, userId, timestampSec } = job.data;
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video || video.deletedAt || !video.assetPrefix)
      return { videoId, userId, changed: false };
    const work = join(this.tmpRoot, `thumb-${videoId}-${Date.now()}`);
    await mkdir(work, { recursive: true });
    try {
      const out = join(work, 'thumb.jpg');
      const t = Math.min(
        Math.max(0, timestampSec),
        Math.max(0, (video.durationSec ?? 0) - 0.05),
      );
      // An edited video is seen as its render: the second is on its timeline.
      const source = video.renderKey ?? video.originalKey;
      try {
        const url = await this.storage.presignGetInternal(
          'private',
          source,
          900,
        );
        await this.slots.frame(() =>
          extractFrame(url, t, out, {
            ffmpeg: this.ffmpeg,
            threads: this.slots.threads,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Video ${videoId}: thumbnail from S3 URL failed (${firstLine(err)}), downloading`,
        );
        const local = video.renderKey
          ? await this.downloadSource(
              video.renderKey,
              Number(video.renderBytes ?? 0),
              join(work, 'render.mp4'),
            )
          : await this.ensureOriginal(video, work);
        await this.slots.frame(() =>
          extractFrame(local, t, out, {
            ffmpeg: this.ffmpeg,
            threads: this.slots.threads,
          }),
        );
      }
      const key = `${video.assetPrefix}/thumb-${token()}.jpg`;
      const smallKey = smallThumbKey(key);
      await this.storage.putMany(
        'public',
        [
          {
            key,
            path: out,
            contentType: 'image/jpeg',
            cacheControl: IMMUTABLE,
          },
          {
            key: smallKey,
            body: await toPreview(out),
            contentType: 'image/webp',
            cacheControl: IMMUTABLE,
          },
        ],
        2,
      );
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailKey: key,
          thumbnailSmallKey: smallKey,
          thumbnailFrameIndex: null,
        },
      });
      const stale = [video.thumbnailKey, video.thumbnailSmallKey].filter(
        isCustomThumbKey,
      );
      if (stale.length)
        await this.storage
          .deleteObjects('public', stale)
          .catch(() => undefined);
      return { videoId, userId, changed: true };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  // -------------------------------------------------------------------- sheet

  /** Re-renders the contact sheet from the stored frames (title changed). */
  async sheet(job: JobContext<SheetJob>): Promise<VideoJobResult> {
    const { videoId, userId } = job.data;
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { frames: { orderBy: { index: 'asc' } } },
    });
    if (
      !video ||
      video.deletedAt ||
      !video.assetPrefix ||
      video.frames.length < SHEET_FRAMES
    )
      return { videoId, userId, changed: false };
    const frames = await Promise.all(
      video.frames.map((f) => this.storage.getBuffer('public', f.key)),
    );
    const input = {
      frames,
      title: video.title,
      sizeBytes: Number(video.sizeBytes),
      durationSec: video.durationSec ?? 0,
      width: video.width ?? 0,
      height: video.height ?? 0,
      siteName: this.siteName,
    };
    const [sheet, plain] = await Promise.all([
      renderContactSheet({ ...input, link: this.videoLink(video.code) }),
      renderContactSheet({ ...input, link: '' }),
    ]);
    const key = `${video.assetPrefix}/sheet-${token()}.jpg`;
    const plainKey = `${video.assetPrefix}/sheet-${token()}.jpg`;
    await this.storage.putMany(
      'public',
      [
        { key, body: sheet.jpeg },
        { key: plainKey, body: plain.jpeg },
      ].map((i) => ({
        ...i,
        contentType: 'image/jpeg',
        cacheControl: IMMUTABLE,
      })),
      UPLOAD_CONCURRENCY,
    );
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        contactSheetKey: key,
        plainSheetKey: plainKey,
        sheetVersion: SHEET_VERSION,
      },
    });
    const old = [video.contactSheetKey, video.plainSheetKey].filter(
      (k): k is string => !!k,
    );
    if (old.length)
      await this.storage.deleteObjects('public', old).catch(() => undefined);
    return { videoId, userId, changed: true };
  }

  // ------------------------------------------------------------------ helpers

  /** The video's short link, tapeshelf.com/<code>, printed on its contact sheet. */
  private videoLink(code: string): string {
    return `${this.publicUrl}/${code}`;
  }

  /** Downloads the original into the work dir unless a complete copy is already there (transcode hand-off). */
  /**
   * The original without its metadata: its tags are kept in Video.sourceMetadata, the file
   * is rebuilt without them and stored in its place, the size and the author's used space follow.
   * The same file always comes out the same, so the hash taken afterwards keeps the blocklist
   * working.
   */
  private async cleanOriginal<V extends Video>(
    video: V,
    original: string,
    work: string,
  ): Promise<{ video: V; original: string }> {
    const metadata = await readSourceMetadata(original, {
      ffprobe: this.ffprobe,
    });
    const clean = await stripMetadata(original, work, {
      ffmpeg: this.ffmpeg,
      threads: this.slots.threads,
    });
    const size = BigInt((await stat(clean.file)).size);
    const changes = {
      sizeBytes: size,
      sourceMetadata: metadata as unknown as Prisma.InputJsonValue,
      ...(clean.containerChanged
        ? {
            originalKey: `videos/${video.id}/original.mkv`,
            originalFilename: `${video.originalFilename.replace(/\.[^./\\]*$/, '')}.mkv`,
            mimeType: 'video/x-matroska',
          }
        : {}),
    };
    await this.storage.put('private', {
      key: changes.originalKey ?? video.originalKey,
      path: clean.file,
      contentType:
        changes.mimeType ?? video.mimeType ?? 'application/octet-stream',
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.video.update({ where: { id: video.id }, data: changes });
      if (size !== video.sizeBytes)
        await tx.user.update({
          where: { id: video.authorId },
          data: { storageUsedBytes: { increment: size - video.sizeBytes } },
        });
    });
    if (clean.containerChanged)
      await this.storage
        .deleteObjects('private', [video.originalKey])
        .catch(() => undefined);
    const path = join(work, `original${clean.ext}`);
    await rm(original, { force: true });
    await rename(clean.file, path);
    return {
      video: {
        ...video,
        ...changes,
        sourceMetadata: metadata as unknown as Prisma.JsonValue,
      },
      original: path,
    };
  }

  /**
   * The audio of a two-track upload muxed into the original without re-encoding: the
   * result replaces the original in storage, the audio file goes, and the shelf is charged for what
   * is kept. A pair that cannot be muxed fails the video like a broken file.
   */
  private async muxAudio<V extends Video>(
    video: V,
    original: string,
    work: string,
  ): Promise<{ video: V; original: string }> {
    const audioKey = video.audioKey!;
    const audio = await this.downloadSource(
      audioKey,
      Number(video.audioSizeBytes ?? 0),
      join(work, `audio${safeExt(audioKey)}`),
    );
    let muxed: { file: string; ext: '.mp4' | '.mkv' };
    try {
      muxed = await muxTracks(original, audio, work, {
        ffmpeg: this.ffmpeg,
        threads: this.slots.threads,
      });
    } catch (err) {
      throw new RejectedError('corrupted', String(err));
    }
    const size = BigInt((await stat(muxed.file)).size);
    const before = video.sizeBytes + (video.audioSizeBytes ?? 0n);
    const changes = {
      originalKey: `videos/${video.id}/original${muxed.ext}`,
      originalFilename: `${video.originalFilename.replace(/\.[^./\\]*$/, '')}${muxed.ext}`,
      mimeType: muxed.ext === '.mp4' ? 'video/mp4' : 'video/x-matroska',
      sizeBytes: size,
      uploadedSize: size,
      audioKey: null,
      audioSizeBytes: null,
    };
    await this.storage.put('private', {
      key: changes.originalKey,
      path: muxed.file,
      contentType: changes.mimeType,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.video.update({ where: { id: video.id }, data: changes });
      if (size !== before)
        await tx.user.update({
          where: { id: video.authorId },
          data: { storageUsedBytes: { increment: size - before } },
        });
    });
    await this.storage
      .deleteObjects(
        'private',
        [audioKey, video.originalKey].filter((k) => k !== changes.originalKey),
      )
      .catch(() => undefined);
    const path = join(work, `original${muxed.ext}`);
    await rm(original, { force: true });
    await rm(audio, { force: true });
    await rename(muxed.file, path);
    return { video: { ...video, ...changes }, original: path };
  }

  private ensureOriginal(video: Video, work: string): Promise<string> {
    return this.downloadSource(
      video.originalKey,
      Number(video.sizeBytes),
      join(work, `original${safeExt(video.originalFilename)}`),
    );
  }

  /** A private object into `path` (kept when already complete), if the scratch disk has room for the work. */
  async downloadSource(
    key: string,
    size: number,
    path: string,
  ): Promise<string> {
    const existing = await stat(path).catch(() => null);
    if (existing && existing.size === size) return path;
    const fs = await statfs(this.tmpRoot);
    const free = Number(fs.bavail) * Number(fs.bsize);
    if (free < size * TMP_SPACE_FACTOR)
      throw new Error(
        `insufficient scratch space: ${Math.round(free / 1e6)} MB free, need ${Math.round((size * TMP_SPACE_FACTOR) / 1e6)} MB`,
      );
    await this.storage.downloadToFile('private', key, path);
    return path;
  }

  /** 16 frames + contact sheet → public bucket under a fresh random prefix; frames rows replaced. */
  private async generateAssets(
    video: Video,
    summary: ProbeSummary,
    original: string,
    work: string,
    reporter: ProgressReporter,
  ): Promise<void> {
    const set = await this.buildAssets(
      video,
      summary,
      original,
      work,
      reporter,
      Number(video.sizeBytes),
    );
    await this.prisma.$transaction((tx) => this.writeAssets(tx, video.id, set));
    if (video.assetPrefix && video.assetPrefix !== set.prefix)
      await this.storage
        .deletePrefix('public', `${video.assetPrefix}/`)
        .catch(() => undefined);
    // Renamed while the frames were being made (the upload panel offers it at once): the
    // sheet carries the title, so it is drawn again.
    const now = await this.prisma.video.findUnique({
      where: { id: video.id },
      select: { title: true },
    });
    if (now && now.title !== video.title)
      await this.queues.enqueueSheet({
        videoId: video.id,
        userId: video.authorId,
      });
  }

  /**
   * The 16 frames, their small copies and the contact sheet of `file`, uploaded under a fresh
   * prefix; nothing is written to the database (`writeAssets` does that, in the caller's
   * transaction, so an edit can swap them in together with its HLS). `alive` is checked
   * before the upload: by default that the video is still there; an editor's copy, which has no
   * row yet, checks its edit instead.
   */
  async buildAssets(
    video: Video,
    summary: ProbeSummary,
    original: string,
    work: string,
    reporter: AssetReporter,
    sizeBytes: number,
    alive: () => Promise<void> = () => this.assertAlive(video.id),
  ): Promise<AssetSet> {
    await reporter.report('FRAMES', inBand('FRAMES', 0), { force: true });
    const framesDir = join(work, 'frames');
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });
    const D = summary.durationSec;
    const times = Array.from(
      { length: SHEET_FRAMES },
      (_, i) => (D * (i + 0.5)) / SHEET_FRAMES,
    );
    let done = 0;
    const pending = times.map((t, i) => ({ t, i }));
    await Promise.all(
      Array.from({ length: FRAME_CONCURRENCY }, async () => {
        for (let item = pending.shift(); item; item = pending.shift()) {
          // The worker's frame slots are shared by every job, and so is the thread budget.
          await this.slots.frame(() =>
            extractFrame(original, item.t, join(framesDir, `f${item.i}.jpg`), {
              ffmpeg: this.ffmpeg,
              threads: this.slots.frameThreads,
            }),
          );
          done++;
          await reporter.report(
            'FRAMES',
            inBand('FRAMES', done / SHEET_FRAMES),
          );
        }
      }),
    );
    const buffers = await Promise.all(
      times.map((_, i) => readFile(join(framesDir, `f${i}.jpg`))),
    );
    const meta = await sharp(buffers[0]).metadata();
    const frameW = meta.width ?? 0;
    const frameH = meta.height ?? 0;

    await reporter.report('SHEET', inBand('SHEET', 0), { force: true });
    const input = {
      frames: buffers,
      title: video.title,
      sizeBytes,
      durationSec: D,
      width: summary.displayWidth,
      height: summary.displayHeight,
      siteName: this.siteName,
    };
    // The same sheet without the link, for where the author goes by an anonymous link.
    const [sheet, plain] = await Promise.all([
      renderContactSheet({ ...input, link: this.videoLink(video.code) }),
      renderContactSheet({ ...input, link: '' }),
    ]);
    const prefix = `v/${video.id}/${token()}`;
    const frameKey = (i: number) =>
      `${prefix}/f${String(i).padStart(2, '0')}.jpg`;
    const sheetKey = `${prefix}/sheet-${token()}.jpg`;
    const plainSheetKey = `${prefix}/sheet-${token()}.jpg`;
    const smalls = await Promise.all(buffers.map((b) => toPreview(b)));
    const items: PutItem[] = buffers.map((body, i) => ({
      key: frameKey(i),
      body,
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE,
    }));
    items.push(
      ...smalls.map((body, i) => ({
        key: smallFrameKey(prefix, i),
        body,
        contentType: 'image/webp',
        cacheControl: IMMUTABLE,
      })),
    );
    items.push(
      ...[
        { key: sheetKey, body: sheet.jpeg },
        { key: plainSheetKey, body: plain.jpeg },
      ].map((i) => ({
        ...i,
        contentType: 'image/jpeg',
        cacheControl: IMMUTABLE,
      })),
    );
    await alive();
    await this.storage.putMany('public', items, UPLOAD_CONCURRENCY);
    await reporter.report('SHEET', inBand('SHEET', 1));
    await rm(framesDir, { recursive: true, force: true });
    return {
      prefix,
      sheetKey,
      plainSheetKey,
      frames: times.map((t, i) => ({
        index: i,
        timestampSec: t,
        key: frameKey(i),
        width: frameW,
        height: frameH,
      })),
      width: summary.displayWidth,
      height: summary.displayHeight,
      durationSec: D,
    };
  }

  /** Puts a set of assets on the video: frame rows replaced, default thumbnail (frame 7). */
  async writeAssets(
    tx: Prisma.TransactionClient,
    videoId: string,
    set: AssetSet,
  ): Promise<void> {
    await tx.videoFrame.deleteMany({ where: { videoId } });
    await tx.videoFrame.createMany({
      data: set.frames.map((f) => ({ videoId, ...f })),
    });
    await tx.video.update({
      where: { id: videoId },
      data: {
        assetPrefix: set.prefix,
        contactSheetKey: set.sheetKey,
        plainSheetKey: set.plainSheetKey,
        sheetVersion: SHEET_VERSION,
        thumbnailKey: set.frames[DEFAULT_THUMBNAIL_FRAME]!.key,
        thumbnailSmallKey: smallFrameKey(set.prefix, DEFAULT_THUMBNAIL_FRAME),
        thumbnailFrameIndex: DEFAULT_THUMBNAIL_FRAME,
        smallFrames: true,
        width: set.width,
        height: set.height,
        durationSec: set.durationSec,
      },
    });
  }

  /** Throws VideoGone when the video was deleted or erased meanwhile. */
  private async assertAlive(videoId: string): Promise<void> {
    const v = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { deletedAt: true, purgedAt: true },
    });
    if (!v || v.deletedAt || v.purgedAt) throw new VideoGone();
  }

  /**
   * A deleted video's files stay for the trash; an erased one's must go: whatever this
   * job uploaded after the erasure is removed again.
   */
  private async dropAfterErasure(videoId: string): Promise<void> {
    const v = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { purgedAt: true },
    });
    this.logger.log(`Video ${videoId}: deleted during processing, job stopped`);
    if (v && !v.purgedAt) return;
    await this.storage
      .deletePrefix('private', `videos/${videoId}/`)
      .catch(() => undefined);
    await this.storage
      .deletePrefix('public', `v/${videoId}/`)
      .catch(() => undefined);
  }

  /** ffmpeg → plain MPEG-TS segments. A failed remux is retried as a transcode; HDR falls back to no tonemap. */
  async packageHls(
    summary: ProbeSummary,
    mode: ProcessingMode,
    original: string,
    work: string,
    reporter: AssetReporter,
  ): Promise<{
    plainDir: string;
    width: number;
    height: number;
    mode: ProcessingMode;
  }> {
    await reporter.report('PACKAGE', inBand('PACKAGE', 0), { force: true });
    const plainDir = join(work, 'plain');
    const plans: { mode: ProcessingMode; tonemap: boolean }[] =
      mode === 'remux'
        ? [
            { mode: 'remux', tonemap: false },
            { mode: 'transcode', tonemap: true },
          ]
        : [{ mode: 'transcode', tonemap: true }];
    if (summary.hdr) plans.push({ mode: 'transcode', tonemap: false });

    let lastError: unknown = null;
    let effective: ProcessingMode = mode;
    for (const plan of plans) {
      await rm(plainDir, { recursive: true, force: true });
      await mkdir(plainDir, { recursive: true });
      try {
        const run = () =>
          runHls(
            buildHlsArgs(original, plainDir, {
              mode: plan.mode,
              summary,
              tonemap: plan.tonemap,
              threads: this.slots.threads,
            }),
            {
              ffmpeg: this.ffmpeg,
              durationSec: summary.durationSec,
              onProgress: (f) =>
                void reporter.report('PACKAGE', inBand('PACKAGE', f)),
            },
          );
        // A remux only copies streams; a transcode decodes and encodes and waits for a slot.
        await (plan.mode === 'transcode' ? this.slots.run(run) : run());
        // Remuxed segments follow the source's keyframes: rare ones make segments of minutes
        // (and of gigabytes) that seek badly, so that source is encoded instead.
        if (plan.mode === 'remux') {
          const longest = longestSegmentSec(
            await readFile(join(plainDir, 'index.m3u8'), 'utf8'),
          );
          if (longest > HLS_SEGMENT_SEC * 3)
            throw new Error(`remux made a ${Math.round(longest)} s segment`);
        }
        effective = plan.mode;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `${plan.mode}${plan.tonemap ? '+tonemap' : ''} failed: ${firstLine(err)}`,
        );
      }
    }
    if (lastError)
      throw new RejectedError('transcodeFailed', firstLine(lastError));
    const dims = (await probeDimensions(join(plainDir, 'seg_00000.ts'), {
      ffprobe: this.ffprobe,
    })) ?? {
      width: summary.displayWidth,
      height: summary.displayHeight,
    };
    return { plainDir, ...dims, mode: effective };
  }

  /**
   * AES-128-CBC per segment (IV = sequence number), playlists, parallel upload to the private bucket,
   * under the prefix and key of `keyVersion` (an edit renders under a new one).
   */
  async encryptAndUpload(
    video: Video,
    packaged: { plainDir: string; width: number; height: number },
    summary: ProbeSummary,
    work: string,
    reporter: AssetReporter,
    keyVersion = video.keyVersion,
  ): Promise<{ prefix: string; segmentCount: number }> {
    await reporter.report('ENCRYPT', inBand('ENCRYPT', 0), { force: true });
    const key = deriveHlsKey(this.kek, video.id, keyVersion);
    const plainIndex = await readFile(
      join(packaged.plainDir, 'index.m3u8'),
      'utf8',
    );
    const { segments } = buildPlaylists(plainIndex, {
      bandwidth: 0,
      width: 0,
      height: 0,
    });
    if (segments.length === 0)
      throw new RejectedError('transcodeFailed', 'ffmpeg produced no segments');
    const encDir = join(work, 'enc');
    await rm(encDir, { recursive: true, force: true });
    await mkdir(encDir, { recursive: true });
    let bytes = 0;
    for (const [seq, name] of segments.entries()) {
      // Streamed, and the plain segment gone once encrypted: a whole segment (up to gigabytes
      // from a file with rare keyframes) was read into memory twice, and the scratch disk held
      // both copies of the video.
      const plain = join(packaged.plainDir, name);
      const out = join(encDir, name);
      await pipeline(
        createReadStream(plain),
        segmentCipher(key, seq),
        createWriteStream(out),
      );
      await rm(plain, { force: true });
      bytes += (await stat(out)).size;
      await reporter.report(
        'ENCRYPT',
        inBand('ENCRYPT', (seq + 1) / segments.length),
      );
    }
    const { index, master } = buildPlaylists(plainIndex, {
      bandwidth: (bytes * 8) / Math.max(1, summary.durationSec),
      width: packaged.width,
      height: packaged.height,
    });
    await rm(packaged.plainDir, { recursive: true, force: true });

    await reporter.report('UPLOAD', inBand('UPLOAD', 0), { force: true });
    const prefix = hlsPrefixOf(video.id, keyVersion);
    const items: PutItem[] = segments.map((name) => ({
      key: `${prefix}/${name}`,
      path: join(encDir, name),
      contentType: 'video/mp2t',
    }));
    let done = 0;
    await this.storage.putMany(
      'private',
      items,
      UPLOAD_CONCURRENCY,
      async () => {
        done++;
        await reporter.report(
          'UPLOAD',
          inBand('UPLOAD', done / (items.length + 1)),
        );
      },
    );
    await this.storage.putMany('private', [
      {
        key: `${prefix}/index.m3u8`,
        body: index,
        contentType: 'application/vnd.apple.mpegurl',
      },
      {
        key: `${prefix}/master.m3u8`,
        body: master,
        contentType: 'application/vnd.apple.mpegurl',
      },
    ]);
    return { prefix, segmentCount: segments.length };
  }

  /**
   * A job the queue gave up on without letting it end: its worker died on it more often than the
   * queue allows (deploys during a long transcode, the worker out of memory), or it threw on its
   * last attempt outside the run's own error handling. The video fails as a failed run would; one
   * that went on meanwhile — ready, deleted, under an edit, taken by another job — is left.
   */
  async abandon(
    data: ProcessVideoJob,
    sink: ProgressSink,
    detail: string,
  ): Promise<boolean> {
    const video = await this.prisma.video.findUnique({
      where: { id: data.videoId },
      select: { status: true, stage: true, deletedAt: true },
    });
    if (
      !video ||
      video.deletedAt ||
      video.stage === 'EDIT' ||
      (video.status !== 'QUEUED' && video.status !== 'PROCESSING') ||
      (await this.queues.hasProcessingJob(data.videoId))
    )
      return false;
    await this.fail(
      data.videoId,
      'internal',
      detail,
      new ProgressReporter(this.prisma, sink, data.videoId, data.userId),
    );
    return true;
  }

  private async fail(
    videoId: string,
    reason: string,
    detail: string,
    reporter: ProgressReporter,
  ): Promise<void> {
    this.logger.warn(`Video ${videoId} failed: ${reason} (${detail})`);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.video.update({
        where: { id: videoId },
        data: {
          status: 'FAILED',
          stage: null,
          failReason: reason,
          failDetail: detail.slice(0, 2000),
        },
        select: { title: true, authorId: true },
      });
      await this.outbox.emit(tx, 'video.failed', {
        videoId,
        authorId: updated.authorId,
        title: updated.title,
        reason,
      });
    });
    await this.outbox.nudge();
    await reporter.report(null, 0, { force: true, status: 'FAILED' });
  }
}

function token(): string {
  return randomBytes(8).toString('hex');
}

function safeExt(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/** What we keep in Video.probe for admins and later decisions. */
export function probeJson(
  summary: ProbeSummary,
  mode: ProcessingMode,
): Prisma.InputJsonValue {
  return {
    mode,
    decision: summary.decision,
    reasons: summary.reasons,
    durationSec: summary.durationSec,
    streams: summary.streams,
    hdr: summary.hdr,
    video: { ...summary.video },
    audio: summary.audio ? { ...summary.audio } : null,
  };
}

/** What the asset and packaging steps report to: the processing reporter or an edit's. */
export interface AssetReporter {
  report(
    stage: ProcessingStage | null,
    progress: number,
    opts?: { force?: boolean },
  ): Promise<void>;
}

/** Frames, small copies and the contact sheet of one version, uploaded but not yet on the video. */
export interface AssetSet {
  prefix: string;
  sheetKey: string;
  /** The sheet without the link printed on it. */
  plainSheetKey: string;
  frames: {
    index: number;
    timestampSec: number;
    key: string;
    width: number;
    height: number;
  }[];
  width: number;
  height: number;
  durationSec: number;
}

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { validateEnv } from '../src/config/env.js';
import { PrismaModule } from '../src/infra/prisma/prisma.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueModule } from '../src/infra/queue/queue.module.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import type { VideoProgressEvent } from '../src/infra/queue/queue.types.js';
import { RedisModule } from '../src/infra/redis/redis.module.js';
import { StorageModule } from '../src/infra/storage/storage.module.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { SHEET_WIDTH } from '../src/modules/processing/contact-sheet.js';
import {
  decryptSegment,
  deriveHlsKey,
} from '../src/modules/processing/hls-crypto.js';
import { BlocklistModule } from '../src/modules/blocklist/blocklist.module.js';
import { MaintenanceService } from '../src/modules/processing/maintenance.service.js';
import { PipelineModule } from '../src/modules/processing/pipeline.module.js';
import { VideoPipelineService } from '../src/modules/processing/video-pipeline.service.js';
import { readSourceMetadata } from '../src/modules/processing/source-metadata.js';
import { BillingModule } from '../src/modules/billing/billing.module.js';
import { PlansModule } from '../src/modules/plans/plans.module.js';
import { TrafficModule } from '../src/modules/traffic/traffic.module.js';
import { SettingsModule } from '../src/modules/settings/settings.module.js';
import { VideosService } from '../src/modules/videos/videos.service.js';
import { VideosModule } from '../src/modules/videos/videos.module.js';
import {
  PREVIEW_WIDTH,
  smallFrameKey,
} from '../src/modules/videos/video-previews.js';
import { OutboxModule } from '../src/infra/outbox/outbox.module.js';
import { ensureFixtures, type FixtureName } from './utils/fixtures.js';

const fixtures = ensureFixtures();
const KEK = Buffer.from(process.env['KEK']!, 'hex');

describe('video processing pipeline (worker)', () => {
  let ctx: INestApplicationContext;
  let prisma: PrismaService;
  let storage: StorageService;
  let queues: QueueService;
  let pipeline: VideoPipelineService;
  let videos: VideosService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.test'],
          // Only validated values: an empty variable (compose passes `${VAR:-}`) is "not set", not ''.
          skipProcessEnv: true,
        }),
        PrismaModule,
        RedisModule,
        StorageModule,
        QueueModule,
        OutboxModule,
        SettingsModule,
        PlansModule,
        TrafficModule,
        BillingModule,
        BlocklistModule,
        PipelineModule,
        VideosModule,
      ],
      providers: [],
    }).compile();
    ctx = await moduleRef.createNestApplication().init();
    prisma = ctx.get(PrismaService);
    storage = ctx.get(StorageService);
    queues = ctx.get(QueueService);
    pipeline = ctx.get(VideoPipelineService);
    videos = ctx.get(VideosService);
    await prisma.video.deleteMany();
    await prisma.user.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await queues.transcode.obliterate({ force: true }).catch(() => undefined);
    userId = (
      await prisma.user.create({
        data: {
          email: 'worker@example.com',
          username: 'worker',
          displayName: 'Worker',
          emailVerifiedAt: new Date(),
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await ctx.close();
  });

  async function seed(name: FixtureName, title = `Fixture ${name}`) {
    const path = fixtures[name];
    const ext = name === 'vp9' ? '.mkv' : name === 'notvideo' ? '.bin' : '.mp4';
    const video = await prisma.video.create({
      data: {
        authorId: userId,
        title,
        originalKey: 'pending',
        originalFilename: `${name}${ext}`,
        sizeBytes: BigInt(statSync(path).size),
        holdings: { create: { holderId: userId, source: 'AUTHOR' } },
      },
    });
    const originalKey = `videos/${video.id}/original${ext}`;
    await storage.put('private', {
      key: originalKey,
      path,
      contentType: 'video/mp4',
    });
    return prisma.video.update({
      where: { id: video.id },
      data: { originalKey },
    });
  }

  async function run(videoId: string, mode?: 'remux' | 'transcode') {
    const events: VideoProgressEvent[] = [];
    const result = await pipeline.process({
      data: { videoId, userId, mode },
      attemptsMade: 0,
      maxAttempts: 1,
      updateProgress: async (e) => {
        events.push(e);
      },
    });
    const video = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
      include: { frames: true },
    });
    return { result, events, video };
  }

  /** Decrypts the first segment with the derived key and probes it: proves the key schedule end to end. */
  async function probeFirstSegment(
    videoId: string,
    hlsPrefix: string,
    keyVersion: number,
  ) {
    const index = await storage.getText('private', `${hlsPrefix}/index.m3u8`);
    expect(index).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key"');
    const segments = index.split('\n').filter((l) => l.endsWith('.ts'));
    const enc = await storage.getBuffer(
      'private',
      `${hlsPrefix}/${segments[0]}`,
    );
    const plain = decryptSegment(
      enc,
      deriveHlsKey(KEK, videoId, keyVersion),
      0,
    );
    const dir = mkdtempSync(join(tmpdir(), 'vs-seg-'));
    const file = join(dir, 'seg.ts');
    writeFileSync(file, plain);
    const out = execFileSync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      file,
    ]).toString();
    const streams = (
      JSON.parse(out) as {
        streams: {
          codec_type: string;
          codec_name: string;
          width?: number;
          height?: number;
        }[];
      }
    ).streams;
    return { segments, streams };
  }

  it('remuxes a compatible mp4: frames, sheet, encrypted HLS, READY', async () => {
    const seeded = await seed('plain', 'Plain <clip>');
    const { result, events, video } = await run(seeded.id);
    expect(result).toEqual({ videoId: seeded.id, userId, changed: true });
    expect(video.status).toBe('READY');
    const processed = await prisma.outboxEvent.findMany({
      where: { type: 'video.processed' },
    });
    expect(processed).toHaveLength(1);
    expect(processed[0]!.payload).toMatchObject({
      videoId: video.id,
      authorId: userId,
      title: video.title,
    });
    expect(video.progress).toBe(100);
    expect(video.stage).toBeNull();
    // Its place in "What's new": the first READY.
    expect(video.readyAt).toEqual(video.processedAt);
    expect(video.probe).toMatchObject({ mode: 'remux', decision: 'remux' });
    expect(video.durationSec).toBeCloseTo(6, 0);
    expect([video.width, video.height]).toEqual([1280, 720]);
    expect(video.segmentCount).toBeGreaterThanOrEqual(1);

    // 16 frames in the public bucket under an unguessable prefix, thumbnail = frame 7
    expect(video.frames).toHaveLength(16);
    expect(video.assetPrefix).toMatch(
      new RegExp(`^v/${seeded.id}/[0-9a-f]{16}$`),
    );
    const f7 = video.frames.find((f) => f.index === 7)!;
    expect(f7.timestampSec).toBeCloseTo((6 * 7.5) / 16, 1);
    expect(f7.width).toBe(1280);
    expect(video.thumbnailKey).toBe(f7.key);
    expect(video.thumbnailFrameIndex).toBe(7);
    expect(await storage.head('public', f7.key)).toMatchObject({
      contentType: 'image/jpeg',
    });

    // small WebP copies for tiles: 640 px wide and much lighter than the JPEG
    expect(video.smallFrames).toBe(true);
    expect(video.thumbnailSmallKey).toBe(smallFrameKey(video.assetPrefix!, 7));
    const s7 = await storage.getBuffer('public', video.thumbnailSmallKey!);
    const s7meta = await sharp(s7).metadata();
    expect(s7meta.format).toBe('webp');
    expect(s7meta.width).toBe(PREVIEW_WIDTH);
    expect(s7.length).toBeLessThan(
      (await storage.getBuffer('public', f7.key)).length,
    );
    expect(
      await storage.head('public', smallFrameKey(video.assetPrefix!, 15)),
    ).toMatchObject({ contentType: 'image/webp' });

    // contact sheet: 1920 px wide JPEG
    const sheet = await sharp(
      await storage.getBuffer('public', video.contactSheetKey!),
    ).metadata();
    expect(sheet.width).toBe(SHEET_WIDTH);
    expect(sheet.height).toBeGreaterThan(1000);

    // HLS: playlists + encrypted segments that decrypt with the HKDF key
    expect(video.hlsPrefix).toBe(`videos/${seeded.id}/hls/v1`);
    const master = await storage.getText(
      'private',
      `${video.hlsPrefix}/master.m3u8`,
    );
    expect(master).toContain('RESOLUTION=1280x720');
    const { segments, streams } = await probeFirstSegment(
      seeded.id,
      video.hlsPrefix!,
      1,
    );
    expect(segments).toHaveLength(video.segmentCount!);
    expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({
      codec_name: 'h264',
      width: 1280,
      height: 720,
    });
    expect(streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe(
      'aac',
    );

    // progress events: start at PROBE, end READY/100, stages in order
    expect(events[0]).toMatchObject({
      status: 'PROCESSING',
      stage: 'PROBE',
      progress: 0,
    });
    expect(events.at(-1)).toMatchObject({
      status: 'READY',
      progress: 100,
      stage: null,
    });
    const stages = [...new Set(events.map((e) => e.stage).filter(Boolean))];
    expect(stages).toEqual([
      'PROBE',
      'FRAMES',
      'SHEET',
      'PACKAGE',
      'ENCRYPT',
      'UPLOAD',
    ]);
    for (let i = 1; i < events.length; i++)
      expect(events[i]!.progress).toBeGreaterThanOrEqual(
        events[i - 1]!.progress,
      );

    // the DTO exposes public URLs only for public assets
    const dto = await videos.getOwnDto(userId, seeded.id);
    expect(dto.thumbnailUrl).toMatch(
      /^http:\/\/localhost:9100\/tapeshelf-test-public\/v\/.+\/f07\.jpg$/,
    );
    expect(dto.frames).toHaveLength(16);
    expect(JSON.stringify(dto)).not.toContain('hls');
  }, 60_000);

  it('re-renders the contact sheet and swaps the thumbnail', async () => {
    const seeded = await seed('plain', 'Before rename');
    await run(seeded.id);
    const before = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    await prisma.video.update({
      where: { id: seeded.id },
      data: { title: 'After rename' },
    });
    const sheet = await pipeline.sheet({
      data: { videoId: seeded.id, userId },
      attemptsMade: 0,
      maxAttempts: 1,
      updateProgress: async () => {},
    });
    expect(sheet.changed).toBe(true);
    const after = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(after.contactSheetKey).not.toBe(before.contactSheetKey);
    expect(await storage.head('public', before.contactSheetKey!)).toBeNull();
    expect(await storage.head('public', after.contactSheetKey!)).not.toBeNull();

    // custom second → worker job; then back to a frame → instant, custom file removed
    const thumb = await pipeline.thumbnail({
      data: { videoId: seeded.id, userId, timestampSec: 1.5 },
      attemptsMade: 0,
      maxAttempts: 1,
      updateProgress: async () => {},
    });
    expect(thumb.changed).toBe(true);
    const custom = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(custom.thumbnailKey).toMatch(/\/thumb-[0-9a-f]{16}\.jpg$/);
    expect(custom.thumbnailSmallKey).toMatch(/\/thumb-[0-9a-f]{16}-s\.webp$/);
    expect(custom.thumbnailFrameIndex).toBeNull();
    expect(
      (
        await sharp(
          await storage.getBuffer('public', custom.thumbnailSmallKey!),
        ).metadata()
      ).width,
    ).toBe(PREVIEW_WIDTH);
    const meta = await sharp(
      await storage.getBuffer('public', custom.thumbnailKey!),
    ).metadata();
    expect(meta.width).toBe(1280);
    const dto = await videos.setThumbnail(userId, seeded.id, { frameIndex: 3 });
    expect(dto.thumbnailFrameIndex).toBe(3);
    expect(dto.thumbnailUrl).toMatch(/f03\.jpg$/);
    expect(await storage.head('public', custom.thumbnailKey!)).toBeNull();
    expect(await storage.head('public', custom.thumbnailSmallKey!)).toBeNull();
    const framed = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(framed.thumbnailSmallKey).toBe(
      smallFrameKey(framed.assetPrefix!, 3),
    );

    // a video processed before the small copies existed gets them from the stored JPEGs
    await storage.deleteObjects(
      'public',
      Array.from({ length: 16 }, (_, i) =>
        smallFrameKey(framed.assetPrefix!, i),
      ),
    );
    await prisma.video.update({
      where: { id: seeded.id },
      data: { smallFrames: false, thumbnailSmallKey: null },
    });
    expect(
      await ctx.get(MaintenanceService).backfillPreviews(),
    ).toBeGreaterThanOrEqual(1);
    const backfilled = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(backfilled.smallFrames).toBe(true);
    expect(backfilled.thumbnailSmallKey).toBe(framed.thumbnailSmallKey);
    expect(
      await storage.head('public', smallFrameKey(framed.assetPrefix!, 0)),
    ).toMatchObject({ contentType: 'image/webp' });
  }, 60_000);

  it('full-range video (yuvj420p) is repackaged, not converted', async () => {
    const seeded = await seed('fullrange');
    const { video } = await run(seeded.id);
    expect(video.status).toBe('READY');
    expect(video.probe).toMatchObject({ decision: 'remux', mode: 'remux' });
  }, 60_000);

  it('a new file is cleaned of its metadata, kept for the admin; the stored original carries none', async () => {
    const seeded = await seed('tagged');
    const usedBefore = (
      await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    ).storageUsedBytes;
    const { video } = await run(seeded.id);
    expect(video.status).toBe('READY');
    const kept = video.sourceMetadata as {
      entries: { scope: string; key: string; value: string }[];
      removedStreams: { index: number; type: string }[];
    };
    expect(kept.entries).toEqual(
      expect.arrayContaining([
        { scope: 'format', key: 'title', value: 'Secret title' },
        { scope: 'format', key: 'comment', value: 'shot at home' },
        { scope: 'format', key: 'artist', value: 'Real Name' },
        { scope: 'format', key: 'location', value: '+55.7558+037.6173/' },
        {
          scope: 'stream:0:video',
          key: 'handler_name',
          value: 'iPhone camera',
        },
        { scope: 'chapter:0', key: 'title', value: 'Bedroom' },
      ]),
    );
    expect(kept.removedStreams).toEqual([
      expect.objectContaining({ index: 2, type: 'data' }),
    ]);

    // The original in storage: rebuilt without any of it, its size and the used space follow.
    const stored = join(tmpdir(), `clean-${seeded.id}.mp4`);
    await storage.downloadToFile('private', video.originalKey, stored);
    const left = await readSourceMetadata(stored, {
      ffprobe: process.env['FFPROBE_PATH'] ?? 'ffprobe',
    });
    const keys = left.entries.map((e) => `${e.scope}:${e.key}=${e.value}`);
    expect(keys.join('\n')).not.toMatch(
      /Secret|home|Real Name|55\.75|iPhone|Bedroom|creation_time|encoder|Lav/,
    );
    expect(left.removedStreams).toEqual([]);
    expect(video.originalKey).toBe(seeded.originalKey);
    expect(video.sizeBytes).toBe(BigInt(statSync(stored).size));
    expect(video.sizeBytes).not.toBe(seeded.sizeBytes);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .storageUsedBytes,
    ).toBe(usedBefore + video.sizeBytes - seeded.sizeBytes);
    // The hash is the cleaned file's.
    expect(video.originalSha256).toBe(
      createHash('sha256').update(readFileSync(stored)).digest('hex'),
    );
    rmSync(stored, { force: true });

    // Processed again: not cleaned again.
    const again = await run(seeded.id);
    expect(again.video.sizeBytes).toBe(video.sizeBytes);
    expect(again.video.sourceMetadata).toEqual(video.sourceMetadata);
  }, 60_000);

  it('a file its container cannot hold once cleaned goes into MKV; a file blocked by its hash before the cleaning stays blocked', async () => {
    const seeded = await seed('subtitled');
    const { video } = await run(seeded.id);
    expect(video.status).toBe('READY');
    expect(video).toMatchObject({
      originalKey: `videos/${seeded.id}/original.mkv`,
      originalFilename: 'subtitled.mkv',
      mimeType: 'video/x-matroska',
    });
    await expect(
      storage.head('private', seeded.originalKey),
    ).resolves.toBeNull();
    const stored = join(tmpdir(), `clean-${seeded.id}.mkv`);
    await storage.downloadToFile('private', video.originalKey, stored);
    const left = await readSourceMetadata(stored, {
      ffprobe: process.env['FFPROBE_PATH'] ?? 'ffprobe',
    });
    expect(left.entries.map((e) => e.value).join(' ')).not.toContain('Secret');
    const streams = execFileSync(process.env['FFPROBE_PATH'] ?? 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      stored,
    ]).toString();
    expect(streams.split('\n').filter(Boolean)).toEqual([
      'video',
      'audio',
      'subtitle',
    ]);
    rmSync(stored, { force: true });

    // Blocked before the cleaning existed: known by the hash of the file as uploaded.
    const blocked = await seed('tagged', 'blocked one');
    await prisma.blockedFile.create({
      data: {
        sha256: createHash('sha256')
          .update(readFileSync(fixtures.tagged))
          .digest('hex'),
        rule: 'COPYRIGHT',
      },
    });
    const refused = await run(blocked.id);
    expect(refused.video).toMatchObject({
      status: 'FAILED',
      failReason: 'blocked',
    });
    await prisma.blockedFile.deleteMany();
  }, 60_000);

  it('a video uploaded as two files (video and audio) is muxed into one original first, without re-encoding', async () => {
    const seeded = await seed('dashVideo', 'two tracks');
    const audioKey = `videos/${seeded.id}/audio.m4a`;
    await storage.put('private', {
      key: audioKey,
      path: fixtures.dashAudio,
      contentType: 'audio/mp4',
    });
    const audioSize = BigInt(statSync(fixtures.dashAudio).size);
    await prisma.video.update({
      where: { id: seeded.id },
      data: { audioKey, audioSizeBytes: audioSize },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: seeded.sizeBytes + audioSize },
    });
    const { video } = await run(seeded.id);
    expect(video.status).toBe('READY');
    expect(video).toMatchObject({
      audioKey: null,
      audioSizeBytes: null,
      originalKey: `videos/${seeded.id}/original.mp4`,
      mimeType: 'video/mp4',
    });
    await expect(storage.head('private', audioKey)).resolves.toBeNull();
    const stored = join(tmpdir(), `muxed-${seeded.id}.mp4`);
    await storage.downloadToFile('private', video.originalKey, stored);
    const streams = execFileSync(process.env['FFPROBE_PATH'] ?? 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name',
      '-of',
      'csv=p=0',
      stored,
    ]).toString();
    expect(streams.split('\n').filter(Boolean)).toEqual([
      'h264,video',
      'aac,audio',
    ]);
    rmSync(stored, { force: true });
    // The shelf is charged for what is kept: the one file, cleaned.
    const author = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(author.storageUsedBytes).toBe(video.sizeBytes);
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsedBytes: 0n },
    });
  }, 60_000);

  it('hands incompatible sources to the transcode queue after producing frames, then transcodes', async () => {
    const seeded = await seed('vp9');
    const tmp = process.env['WORKER_TMP_DIR'] ?? '/tmp/tapeshelf-test';
    // An idle transcode worker starts the moment the job is there: the remux job's folder must
    // already be gone by then, or clearing it pulls the files from under the transcode.
    const handOff = vi.spyOn(queues, 'enqueueProcessing');
    let folderAtHandOff: boolean | null = null;
    handOff.mockImplementation(async function (this: QueueService, data) {
      folderAtHandOff = existsSync(join(tmp, seeded.id));
      return QueueService.prototype.enqueueProcessing.call(this, data);
    });
    const first = await run(seeded.id).finally(() => handOff.mockRestore());
    expect(folderAtHandOff).toBe(false);
    expect(first.result.changed).toBe(true);
    expect(first.video.status).toBe('QUEUED');
    expect(first.video.frames).toHaveLength(16);
    expect(first.video.contactSheetKey).toBeTruthy();
    expect(first.video.probe).toMatchObject({ decision: 'transcode' });
    expect((first.video.probe as { reasons: string[] }).reasons.join()).toMatch(
      /codec vp9/,
    );
    expect(first.events.at(-1)).toMatchObject({
      status: 'QUEUED',
      progress: 12,
    });
    const job = await queues.transcode.getJob(seeded.id);
    expect(job?.data).toEqual({
      videoId: seeded.id,
      userId,
      mode: 'transcode',
    });
    // The original does not wait on the scratch disk for its turn.
    expect(
      existsSync(
        join(process.env['WORKER_TMP_DIR'] ?? '/tmp/tapeshelf-test', seeded.id),
      ),
    ).toBe(false);
    await job!.remove();

    const firstReady = (
      await prisma.video.findUniqueOrThrow({ where: { id: seeded.id } })
    ).readyAt;
    const second = await run(seeded.id, 'transcode');
    expect(second.video.status).toBe('READY');
    // Done again later, it keeps the time it first appeared.
    if (firstReady) expect(second.video.readyAt).toEqual(firstReady);
    expect(second.video.probe).toMatchObject({ mode: 'transcode' });
    expect(second.events[0]).toMatchObject({ stage: 'PROBE', progress: 12 });
    expect(second.events.map((e) => e.stage)).not.toContain('FRAMES'); // assets were kept
    const { streams } = await probeFirstSegment(
      seeded.id,
      second.video.hlsPrefix!,
      1,
    );
    expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({
      codec_name: 'h264',
      width: 1280,
      height: 720,
    });
    expect(streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe(
      'aac',
    );
  }, 120_000);

  it.each([
    ['rotated', /rotation 90/],
    ['high10', /profile High 10|pix_fmt yuv420p10le/],
    ['longgop', /keyframe interval/],
  ] as const)(
    'needs a transcode: %s',
    async (name, reason) => {
      const seeded = await seed(name);
      const first = await run(seeded.id);
      expect(first.video.status).toBe('QUEUED');
      expect(
        (first.video.probe as { reasons: string[] }).reasons.join('; '),
      ).toMatch(reason);
      await (await queues.transcode.getJob(seeded.id))?.remove();
      const { video } = await run(seeded.id, 'transcode');
      expect(video.status).toBe('READY');
      if (name === 'rotated') {
        // portrait output, upright frames (ffmpeg applies the rotation matrix)
        expect([video.width, video.height]).toEqual([720, 1280]);
        expect(video.frames[0]!.width).toBeLessThan(video.frames[0]!.height);
      }
    },
    120_000,
  );

  it('remuxes video but re-encodes mp3 audio to AAC', async () => {
    const seeded = await seed('mp3audio');
    const { video } = await run(seeded.id);
    expect(video.status).toBe('READY');
    expect(video.probe).toMatchObject({
      mode: 'remux',
      audio: { codec: 'mp3' },
    });
    const { streams } = await probeFirstSegment(seeded.id, video.hlsPrefix!, 1);
    expect(streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe(
      'aac',
    );
  }, 60_000);

  it.each([
    ['broken', 'corrupted'],
    ['notvideo', 'corrupted'],
  ] as const)(
    'fails unreadable input (%s) with a reason and no retry',
    async (name, reason) => {
      const seeded = await seed(name);
      const { result, events, video } = await run(seeded.id);
      expect(result.changed).toBe(true);
      expect(video.status).toBe('FAILED');
      expect(
        await prisma.outboxEvent.count({
          where: { type: 'video.failed', processedAt: null },
        }),
      ).toBeGreaterThan(0);
      expect(video.failReason).toBe(reason);
      expect(video.failDetail).toMatch(/ffprobe failed/);
      expect(video.frames).toHaveLength(0);
      expect(events.at(-1)).toMatchObject({ status: 'FAILED' });
    },
    60_000,
  );

  it('turns an unexpected error into FAILED on the last attempt and rethrows before that', async () => {
    const seeded = await seed('plain');
    await storage.deleteObjects('private', [seeded.originalKey]); // download will fail
    await expect(
      pipeline.process({
        data: { videoId: seeded.id, userId },
        attemptsMade: 0,
        maxAttempts: 2,
        updateProgress: async () => {},
      }),
    ).rejects.toThrow();
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: seeded.id } }))
        .status,
    ).toBe('PROCESSING');
    const result = await pipeline.process({
      data: { videoId: seeded.id, userId },
      attemptsMade: 1,
      maxAttempts: 2,
      updateProgress: async () => {},
    });
    expect(result.changed).toBe(true);
    const video = await prisma.video.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(video.status).toBe('FAILED');
    expect(video.failReason).toBe('internal');
  }, 60_000);

  it('hashes the original and refuses a file on the blocklist', async () => {
    const first = await seed('plain', 'First');
    const ready = (await run(first.id)).video;
    // The hash is the stored (cleaned) original's; the same file cleaned again is the same.
    const sum = createHash('sha256')
      .update(await storage.getBuffer('private', ready.originalKey))
      .digest('hex');
    expect(ready).toMatchObject({ status: 'READY', originalSha256: sum });
    await prisma.blockedFile.create({
      data: { sha256: sum, rule: 'COPYRIGHT' },
    });
    const again = await seed('plain', 'Again');
    const { video } = await run(again.id);
    expect(video).toMatchObject({
      status: 'FAILED',
      failReason: 'blocked',
      originalSha256: sum,
    });
    await prisma.blockedFile.deleteMany();
  });

  it('a video deleted while it is processed never turns READY and tells nobody', async () => {
    const seeded = await seed('plain', 'Deleted meanwhile');
    const inner = pipeline as unknown as {
      packageHls: (...args: unknown[]) => Promise<unknown>;
    };
    const original = inner.packageHls.bind(pipeline);
    const spy = vi
      .spyOn(inner, 'packageHls')
      .mockImplementation(async (...args) => {
        const out = await original(...args);
        await prisma.video.update({
          where: { id: seeded.id },
          data: {
            deletedAt: new Date(),
            deleteReason: 'USER',
            deletedById: userId,
          },
        });
        return out;
      });
    try {
      const { result, video } = await run(seeded.id);
      expect(result.changed).toBe(false);
      expect(video.status).not.toBe('READY');
      expect(video.hlsPrefix).toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'video.processed',
          payload: { path: ['videoId'], equals: seeded.id },
        },
      }),
    ).toBe(0);
  });

  it('a video erased while it is processed loses the files the job uploaded after', async () => {
    const seeded = await seed('plain', 'Erased meanwhile');
    const inner = pipeline as unknown as {
      encryptAndUpload: (...args: unknown[]) => Promise<unknown>;
    };
    const original = inner.encryptAndUpload.bind(pipeline);
    const spy = vi
      .spyOn(inner, 'encryptAndUpload')
      .mockImplementation(async (...args) => {
        const out = await original(...args);
        // A takedown erased it while the segments were uploading.
        await prisma.video.update({
          where: { id: seeded.id },
          data: {
            deletedAt: new Date(),
            deleteReason: 'ADMIN',
            purgedAt: new Date(),
          },
        });
        return out;
      });
    try {
      expect((await run(seeded.id)).video.status).not.toBe('READY');
    } finally {
      spy.mockRestore();
    }
    expect(await storage.listKeys('private', `videos/${seeded.id}/`)).toEqual(
      [],
    );
    expect(await storage.listKeys('public', `v/${seeded.id}/`)).toEqual([]);
  });

  it('a rename made while the frames are drawn redraws the contact sheet', async () => {
    const seeded = await seed('plain', 'plain.mp4');
    const original = storage.putMany.bind(storage);
    const put = vi
      .spyOn(storage, 'putMany')
      .mockImplementationOnce(async (...args) => {
        // The upload panel renames right after the upload.
        await prisma.video.update({
          where: { id: seeded.id },
          data: { title: 'Lake at dawn' },
        });
        return original(...args);
      });
    const sheet = vi.spyOn(queues, 'enqueueSheet');
    try {
      expect((await run(seeded.id)).video.status).toBe('READY');
      expect(sheet).toHaveBeenCalledWith({ videoId: seeded.id, userId });
    } finally {
      put.mockRestore();
      sheet.mockRestore();
      await (await queues.thumbnail.getJob(`sheet_${seeded.id}`))?.remove();
    }
  });
});

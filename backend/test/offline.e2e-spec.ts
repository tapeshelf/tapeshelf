import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { monthWindow } from '../src/modules/downloads/download-rules.js';
import {
  deriveHlsKey,
  hlsPrefixOf,
} from '../src/modules/processing/hls-crypto.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { TrafficService } from '../src/modules/traffic/traffic.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const KEK = Buffer.from(process.env['KEK']!, 'hex');
/** What the player streams: the copy's weight and what saving it costs. */
const PLAYBACK = 3000;
const DAY = 24 * 3600 * 1000;
/** The viewer's month of traffic. */
const LIMIT = 100_000;

/**
 * Videos saved to the phone app (–): a copy is the playlist with signed links
 * and the key; saving costs what a view costs, once, and finishing or redoing the copy within a
 * week costs nothing; the phone checks its copies when it comes back online.
 */
describe('offline copies (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let settings: SettingsService;
  let traffic: TrafficService;
  let redis: Redis;
  let author: C, viewer: C, guest: C;
  let authorId: string, viewerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    settings = app.get(SettingsService);
    traffic = app.get(TrafficService);
    redis = app.get(REDIS_CLIENT);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    author = client(app);
    viewer = client(app);
    guest = client(app);
    authorId = await signUp(app, author, {
      email: 'author@example.com',
      username: 'author',
      password: 'secret123',
    });
    viewerId = await signUp(app, viewer, {
      email: 'viewer@example.com',
      username: 'viewer',
      password: 'secret123',
    });
    await settings.set('tiers', {
      ...SETTING_DEFAULTS.tiers,
      BASIC: { ...SETTING_DEFAULTS.tiers.BASIC, trafficBytesPerMonth: LIMIT },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** A ready video with two encrypted-looking segments in the storage. */
  async function seed(
    visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
    keyVersion = 1,
  ) {
    const video = await prisma.video.create({
      data: {
        authorId,
        title: 'Harbour at dawn',
        visibility,
        status: 'READY',
        originalKey: 'pending',
        originalFilename: 'harbour.mp4',
        sizeBytes: 9000n,
        playbackBytes: BigInt(PLAYBACK),
        durationSec: 10,
        keyVersion,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    const prefix = hlsPrefixOf(video.id, keyVersion);
    const segments = [randomBytes(1024), randomBytes(512)];
    await storage.putMany('private', [
      {
        key: `${prefix}/index.m3u8`,
        body: [
          '#EXTM3U',
          '#EXT-X-VERSION:6',
          '#EXT-X-TARGETDURATION:6',
          '#EXT-X-MEDIA-SEQUENCE:0',
          '#EXT-X-PLAYLIST-TYPE:VOD',
          '#EXT-X-KEY:METHOD=AES-128,URI="key"',
          '#EXTINF:6.000000,',
          'seg_00000.ts',
          '#EXTINF:4.000000,',
          'seg_00001.ts',
          '#EXT-X-ENDLIST',
          '',
        ].join('\n'),
        contentType: 'application/vnd.apple.mpegurl',
      },
      ...segments.map((body, i) => ({
        key: `${prefix}/seg_0000${i}.ts`,
        body,
        contentType: 'video/mp2t',
      })),
    ]);
    await prisma.video.update({
      where: { id: video.id },
      data: { hlsPrefix: prefix, segmentCount: 2 },
    });
    return { id: video.id, segments };
  }

  const used = async (id: string) =>
    Number(
      (
        await prisma.trafficUsage.findUnique({
          where: {
            userId_month: {
              userId: id,
              month: monthWindow(new Date()).start,
            },
          },
        })
      )?.bytes ?? 0n,
    );

  /** A day has passed: today's view or save no longer makes the next one free. */
  const forgetToday = (userId: string, videoId: string) =>
    redis.del(
      ...traffic.seenKeys(userId, `view:${videoId}`, { userId: userId }),
    );

  const save = (c: C, id: string) => c.post(`/api/videos/${id}/offline`);
  const check = (c: C, copies: { videoId: string; keyVersion: number }[]) =>
    c.post('/api/offline/check').send({ copies });

  it('hands over the playlist with working links and the key, and charges a view', async () => {
    const v = await seed();
    const copy = (await save(viewer, v.id).expect(200)).body;
    expect(copy).toMatchObject({
      videoId: v.id,
      keyVersion: 1,
      bytes: PLAYBACK,
    });
    expect(Buffer.from(copy.key, 'base64')).toEqual(deriveHlsKey(KEK, v.id, 1));
    expect(copy.playlist).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key"');
    expect(copy.playlist).toContain('#EXT-X-MEDIA-SEQUENCE:0');
    const links = (copy.playlist as string)
      .split('\n')
      .filter((l) => l && !l.startsWith('#'));
    expect(links).toHaveLength(2);
    for (const [i, link] of links.entries()) {
      const answer = await fetch(link);
      expect(answer.status).toBe(200);
      expect(Buffer.from(await answer.arrayBuffer())).toEqual(v.segments[i]);
    }
    // The links outlive an hour-long player token: a download may wait for Wi-Fi.
    expect(new Date(copy.expiresAt).getTime() - Date.now()).toBeGreaterThan(
      5 * 3600 * 1000,
    );
    expect(await used(viewerId)).toBe(PLAYBACK);
  });

  it('saving and watching on one day cost once; fresh links within a week cost nothing', async () => {
    const v = await seed();
    await viewer.post(`/api/videos/${v.id}/playback`).expect(200);
    await save(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);

    // Days later the copy is still finishing (it waited for Wi-Fi): its links are renewed for free.
    await forgetToday(viewerId, v.id);
    await prisma.offlineCopy.update({
      where: { userId_videoId: { userId: viewerId, videoId: v.id } },
      data: { savedAt: new Date(Date.now() - 6 * DAY) },
    });
    await save(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);

    // After a week a new save is a new copy.
    await prisma.offlineCopy.update({
      where: { userId_videoId: { userId: viewerId, videoId: v.id } },
      data: { savedAt: new Date(Date.now() - 8 * DAY) },
    });
    await save(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(2 * PLAYBACK);
  });

  it('one’s own video is free; nothing is left — nothing is saved', async () => {
    const v = await seed();
    await save(author, v.id).expect(200);
    expect(await used(authorId)).toBe(0);

    await prisma.trafficUsage.create({
      data: {
        userId: viewerId,
        month: monthWindow(new Date()).start,
        bytes: BigInt(LIMIT),
      },
    });
    const refused = await save(viewer, v.id).expect(429);
    expect(refused.body.code).toBe('trafficLimitReached');
    expect(refused.body.details.resetAt).toBeTruthy();
    expect(
      await prisma.offlineCopy.count({ where: { userId: viewerId } }),
    ).toBe(0);
  });

  it('only what the person may watch, and only for a signed-in person', async () => {
    const hidden = await seed('PRIVATE');
    await save(viewer, hidden.id).expect(403);
    await save(guest, hidden.id).expect(401);
    const open = await seed();
    await save(guest, open.id).expect(401);
    await prisma.video.update({
      where: { id: open.id },
      data: { deletedAt: new Date() },
    });
    await save(viewer, open.id).expect(404);
  });

  it('the quote says what saving takes before anything is charged', async () => {
    const [mine, theirs, watched, hidden] = [
      await seed(),
      await seed(),
      await seed(),
      await seed('PRIVATE'),
    ];
    await prisma.video.update({
      where: { id: mine.id },
      data: { authorId: viewerId },
    });
    await viewer.post(`/api/videos/${watched.id}/playback`).expect(200);
    const quote = (
      await viewer
        .post('/api/offline/quote')
        .send({ videoIds: [mine.id, theirs.id, watched.id, hidden.id] })
        .expect(200)
    ).body;
    expect(quote.videos).toEqual([
      { videoId: mine.id, allowed: true, bytes: PLAYBACK, spends: false },
      { videoId: theirs.id, allowed: true, bytes: PLAYBACK, spends: true },
      { videoId: watched.id, allowed: true, bytes: PLAYBACK, spends: false },
      { videoId: hidden.id, allowed: false, bytes: 0, spends: false },
    ]);
    expect(quote.traffic).toMatchObject({
      usedBytes: PLAYBACK,
      limitBytes: LIMIT,
    });
    // Asking charged nothing.
    expect(await used(viewerId)).toBe(PLAYBACK);
    await viewer
      .post('/api/offline/quote')
      .send({ videoIds: ['not-an-id'] })
      .expect(400);
  });

  it('the check keeps what still plays, removes what does not, and redoes an edited copy for free', async () => {
    const kept = await seed();
    const gone = await seed();
    const edited = await seed();
    const editing = await seed();
    const unshared = await seed('PRIVATE');
    await prisma.videoAccess.create({
      data: { videoId: unshared.id, holderId: viewerId, source: 'SHARE' },
    });
    for (const v of [kept, gone, edited, editing, unshared])
      await save(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(5 * PLAYBACK);

    await prisma.video.update({
      where: { id: gone.id },
      data: { deletedAt: new Date() },
    });
    await prisma.videoAccess.delete({
      where: {
        videoId_holderId: { videoId: unshared.id, holderId: viewerId },
      },
    });
    await prisma.video.update({
      where: { id: edited.id },
      data: { keyVersion: 2, hlsPrefix: hlsPrefixOf(edited.id, 1) },
    });
    // Mid-edit a video plays for no one, but the copy of what it was stays.
    await prisma.video.update({
      where: { id: editing.id },
      data: { status: 'PROCESSING', editJob: { status: 'rendering' } },
    });
    // The edited copy was saved long ago.
    await forgetToday(viewerId, edited.id);
    await prisma.offlineCopy.update({
      where: { userId_videoId: { userId: viewerId, videoId: edited.id } },
      data: { savedAt: new Date(Date.now() - 30 * DAY) },
    });

    const verdicts = (
      await check(
        viewer,
        [kept, gone, edited, editing, unshared].map((v) => ({
          videoId: v.id,
          keyVersion: 1,
        })),
      ).expect(200)
    ).body.copies;
    expect(verdicts).toEqual([
      { videoId: kept.id, state: 'keep' },
      { videoId: gone.id, state: 'remove' },
      { videoId: edited.id, state: 'update' },
      { videoId: editing.id, state: 'keep' },
      { videoId: unshared.id, state: 'remove' },
    ]);

    const redone = (await save(viewer, edited.id).expect(200)).body;
    expect(redone.keyVersion).toBe(2);
    expect(await used(viewerId)).toBe(5 * PLAYBACK);

    // A video the phone does not know of is simply gone.
    const unknown = (
      await check(viewer, [
        { videoId: '0195d6e2-0000-7000-8000-000000000000', keyVersion: 1 },
      ]).expect(200)
    ).body.copies;
    expect(unknown).toEqual([
      { videoId: '0195d6e2-0000-7000-8000-000000000000', state: 'remove' },
    ]);
    await check(guest, []).expect(401);
  });
});

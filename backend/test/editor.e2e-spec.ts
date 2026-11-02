import { ConfigModule } from '@nestjs/config';
import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { statSync } from 'node:fs';

import { validateEnv } from '../src/config/env.js';
import { OutboxModule } from '../src/infra/outbox/outbox.module.js';
import { PrismaModule } from '../src/infra/prisma/prisma.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueModule } from '../src/infra/queue/queue.module.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import type {
  EditProgressEvent,
  FilesDeleteJob,
  VideoProgressEvent,
  VideoRemovedEvent,
} from '../src/infra/queue/queue.types.js';
import { RedisModule } from '../src/infra/redis/redis.module.js';
import { StorageModule } from '../src/infra/storage/storage.module.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { BillingModule } from '../src/modules/billing/billing.module.js';
import { BlocklistModule } from '../src/modules/blocklist/blocklist.module.js';
import { emptyEdit, type EditSpec } from '../src/modules/editor/edit-spec.js';
import { deriveHlsKey } from '../src/modules/processing/hls-crypto.js';
import { EditRenderService } from '../src/modules/processing/edit-render.service.js';
import { MaintenanceService } from '../src/modules/processing/maintenance.service.js';
import { SHEET_VERSION } from '../src/modules/processing/contact-sheet.js';
import { PipelineModule } from '../src/modules/processing/pipeline.module.js';
import { VideoPipelineService } from '../src/modules/processing/video-pipeline.service.js';
import { PlansModule } from '../src/modules/plans/plans.module.js';
import { SettingsModule } from '../src/modules/settings/settings.module.js';
import { VideosModule } from '../src/modules/videos/videos.module.js';
import { ensureFixtures } from './utils/fixtures.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const fixtures = ensureFixtures();
const KEK = Buffer.from(process.env['KEK']!, 'hex');

/**
 * the video editor. A real render of the `plain` fixture (1280×720, 6 s, sound):
 * into the same video (the original kept), back to the original, as a copy; cancelling; who may.
 */
describe('video editor (e2e)', () => {
  let app: NestExpressApplication;
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  let storage: StorageService;
  let queues: QueueService;
  let pipeline: VideoPipelineService;
  let render: EditRenderService;
  let maintenance: MaintenanceService;
  let pro: C, other: C, admin: C;
  let proId: string, adminId: string;
  let videoId: string;
  let sizeBytes: number;
  const events: EditProgressEvent[] = [];
  /** What the author's shelf is told: the tile's progress, or that it goes. */
  const tiles: (VideoProgressEvent | VideoRemovedEvent)[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.test'],
          skipProcessEnv: true,
        }),
        PrismaModule,
        RedisModule,
        StorageModule,
        QueueModule,
        OutboxModule,
        SettingsModule,
        PlansModule,
        BillingModule,
        BlocklistModule,
        PipelineModule,
        VideosModule,
      ],
    }).compile();
    worker = await moduleRef.createNestApplication().init();
    prisma = worker.get(PrismaService);
    storage = worker.get(StorageService);
    queues = worker.get(QueueService);
    pipeline = worker.get(VideoPipelineService);
    render = worker.get(EditRenderService);
    maintenance = worker.get(MaintenanceService);

    await resetDatabase(app);
    await queues.edit.obliterate({ force: true }).catch(() => undefined);
    pro = client(app);
    other = client(app);
    admin = client(app);
    proId = await signUp(app, pro, {
      email: 'pro@example.com',
      username: 'pro',
      password: 'secret123',
    });
    await signUp(app, other, {
      email: 'other@example.com',
      username: 'other',
      password: 'secret123',
    });
    adminId = await signUp(app, admin, {
      email: 'boss@example.com',
      username: 'boss',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: proId },
      data: { tier: 'PREMIUM' },
    });
    await makeAdmin(prisma, adminId);

    sizeBytes = statSync(fixtures.plain).size;
    const video = await prisma.video.create({
      data: {
        authorId: proId,
        title: 'Lake',
        originalKey: 'pending',
        originalFilename: 'lake.mp4',
        sizeBytes: BigInt(sizeBytes),
        holdings: { create: { holderId: proId, source: 'AUTHOR' } },
      },
    });
    videoId = video.id;
    const originalKey = `videos/${videoId}/original.mp4`;
    await storage.put('private', {
      key: originalKey,
      path: fixtures.plain,
      contentType: 'video/mp4',
    });
    await prisma.video.update({
      where: { id: videoId },
      data: { originalKey },
    });
    await prisma.user.update({
      where: { id: proId },
      data: { storageUsedBytes: BigInt(sizeBytes) },
    });
    await pipeline.process({
      data: { videoId, userId: proId },
      attemptsMade: 0,
      maxAttempts: 1,
      updateProgress: async () => undefined,
    });
  }, 180_000);

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  const runRender = async () => {
    const v = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    return render.run({
      data: { videoId, revision: v.editRevision },
      updateProgress: async (e) => {
        if ('edit' in e) events.push(e);
        else tiles.push(e);
      },
    });
  };
  const spec = (patch: Partial<EditSpec>): EditSpec => ({
    ...emptyEdit({ width: 1280, height: 720, durationSec: 6, hasAudio: true }),
    ...patch,
  });
  const used = async (userId: string) =>
    Number(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .storageUsedBytes,
    );
  const filesDeleteJobs = async () =>
    (await queues.maintenance.getDelayed())
      .filter((j) => j.name === 'files.delete')
      .map((j) => j.data as FilesDeleteJob);

  it('the editor starts from the video as it is; only its Pro author and admins may open it', async () => {
    const state = (await pro.get(`/api/videos/${videoId}/edit`).expect(200))
      .body;
    expect(state).not.toHaveProperty('applied');
    expect(state).toMatchObject({
      job: null,
      canCopy: true,
      foreign: false,
    });
    expect(state.source).toMatchObject({
      width: 1280,
      height: 720,
      hasAudio: true,
    });
    expect(state.source.durationSec).toBeCloseTo(6, 0);
    await other.get(`/api/videos/${videoId}/edit`).expect(404);
    const page = (await pro.get(`/api/users/pro/videos/${videoId}`).expect(200))
      .body;
    expect(page.viewer.canEdit).toBe(true);
    // A Free author on the cloud: the editor is Pro.
    await prisma.user.update({ where: { id: proId }, data: { tier: 'BASIC' } });
    expect(
      (await pro.get(`/api/videos/${videoId}/edit`).expect(403)).body.code,
    ).toBe('editorProOnly');
    await prisma.user.update({
      where: { id: proId },
      data: { tier: 'PREMIUM' },
    });
    // Nonsense is refused before anything is queued.
    expect(
      (
        await pro
          .post(`/api/videos/${videoId}/edit`)
          .send({
            mode: 'replace',
            spec: spec({ trim: { start: 2, end: 2.5 } }),
          })
          .expect(400)
      ).body.code,
    ).toBe('invalidEdit');
    expect(
      (
        await pro
          .post(`/api/videos/${videoId}/edit`)
          .send({ mode: 'replace', spec: spec({}) })
          .expect(400)
      ).body.code,
    ).toBe('nothingToSave');
  });

  it('saved into the same video: rendered under a new key version, swapped in, the original gone for good', async () => {
    const before = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    const oldToken = (
      await pro.post(`/api/videos/${videoId}/playback`).expect(200)
    ).body.playlistUrl as string;
    const edit = spec({
      crop: { x: 0.35, y: 0, w: 0.3164, h: 1 },
      cuts: [{ start: 2, end: 3 }],
      blurs: [
        {
          start: 0.5,
          end: 2,
          rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
          mode: 'blur',
        },
      ],
      timers: [{ start: 1, end: 4, x: 0.05, y: 0.05, size: 0.06 }],
      captions: [
        { start: 1, end: 5, text: 'Привет: 100%', x: 0.1, y: 0.8, size: 0.04 },
      ],
      volume: 0.5,
    });
    const saved = (
      await pro
        .post(`/api/videos/${videoId}/edit`)
        .send({ mode: 'replace', spec: edit })
        .expect(200)
    ).body;
    expect(saved.job).toMatchObject({ mode: 'replace', status: 'queued' });
    // One at a time.
    expect(
      (
        await pro
          .post(`/api/videos/${videoId}/edit`)
          .send({ mode: 'replace', spec: edit })
          .expect(409)
      ).body.code,
    ).toBe('editInProgress');
    // Until its new version is there, no one watches it: its tile says "Editing", a player
    // that began before is cut off; only its editor still plays what it edits.
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: videoId } }),
    ).toMatchObject({ status: 'PROCESSING', stage: 'EDIT' });
    await pro.post(`/api/videos/${videoId}/playback`).expect(403);
    const playlist = (url: string) =>
      pro.get(new URL(url).pathname + new URL(url).search);
    await playlist(oldToken).expect(404);
    const editing = (
      await pro.post(`/api/videos/${videoId}/playback?source=1`).expect(200)
    ).body.playlistUrl as string;
    await playlist(editing).expect(200);
    tiles.length = 0;

    expect((await runRender()).changed).toBe(true);
    const after = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(after.status).toBe('READY');
    expect(after.stage).toBeNull();
    expect(
      tiles.some(
        (t) => 'stage' in t && t.stage === 'EDIT' && t.userId === proId,
      ),
    ).toBe(true);
    expect(tiles.at(-1)).toMatchObject({
      videoId,
      status: 'READY',
      progress: 100,
    });
    expect(after.keyVersion).toBe(before.keyVersion + 1);
    expect(after.hlsPrefix).toBe(`videos/${videoId}/hls/v${after.keyVersion}`);
    expect([after.width, after.height]).toEqual([404, 720]);
    expect(after.durationSec).toBeCloseTo(5, 0);
    // The render is the video's file now; nothing of what it was made from is kept.
    expect(after.originalKey).toMatch(
      new RegExp(`^videos/${videoId}/original-[0-9a-f]+\\.mp4$`),
    );
    expect(after).toMatchObject({
      originalFilename: 'lake.mp4',
      mimeType: 'video/mp4',
      renderKey: null,
      renderBytes: null,
      sourceKeyVersion: null,
      sourceInfo: null,
      edit: null,
      editJob: null,
    });
    expect(after.originalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(after.originalSha256).not.toBe(before.originalSha256);
    expect(Number(after.sizeBytes)).toBeGreaterThan(0);
    expect(after.assetPrefix).not.toBe(before.assetPrefix);
    expect(await used(proId)).toBe(Number(after.sizeBytes));
    expect(events.at(-1)?.edit).toEqual({ status: 'done', progress: 100 });

    // What everyone sees now, and the editor too; a player that began before keeps its version.
    const fresh = (
      await pro.post(`/api/videos/${videoId}/playback`).expect(200)
    ).body.playlistUrl as string;
    const source = (
      await pro.post(`/api/videos/${videoId}/playback?source=1`).expect(200)
    ).body.playlistUrl as string;
    await other.post(`/api/videos/${videoId}/playback?source=1`).expect(403);
    const master = (url: string) =>
      pro.get(new URL(url).pathname + new URL(url).search).expect(200);
    const key = async (url: string) =>
      (
        await pro
          .get(`/api/stream/${videoId}/key${new URL(url).search}`)
          .buffer(true)
          .parse(binary)
          .expect(200)
      ).body as Buffer;
    for (const url of [fresh, source, oldToken]) await master(url);
    expect(
      (await key(fresh)).equals(deriveHlsKey(KEK, videoId, after.keyVersion)),
    ).toBe(true);
    expect(
      (await key(source)).equals(deriveHlsKey(KEK, videoId, after.keyVersion)),
    ).toBe(true);
    expect(
      (await key(oldToken)).equals(
        deriveHlsKey(KEK, videoId, before.keyVersion),
      ),
    ).toBe(true);

    // The replaced version — its frames, its playback, the original file — goes hours later.
    const jobs = await filesDeleteJobs();
    const gone = (bucket: 'private' | 'public', item: string) =>
      jobs.some((j) => j[bucket].includes(item));
    expect(gone('public', `${before.assetPrefix}/`)).toBe(true);
    expect(gone('private', `${before.hlsPrefix}/`)).toBe(true);
    expect(gone('private', before.originalKey)).toBe(true);
    expect(
      await storage.listKeys('private', `${before.hlsPrefix}/`),
    ).not.toEqual([]);
    for (const job of jobs) await maintenance.deleteFiles(job);
    expect(await storage.listKeys('public', `${before.assetPrefix}/`)).toEqual(
      [],
    );
    expect(await storage.listKeys('private', `${before.hlsPrefix}/`)).toEqual(
      [],
    );
    expect(await storage.listKeys('private', before.originalKey)).toEqual([]);
    expect(await storage.listKeys('private', after.originalKey)).toEqual([
      after.originalKey,
    ]);

    // The next edit starts from this version, with nothing of the first one to change or undo.
    const state = (await pro.get(`/api/videos/${videoId}/edit`).expect(200))
      .body;
    expect(state.source).toMatchObject({ width: 404, height: 720 });
    expect(state.source.durationSec).toBeCloseTo(5, 0);
    await pro.post(`/api/videos/${videoId}/edit/revert`).expect(404);
  }, 180_000);

  it('a moderator’s edit tells the author and starts from the last version', async () => {
    await queues.maintenance.drain(true).catch(() => undefined);
    const edited = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    // The admin edits a video that is not theirs: logged, and the author is told.
    await admin
      .post(`/api/videos/${videoId}/edit`)
      .send({
        mode: 'replace',
        spec: spec({
          blurs: [
            {
              start: 0,
              end: 1,
              rect: { x: 0, y: 0, w: 0.3, h: 0.3 },
              mode: 'box',
            },
          ],
        }),
      })
      .expect(200);
    const processed = () =>
      prisma.outboxEvent.count({
        where: {
          type: 'video.processed',
          payload: { path: ['videoId'], equals: videoId },
        },
      });
    const processedBefore = await processed();
    // Another save while it waits: one at a time.
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'replace', spec: spec({ volume: 0.4 }) })
      .expect(409);
    expect((await runRender()).changed).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { actorId: adminId, action: 'video.edit', targetId: videoId },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'notify',
          payload: {
            path: ['deliveries', '0', 'type'],
            equals: 'VIDEO_EDITED',
          },
        },
      }),
    ).toBe(1);
    // Not "your video is ready" on top of it: that is for the author's own edits.
    expect(await processed()).toBe(processedBefore);
    const second = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(second.keyVersion).toBe(edited.keyVersion + 1);
    // Made from the first edit, not from the original: still its vertical frame and length.
    expect([second.width, second.height]).toEqual([404, 720]);
    expect(second.durationSec).toBeCloseTo(5, 0);
    expect(await used(proId)).toBe(Number(second.sizeBytes));
    // The previous version goes (later), file and playback.
    const jobs = await filesDeleteJobs();
    expect(jobs.some((j) => j.private.includes(`${edited.hlsPrefix}/`))).toBe(
      true,
    );
    expect(jobs.some((j) => j.private.includes(edited.originalKey))).toBe(true);
  }, 180_000);

  it('saved as a copy: a new video of the author, ready to watch when the editor says so; the source untouched', async () => {
    const before = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    // The original sits in a category and a stack on its shelf.
    const category = await prisma.category.create({
      data: { ownerId: proId, name: 'Lakes' },
    });
    const stack = await prisma.videoStack.create({ data: { ownerId: proId } });
    await prisma.videoAccess.update({
      where: { videoId_holderId: { videoId, holderId: proId } },
      data: { categoryId: category.id, stackId: stack.id },
    });
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'copy', spec: spec({ rotate: 90 }) })
      .expect(200);
    // From the save on, the copy is on the shelf: "Editing", in the same category and stack, right
    // after the original; the original stays watchable.
    const placeholder = await prisma.video.findFirstOrThrow({
      where: { authorId: proId, id: { not: videoId } },
      include: { holdings: true },
    });
    expect(placeholder).toMatchObject({
      title: 'Lake (edited)',
      status: 'PROCESSING',
      stage: 'EDIT',
    });
    expect(placeholder.holdings[0]).toMatchObject({
      categoryId: category.id,
      stackId: stack.id,
    });
    const order = (
      await prisma.videoAccess.findMany({
        where: { holderId: proId },
        orderBy: { position: 'asc' },
        select: { videoId: true },
      })
    ).map((h) => h.videoId);
    expect(order.indexOf(placeholder.id)).toBe(order.indexOf(videoId) + 1);
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).status,
    ).toBe('READY');
    await pro.post(`/api/videos/${placeholder.id}/playback`).expect(403);
    events.length = 0;
    tiles.length = 0;
    const result = await runRender();
    const copy = await prisma.video.findFirstOrThrow({
      where: { authorId: proId, id: { not: videoId } },
      include: { frames: true },
    });
    expect(copy.id).toBe(placeholder.id);
    expect(
      tiles.some(
        (t) => t.videoId === copy.id && 'stage' in t && t.stage === 'EDIT',
      ),
    ).toBe(true);
    expect(tiles.at(-1)).toMatchObject({ videoId: copy.id, status: 'READY' });
    // Made at once, not handed to the upload queue: no second encoding, no "converting".
    expect(copy).toMatchObject({
      title: 'Lake (edited)',
      status: 'READY',
      progress: 100,
      mimeType: 'video/mp4',
      keyVersion: 1,
      hlsPrefix: `videos/${copy.id}/hls/v1`,
    });
    // Made from the video as it is now (vertical after the edits above), turned.
    expect([copy.width, copy.height]).toEqual([720, 404]);
    expect(copy.frames).toHaveLength(16);
    expect(copy.originalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect((copy.probe as { mode: string }).mode).toBe('remux');
    expect(copy.readyAt).not.toBeNull();
    expect(result).toEqual({ videoId: copy.id, userId: proId, changed: true });
    expect(
      await queues.remux.getJob(copy.id).then((j) => j ?? null),
    ).toBeNull();
    expect(events.at(-1)).toMatchObject({
      copyId: copy.id,
      edit: { status: 'done', progress: 100 },
    });
    // The bar only ever goes forward.
    const shown = events.map((e) => e.edit.progress);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'video.processed',
          payload: { path: ['videoId'], equals: copy.id },
        },
      }),
    ).toBe(1);
    // It plays: its own HLS under its own key.
    const play = (await pro.post(`/api/videos/${copy.id}/playback`).expect(200))
      .body.playlistUrl as string;
    await pro.get(new URL(play).pathname + new URL(play).search).expect(200);
    expect(
      await storage.listKeys('private', `videos/${copy.id}/hls/v1/`),
    ).not.toEqual([]);
    expect(await used(proId)).toBe(
      Number(before.sizeBytes) + Number(copy.sizeBytes),
    );
    const source = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(source.keyVersion).toBe(before.keyVersion);
    // Only one's own videos are copied.
    expect(
      (
        await admin
          .post(`/api/videos/${videoId}/edit`)
          .send({ mode: 'copy', spec: spec({ volume: 0.3 }) })
          .expect(403)
      ).body.code,
    ).toBe('editorCopyOwnOnly');
  }, 180_000);

  it('a failed render tells whoever saved it, and its changes come back in the editor', async () => {
    const before = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    const edit = spec({
      timers: [{ start: 0, end: 2, x: 0.1, y: 0.1, size: 0.06 }],
    });
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'replace', spec: edit })
      .expect(200);
    // No ffmpeg to render with.
    const own = render as unknown as { ffmpeg: string };
    const ffmpeg = own.ffmpeg;
    own.ffmpeg = '/nowhere/ffmpeg';
    try {
      expect((await runRender()).changed).toBe(false);
    } finally {
      own.ffmpeg = ffmpeg;
    }
    const after = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(after.keyVersion).toBe(before.keyVersion);
    expect(after.editJob).toMatchObject({ status: 'failed', error: 'render' });
    // Watchable again, as it was.
    expect(after).toMatchObject({ status: 'READY', stage: null });
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'notify',
          payload: {
            path: ['deliveries', '0', 'type'],
            equals: 'VIDEO_EDIT_FAILED',
          },
        },
      }),
    ).toBe(1);
    const state = (await pro.get(`/api/videos/${videoId}/edit`).expect(200))
      .body;
    expect(state.job).toMatchObject({ status: 'failed', error: 'render' });
    expect(state.job.spec.timers).toEqual(edit.timers);
    await pro.delete(`/api/videos/${videoId}/edit`).expect(200);
  }, 120_000);

  it('a cancelled edit throws its work away', async () => {
    const before = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'replace', spec: spec({ flipH: true }) })
      .expect(200);
    const stale = before.editRevision + 1;
    expect(
      (await pro.delete(`/api/videos/${videoId}/edit`).expect(200)).body.job,
    ).toBeNull();
    const result = await render.run({
      data: { videoId, revision: stale },
      updateProgress: async () => undefined,
    });
    expect(result.changed).toBe(false);
    const after = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(after.keyVersion).toBe(before.keyVersion);
    expect(after.editRevision).toBe(stale + 1);
    expect(after).toMatchObject({ status: 'READY', stage: null });

    // A copy cancelled leaves the shelf.
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'copy', spec: spec({ flipV: true }) })
      .expect(200);
    const making = await prisma.video.findFirstOrThrow({
      where: { authorId: proId, stage: 'EDIT' },
    });
    await pro.delete(`/api/videos/${videoId}/edit`).expect(200);
    expect(await prisma.video.count({ where: { id: making.id } })).toBe(0);
  }, 60_000);

  it('an edit saved while the original was kept is made final; old contact sheets are drawn again', async () => {
    await queues.maintenance.drain(true).catch(() => undefined);
    const now = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    // As left it: the edited file aside, the original and its playback kept.
    const renderKey = `videos/${videoId}/render-legacy.mp4`;
    await storage.put('private', {
      key: renderKey,
      path: fixtures.plain,
      contentType: 'video/mp4',
    });
    const renderBytes = BigInt(statSync(fixtures.plain).size);
    await prisma.video.update({
      where: { id: videoId },
      data: {
        renderKey,
        renderBytes,
        originalFilename: 'lake.mov',
        edit: spec({ flipH: true }) as object,
        sourceKeyVersion: 1,
        sourceInfo: {
          durationSec: 6,
          width: 1280,
          height: 720,
          hasAudio: true,
          hlsPrefix: `videos/${videoId}/hls/v1`,
          segmentCount: 3,
          probe: null,
        },
        sheetVersion: 0,
      },
    });
    await prisma.user.update({
      where: { id: proId },
      data: { storageUsedBytes: now.sizeBytes + renderBytes },
    });
    expect(await maintenance.bakeEdits()).toBe(1);
    const baked = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(baked).toMatchObject({
      originalKey: renderKey,
      originalFilename: 'lake.mp4',
      sizeBytes: renderBytes,
      renderKey: null,
      renderBytes: null,
      edit: null,
      sourceKeyVersion: null,
      sourceInfo: null,
      originalSha256: null,
    });
    expect(await used(proId)).toBe(Number(renderBytes));
    const jobs = await filesDeleteJobs();
    expect(jobs.some((j) => j.private.includes(now.originalKey))).toBe(true);
    expect(
      jobs.some((j) => j.private.includes(`videos/${videoId}/hls/v1/`)),
    ).toBe(true);
    expect(await maintenance.bakeEdits()).toBe(0);

    // The sheet of an older design is drawn again, with the short link.
    expect(await maintenance.refreshSheets()).toBe(1);
    const job = await queues.thumbnail.getJob(`sheet_${videoId}`);
    expect(job?.data).toEqual({ videoId, userId: proId });
    await pipeline.sheet({
      data: { videoId, userId: proId },
      attemptsMade: 0,
      maxAttempts: 1,
      updateProgress: async () => undefined,
    } as never);
    const drawn = await prisma.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    expect(drawn.sheetVersion).toBe(SHEET_VERSION);
    expect(drawn.contactSheetKey).not.toBe(baked.contactSheetKey);
    expect(await maintenance.refreshSheets()).toBe(0);
  }, 60_000);

  it('a video deleted while its edit waits for the render: the edit goes, and the half-made copy with it', async () => {
    await pro
      .post(`/api/videos/${videoId}/edit`)
      .send({ mode: 'copy', spec: spec({ flipH: true }) })
      .expect(200);
    const making = await prisma.video.findFirstOrThrow({
      where: { authorId: proId, stage: 'EDIT' },
    });
    await pro.delete(`/api/videos/${videoId}`).expect(200);
    expect((await runRender()).changed).toBe(false);
    expect(await prisma.video.count({ where: { id: making.id } })).toBe(0);
    await pro.post(`/api/me/trash/${videoId}/restore`).expect(200);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: videoId } }),
    ).toMatchObject({ status: 'READY', stage: null, editJob: null });
  }, 60_000);
});

/** Collects a binary response body (supertest leaves unknown types unparsed). */
function binary(res: unknown, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  const stream = res as NodeJS.ReadableStream;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
}

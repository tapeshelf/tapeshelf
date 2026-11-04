import { ConfigModule } from '@nestjs/config';
import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Worker, type RedisOptions } from 'bullmq';

import { validateEnv } from '../src/config/env.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { OutboxModule } from '../src/infra/outbox/outbox.module.js';
import { PrismaModule } from '../src/infra/prisma/prisma.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QUEUE_CONNECTION } from '../src/infra/queue/queue.connection.js';
import { QueueModule } from '../src/infra/queue/queue.module.js';
import {
  QUEUE_PREFIX,
  QueueService,
} from '../src/infra/queue/queue.service.js';
import {
  JOB,
  QUEUES,
  type VideoProgressEvent,
} from '../src/infra/queue/queue.types.js';
import { RedisModule } from '../src/infra/redis/redis.module.js';
import { StorageModule } from '../src/infra/storage/storage.module.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { BillingModule } from '../src/modules/billing/billing.module.js';
import { BlocklistModule } from '../src/modules/blocklist/blocklist.module.js';
import { PlansModule } from '../src/modules/plans/plans.module.js';
import { TrafficModule } from '../src/modules/traffic/traffic.module.js';
import { MaintenanceService } from '../src/modules/processing/maintenance.service.js';
import { PipelineModule } from '../src/modules/processing/pipeline.module.js';
import { VideoPipelineService } from '../src/modules/processing/video-pipeline.service.js';
import { SettingsModule } from '../src/modules/settings/settings.module.js';
import { VideosModule } from '../src/modules/videos/videos.module.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

/**
 * A video whose processing stopped without an end — its job given up on by the queue, lost,
 * or its worker gone — fails or is processed again, and does not stay "processing" for good.
 */
describe('videos whose processing stopped without an end (e2e)', () => {
  let app: NestExpressApplication;
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  let queues: QueueService;
  let pipeline: VideoPipelineService;
  let maintenance: MaintenanceService;
  let ann: ReturnType<typeof client>;
  let annId: string;
  const events: VideoProgressEvent[] = [];
  const sink = {
    updateProgress: async (e: VideoProgressEvent) => {
      events.push(e);
    },
  };

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
        TrafficModule,
        BillingModule,
        BlocklistModule,
        PipelineModule,
        VideosModule,
      ],
    }).compile();
    worker = await moduleRef.createNestApplication().init();
    prisma = worker.get(PrismaService);
    queues = worker.get(QueueService);
    pipeline = worker.get(VideoPipelineService);
    maintenance = worker.get(MaintenanceService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    events.length = 0;
    ann = client(app);
    annId = await signUp(app, ann, {
      email: 'ann@example.com',
      username: 'ann',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  const video = (data: Partial<Prisma.VideoUncheckedCreateInput>) =>
    prisma.video.create({
      data: {
        authorId: annId,
        title: 'Clip',
        originalKey: 'videos/clip/original.mp4',
        originalFilename: 'clip.mp4',
        sizeBytes: 1000n,
        holdings: { create: { holderId: annId, source: 'AUTHOR' } },
        ...data,
      },
    });
  /** As if the job had said nothing for that long. */
  const age = (id: string, minutes = 30) =>
    prisma.$executeRaw`UPDATE "Video" SET "updatedAt" = now() - make_interval(mins => ${minutes}) WHERE id = ${id}::uuid`;
  const state = (id: string) =>
    prisma.video.findUniqueOrThrow({
      where: { id },
      select: { status: true, stage: true, failReason: true, editJob: true },
    });

  it('a job the queue gave up on fails its video; a video that went on meanwhile is left', async () => {
    const stuck = await video({ status: 'PROCESSING', stage: 'PACKAGE' });
    expect(
      await pipeline.abandon(
        { videoId: stuck.id, userId: annId },
        sink,
        'job stalled more than allowable limit',
      ),
    ).toBe(true);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: stuck.id } }),
    ).toMatchObject({
      status: 'FAILED',
      stage: null,
      failReason: 'internal',
      failDetail: 'job stalled more than allowable limit',
    });
    // The owner's shelf hears of it, and so does the author (a failed video, as from a failed run).
    expect(events).toContainEqual(
      expect.objectContaining({ videoId: stuck.id, status: 'FAILED' }),
    );
    expect(
      await prisma.outboxEvent.count({ where: { type: 'video.failed' } }),
    ).toBe(1);

    const ready = await video({ status: 'READY' });
    const deleted = await video({
      status: 'PROCESSING',
      deletedAt: new Date(),
    });
    const editing = await video({ status: 'PROCESSING', stage: 'EDIT' });
    const queuedAgain = await video({ status: 'QUEUED' });
    await queues.enqueueProcessing({ videoId: queuedAgain.id, userId: annId });
    for (const v of [ready, deleted, editing, queuedAgain])
      expect(
        await pipeline.abandon({ videoId: v.id, userId: annId }, sink, 'x'),
      ).toBe(false);
    expect((await state(queuedAgain.id)).status).toBe('QUEUED');
  });

  it('the watchdog hands a video with no job to processing again, and fails one tried too often', async () => {
    const lost = await video({
      status: 'PROCESSING',
      stage: 'PACKAGE',
      processingAttempts: 1,
    });
    await queues.remux.add(
      JOB.process,
      {
        videoId: lost.id,
        userId: annId,
      },
      { jobId: lost.id, attempts: 1 },
    );
    const taker = new Worker(QUEUES.remux, null, {
      connection: worker.get<RedisOptions>(QUEUE_CONNECTION),
      prefix: QUEUE_PREFIX,
      autorun: false,
    });
    const taken = await taker.getNextJob('test');
    await taken!.moveToFailed(
      new Error('job stalled more than allowable limit'),
      'test',
    );
    await taker.close();
    expect(await queues.hasProcessingJob(lost.id)).toBe(false);

    const worn = await video({
      status: 'PROCESSING',
      stage: 'PACKAGE',
      processingAttempts: 3,
    });
    // Handed to the transcode queue, whose job was then lost.
    const handedOver = await video({ status: 'QUEUED', processingAttempts: 1 });
    // Never begun, and no upload session says it was sent: not the watchdog's.
    const sessionless = await video({ status: 'QUEUED' });
    // Never begun either, but a browser upload whose job never came: taken up.
    const uploaded = await video({ status: 'QUEUED' });
    await prisma.uploadSession.create({
      data: {
        userId: annId,
        key: 'videos/clip/original.mp4',
        s3UploadId: 'gone',
        filename: 'clip.mp4',
        declaredSize: 1000n,
        partSize: 1000,
        status: 'COMPLETED',
        videoId: uploaded.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const running = await video({
      status: 'PROCESSING',
      stage: 'PACKAGE',
      processingAttempts: 1,
    });
    await queues.enqueueProcessing({
      videoId: running.id,
      userId: annId,
      mode: 'transcode',
    });
    const recent = await video({
      status: 'PROCESSING',
      stage: 'PROBE',
      processingAttempts: 1,
    });
    for (const v of [lost, worn, handedOver, sessionless, uploaded, running])
      await age(v.id);

    expect(await maintenance.reviveStuck()).toEqual({
      requeued: 3,
      failed: 1,
      edits: 0,
    });
    expect(await queues.hasProcessingJob(uploaded.id)).toBe(true);
    for (const v of [lost, handedOver]) {
      expect(await state(v.id)).toMatchObject({
        status: 'QUEUED',
        stage: null,
      });
      expect(await queues.hasProcessingJob(v.id)).toBe(true);
    }
    expect(await state(worn.id)).toMatchObject({
      status: 'FAILED',
      failReason: 'internal',
    });
    expect((await state(sessionless.id)).status).toBe('QUEUED');
    expect(await queues.hasProcessingJob(sessionless.id)).toBe(false);
    expect((await state(running.id)).status).toBe('PROCESSING');
    expect((await state(recent.id)).status).toBe('PROCESSING');
    expect(await queues.hasProcessingJob(recent.id)).toBe(false);

    // Taken up once: the next pass finds nothing.
    expect(await maintenance.reviveStuck()).toEqual({
      requeued: 0,
      failed: 0,
      edits: 0,
    });
  });

  it('deleting files tries every key and fails after, to be tried again', async () => {
    const storage = worker.get(StorageService);
    const tried: string[] = [];
    const del = vi
      .spyOn(storage, 'deleteObjects')
      .mockImplementation(async (_bucket, keys) => {
        tried.push(...keys);
        if (keys[0] === 'b') throw new Error('storage away');
      });
    await expect(
      maintenance.deleteFiles({ private: ['a', 'b', 'c'], public: ['d'] }),
    ).rejects.toThrow('private:b (storage away)');
    expect(tried).toEqual(['a', 'b', 'c', 'd']);
    del.mockRestore();
  });

  it('an edit whose render is gone fails as a failed render does', async () => {
    const v = await video({
      status: 'PROCESSING',
      stage: 'EDIT',
      editRevision: 2,
      editJob: {
        revision: 2,
        mode: 'replace',
        spec: null,
        requestedById: annId,
        requestedAt: new Date().toISOString(),
        status: 'queued',
        progress: 0,
        error: null,
      },
    });
    await age(v.id);
    expect(await maintenance.reviveStuck()).toEqual({
      requeued: 0,
      failed: 0,
      edits: 1,
    });
    expect(await state(v.id)).toMatchObject({
      status: 'READY',
      stage: null,
      editJob: expect.objectContaining({ status: 'failed', error: 'internal' }),
    });
  });

  it('a video deleted before its processing ended is processed when it comes back from the trash', async () => {
    await prisma.user.update({
      where: { id: annId },
      data: { storageUsedBytes: 2000n },
    });
    const v = await video({
      status: 'PROCESSING',
      stage: 'FRAMES',
      processingAttempts: 1,
    });
    await ann.delete(`/api/videos/${v.id}`).expect(200);
    expect(await queues.hasProcessingJob(v.id)).toBe(false);
    await ann.post(`/api/me/trash/${v.id}/restore`).expect(200);
    expect(await state(v.id)).toMatchObject({ status: 'QUEUED', stage: null });
    expect(await queues.hasProcessingJob(v.id)).toBe(true);

    // One that was ready stays as it was.
    const ready = await video({ status: 'READY' });
    await ann.delete(`/api/videos/${ready.id}`).expect(200);
    await ann.post(`/api/me/trash/${ready.id}/restore`).expect(200);
    expect((await state(ready.id)).status).toBe('READY');
    expect(await queues.hasProcessingJob(ready.id)).toBe(false);
  });
});

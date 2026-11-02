import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { UploadsService } from '../src/modules/uploads/uploads.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

const MiB = 1024 * 1024;
const ANN = {
  email: 'ann@example.com',
  username: 'ann',
  password: 'secret123',
};

describe('uploads (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let queues: QueueService;
  let settings: SettingsService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    queues = app.get(QueueService);
    settings = app.get(SettingsService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await setLimits({ maxFileBytes: 64 * MiB, storageQuotaBytes: 10 * MiB });
  });

  afterAll(async () => {
    await app.close();
  });

  async function setLimits(
    over: Partial<(typeof SETTING_DEFAULTS.tiers)['BASIC']>,
  ) {
    const basic = { ...SETTING_DEFAULTS.tiers.BASIC, ...over };
    await settings.set('tiers', { BASIC: basic, PREMIUM: basic });
  }

  /** create → presign → PUT bytes straight to S3; returns what `complete` needs. */
  async function uploadBytes(
    c: ReturnType<typeof client>,
    bytes: Buffer,
    filename = 'clip.mp4',
  ) {
    const session = (
      await c
        .post('/api/uploads')
        .send({ filename, size: bytes.length, mimeType: 'video/mp4' })
        .expect(200)
    ).body;
    const partNumbers = Array.from(
      { length: session.partCount },
      (_, i) => i + 1,
    );
    const presigned = (
      await c
        .post(`/api/uploads/${session.id}/parts`)
        .send({ partNumbers })
        .expect(200)
    ).body;
    const parts: { partNumber: number; etag: string }[] = [];
    for (const p of presigned.parts) {
      const chunk = bytes.subarray(
        (p.partNumber - 1) * session.partSize,
        p.partNumber * session.partSize,
      );
      const res = await fetch(p.url, {
        method: 'PUT',
        body: new Blob([Uint8Array.from(chunk)]),
      });
      expect(res.status).toBe(200);
      parts.push({ partNumber: p.partNumber, etag: res.headers.get('etag')! });
    }
    return { session, parts };
  }

  it('requires a confirmed email', async () => {
    const c = client(app);
    await signUp(app, c, { ...ANN, verified: false });
    const res = await c
      .post('/api/uploads')
      .send({ filename: 'a.mp4', size: 10 })
      .expect(403);
    expect(res.body.code).toBe('emailNotVerified');
  });

  it('rejects files over the per-file limit with the limit in the message', async () => {
    const c = client(app);
    await signUp(app, c, ANN);
    await setLimits({ maxFileBytes: 1 * MiB });
    const res = await c
      .post('/api/uploads')
      .send({ filename: 'big.mp4', size: 2 * MiB })
      .expect(400);
    expect(res.body.code).toBe('fileTooLarge');
    expect(res.body.message).toContain('1.0 MiB');
  });

  it('an admin has no storage quota and no file size limit', async () => {
    const c = client(app);
    const id = await signUp(app, c, ANN);
    await makeAdmin(prisma, id);
    for (const name of ['a.mp4', 'b.mp4', 'c.mp4'])
      await c
        .post('/api/uploads')
        .send({ filename: name, size: 6 * MiB })
        .expect(200);
    expect((await c.get('/api/uploads/quota').expect(200)).body).toMatchObject({
      reservedBytes: 18 * MiB,
      quotaBytes: 0,
      maxFileBytes: 0,
    });
    await setLimits({ maxFileBytes: 1 * MiB });
    await c
      .post('/api/uploads')
      .send({ filename: 'big.mp4', size: 2 * MiB })
      .expect(200);
  });

  it('reserves quota while uploads are in progress and releases it on cancel', async () => {
    const c = client(app);
    await signUp(app, c, ANN);
    const first = (
      await c
        .post('/api/uploads')
        .send({ filename: 'a.mp4', size: 6 * MiB })
        .expect(200)
    ).body;
    expect(first.partSize).toBe(16 * MiB);
    expect(first.partCount).toBe(1);
    const second = await c
      .post('/api/uploads')
      .send({ filename: 'b.mp4', size: 6 * MiB })
      .expect(400);
    expect(second.body.code).toBe('quotaExceeded');
    expect((await c.get('/api/uploads/quota').expect(200)).body).toMatchObject({
      usedBytes: 0,
      reservedBytes: 6 * MiB,
      quotaBytes: 10 * MiB,
    });
    expect((await c.get('/api/uploads').expect(200)).body).toHaveLength(1);
    await c.delete(`/api/uploads/${first.id}`).expect(200);
    expect(
      (await c.get('/api/uploads/quota').expect(200)).body.reservedBytes,
    ).toBe(0);
    expect((await c.get('/api/uploads').expect(200)).body).toHaveLength(0);
    await c
      .post('/api/uploads')
      .send({ filename: 'b.mp4', size: 6 * MiB })
      .expect(200);
  });

  it('uploads straight to S3, resumes from ListParts, completes and queues processing', async () => {
    const c = client(app);
    const userId = await signUp(app, c, ANN);
    const bytes = randomBytes(2 * MiB);
    const { session, parts } = await uploadBytes(c, bytes, 'My Holiday.MOV');

    const resumed = (await c.get(`/api/uploads/${session.id}`).expect(200))
      .body;
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.uploadedParts).toEqual([
      { partNumber: 1, etag: parts[0]!.etag.replace(/"/g, ''), size: 2 * MiB },
    ]);

    // A title of spaces alone is no title: refused before anything is stored.
    await c
      .post(`/api/uploads/${session.id}/complete`)
      .send({ parts, title: '   ', visibility: 'PRIVATE' })
      .expect(400);
    const video = (
      await c
        .post(`/api/uploads/${session.id}/complete`)
        .send({
          parts,
          title: '  My holiday  ',
          description: '',
          visibility: 'PRIVATE',
          sensitive: true,
        })
        .expect(200)
    ).body;
    expect(video).toMatchObject({
      id: session.id,
      title: 'My holiday',
      description: null,
      sensitive: true,
      status: 'QUEUED',
      progress: 0,
      sizeBytes: 2 * MiB,
      originalFilename: 'My Holiday.MOV',
      thumbnailUrl: null,
      frames: [],
    });
    expect(
      await storage.head('private', `videos/${session.id}/original.mov`),
    ).toMatchObject({ size: 2 * MiB });

    const holding = await prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId: video.id, holderId: userId } },
    });
    expect(holding?.source).toBe('AUTHOR');
    expect(
      Number(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
          .storageUsedBytes,
      ),
    ).toBe(2 * MiB);
    expect(
      (
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).status,
    ).toBe('COMPLETED');
    expect((await c.get('/api/uploads/quota').expect(200)).body).toMatchObject({
      usedBytes: 2 * MiB,
      reservedBytes: 0,
    });

    // Unsorted, it waits in the owner's Inbox; the size as uploaded is kept.
    expect(
      await prisma.videoAccess.findFirstOrThrow({
        where: { videoId: video.id },
      }),
    ).toMatchObject({ inbox: true, categoryId: null });
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: video.id } }))
        .uploadedSize,
    ).toBe(BigInt(2 * MiB));

    const job = await queues.remux.getJob(video.id);
    expect(job?.data).toEqual({ videoId: video.id, userId });
    expect(await job!.getState()).toBe('waiting');

    // Completing again is idempotent; listing and editing work; the session is no longer resumable.
    expect(
      (
        await c
          .post(`/api/uploads/${session.id}/complete`)
          .send({
            parts,
            title: 'x',
            visibility: 'PUBLIC',
          })
          .expect(200)
      ).body.title,
    ).toBe('My holiday');
    const list = (await c.get('/api/videos/mine').expect(200)).body;
    expect(list.items.map((v: { id: string }) => v.id)).toEqual([video.id]);
    expect(list.nextCursor).toBeNull();
    const patched = (
      await c
        .patch(`/api/videos/${video.id}`)
        .send({ title: 'Renamed', visibility: 'PUBLIC' })
        .expect(200)
    ).body;
    expect(patched).toMatchObject({ title: 'Renamed', visibility: 'PUBLIC' });
    expect(
      (
        await c
          .post(`/api/uploads/${session.id}/parts`)
          .send({ partNumbers: [1] })
          .expect(409)
      ).body.code,
    ).toBe('uploadNotActive');
  });

  it('rejects a completed object whose size differs from the announced one', async () => {
    const c = client(app);
    const userId = await signUp(app, c, ANN);
    const session = (
      await c
        .post('/api/uploads')
        .send({ filename: 'a.mp4', size: 2 * MiB })
        .expect(200)
    ).body;
    const presigned = (
      await c
        .post(`/api/uploads/${session.id}/parts`)
        .send({ partNumbers: [1] })
        .expect(200)
    ).body;
    const res = await fetch(presigned.parts[0].url, {
      method: 'PUT',
      body: new Blob([Uint8Array.from(randomBytes(1 * MiB))]),
    });
    const parts = [{ partNumber: 1, etag: res.headers.get('etag')! }];
    const fail = await c
      .post(`/api/uploads/${session.id}/complete`)
      .send({ parts, title: 'a', visibility: 'PRIVATE' })
      .expect(400);
    expect(fail.body.code).toBe('uploadSizeMismatch');
    expect(
      await storage.head(
        'private',
        session.key ?? `videos/${session.id}/original.mp4`,
      ),
    ).toBeNull();
    expect(
      (
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).status,
    ).toBe('ABORTED');
    expect(await prisma.video.count({ where: { authorId: userId } })).toBe(0);
    expect(
      (await c.get('/api/uploads/quota').expect(200)).body.reservedBytes,
    ).toBe(0);
  });

  it('refuses a category that is not the uploader’s and keeps the upload resumable', async () => {
    const c = client(app);
    await signUp(app, c, ANN);
    const { session, parts } = await uploadBytes(c, randomBytes(MiB));
    const res = await c
      .post(`/api/uploads/${session.id}/complete`)
      .send({
        parts,
        title: 'a',
        visibility: 'PRIVATE',
        categoryId: '0199d1c0-1111-7000-8000-000000000001',
      })
      .expect(400);
    expect(res.body.code).toBe('categoryNotFound');
    expect(
      (await c.get(`/api/uploads/${session.id}`).expect(200)).body.status,
    ).toBe('ACTIVE');
  });

  it('expires abandoned sessions: aborts in S3 and frees the reservation', async () => {
    const c = client(app);
    await signUp(app, c, ANN);
    const { session } = await uploadBytes(c, randomBytes(MiB));
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(UploadsService).expireStale()).toBe(1);
    expect(
      (
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).status,
    ).toBe('EXPIRED');
    expect(
      (await c.get(`/api/uploads/${session.id}`).expect(200)).body.status,
    ).toBe('EXPIRED');
    expect(
      (await c.get('/api/uploads/quota').expect(200)).body.reservedBytes,
    ).toBe(0);
    const row = await prisma.uploadSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    await expect(
      storage.listParts(row.key, row.s3UploadId),
    ).rejects.toMatchObject({ name: 'NoSuchUpload' });
  });

  it('a session in use does not expire: each use moves its end a day on, a week after its start at most', async () => {
    const c = client(app);
    await signUp(app, c, ANN);
    const { session } = await uploadBytes(c, randomBytes(MiB));
    const H = 3600 * 1000;
    const presign = () =>
      c
        .post(`/api/uploads/${session.id}/parts`)
        .send({ partNumbers: [1] })
        .expect(200);
    const row = () =>
      prisma.uploadSession.findUniqueOrThrow({ where: { id: session.id } });
    // Begun 23 hours ago and still uploading (a slow line, or paused overnight).
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() - 23 * H),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await presign();
    expect((await row()).expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * H,
    );
    // Close to a week after its start it is moved no further than that week.
    const createdAt = new Date(Date.now() - 7 * 24 * H + 2 * H);
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { createdAt, expiresAt: new Date(Date.now() + 60_000) },
    });
    await presign();
    expect((await row()).expiresAt.getTime()).toBe(
      createdAt.getTime() + 7 * 24 * H,
    );
  });

  it('queues a contact-sheet re-render on rename and a thumbnail job for a custom second', async () => {
    const c = client(app);
    const userId = await signUp(app, c, ANN);
    const { session, parts } = await uploadBytes(c, randomBytes(MiB));
    const video = (
      await c
        .post(`/api/uploads/${session.id}/complete`)
        .send({
          parts,
          title: 'Clip',
          visibility: 'PRIVATE',
        })
        .expect(200)
    ).body;
    // Not processed yet: a rename does not touch the sheet queue, a custom second is refused.
    await c
      .patch(`/api/videos/${video.id}`)
      .send({ title: 'Clip 2' })
      .expect(200);
    expect(await queues.thumbnail.getJob(`sheet_${video.id}`)).toBeFalsy();
    expect(
      (
        await c
          .put(`/api/videos/${video.id}/thumbnail`)
          .send({ timestampSec: 1 })
          .expect(409)
      ).body.code,
    ).toBe('videoNotReady');

    // Pretend the worker finished.
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'READY',
        durationSec: 10,
        contactSheetKey: 'v/x/sheet.jpg',
        assetPrefix: 'v/x',
      },
    });
    await c
      .patch(`/api/videos/${video.id}`)
      .send({ title: 'Clip 3' })
      .expect(200);
    const sheetJob = await queues.thumbnail.getJob(`sheet_${video.id}`);
    expect(sheetJob?.data).toEqual({ videoId: video.id, userId });
    expect(sheetJob?.opts.delay).toBeGreaterThan(0);
    expect(
      (
        await c
          .put(`/api/videos/${video.id}/thumbnail`)
          .send({ timestampSec: 11 })
          .expect(400)
      ).body.code,
    ).toBe('timestampOutOfRange');
    await c
      .put(`/api/videos/${video.id}/thumbnail`)
      .send({ timestampSec: 4.5 })
      .expect(200);
    const thumbJobs = (
      await queues.thumbnail.getJobs(['waiting', 'delayed'])
    ).filter((j) => j.name === 'thumbnail');
    expect(thumbJobs.map((j) => j.data)).toEqual([
      { videoId: video.id, userId, timestampSec: 4.5 },
    ]);
    expect(
      (
        await c
          .put(`/api/videos/${video.id}/thumbnail`)
          .send({ frameIndex: 3 })
          .expect(400)
      ).body.code,
    ).toBe('frameNotFound');
  });

  it('hides other users’ uploads and videos', async () => {
    const ann = client(app);
    await signUp(app, ann, ANN);
    const bob = client(app);
    await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    const { session } = await uploadBytes(ann, randomBytes(MiB));
    expect(
      (await bob.get(`/api/uploads/${session.id}`).expect(404)).body.code,
    ).toBe('uploadNotFound');
    expect(
      (await bob.get(`/api/videos/${session.id}`).expect(404)).body.code,
    ).toBe('videoNotFound');
  });
});

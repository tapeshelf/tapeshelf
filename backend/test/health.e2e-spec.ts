import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import type { Redis } from 'ioredis';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module.js';
import { WORKER_HEARTBEAT_KEY } from '../src/modules/health/health.service.js';
import { createTestApp, resetDatabase } from './utils/test-app.js';

describe('GET /api/health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database and redis as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { db: 'up', redis: 'up' },
    });
    expect(typeof res.body.uptimeSec).toBe('number');
  });

  it('names its build in the body and on every response (APP_VERSION, "dev" outside an image)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.version).toBe('dev');
    expect(res.headers['x-tapeshelf-api']).toBe('dev');
    const missing = await request(app.getHttpServer()).get('/api/nope');
    expect(missing.headers['x-tapeshelf-api']).toBe('dev');
  });

  it('returns the shared error shape for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'notFound' });
  });

  it('localizes error messages from Accept-Language', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/nope')
      .set('Accept-Language', 'ru-RU,ru;q=0.9')
      .expect(404);
    expect(res.body.message).toBe('Не найдено.');
  });

  it('ops: alerts when no worker is alive or the outbox is stuck', async () => {
    await resetDatabase(app);
    const redis = app.get<Redis>(REDIS_CLIENT);
    const ops = () =>
      request(app.getHttpServer())
        .get('/api/health/ops')
        .set('X-Ops-Token', 'test-ops-token-0123456789');
    // Without the token: the status a monitor needs, none of the numbers.
    const outsider = await request(app.getHttpServer())
      .get('/api/health/ops')
      .expect(503);
    expect(outsider.body).toEqual({ status: 'alert' });

    const down = await ops().expect(503);
    expect(down.body).toMatchObject({
      status: 'alert',
      workerSeenSecAgo: null,
      outboxPending: 0,
    });

    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now() - 5000));
    const ok = await ops().expect(200);
    expect(ok.body.status).toBe('ok');
    expect(ok.body.workerSeenSecAgo).toBeGreaterThanOrEqual(4);

    await app.get(PrismaService).outboxEvent.create({
      data: {
        type: 'notify',
        payload: { deliveries: [] },
        createdAt: new Date(Date.now() - 11 * 60_000),
      },
    });
    const stuck = await ops().expect(503);
    expect(stuck.body).toMatchObject({ status: 'alert', outboxPending: 1 });
    expect(stuck.body.outboxOldestSec).toBeGreaterThanOrEqual(660);

    // An event that gave up for good (parked) is an alert too.
    await app.get(PrismaService).outboxEvent.deleteMany();
    expect((await ops().expect(200)).body.status).toBe('ok');
    await app.get(PrismaService).outboxEvent.create({
      data: {
        type: 'billing.cancel',
        payload: {},
        processedAt: new Date(),
        attempts: 48,
        lastError: 'Paddle did not answer',
      },
    });
    expect((await ops().expect(503)).body).toMatchObject({
      status: 'alert',
      outboxParked24h: 1,
    });

    // A video "processing" untouched for an hour is stuck past the watchdog: an alert. A
    // failed one is only counted.
    const prisma = app.get(PrismaService);
    await prisma.outboxEvent.deleteMany();
    const author = await prisma.user.create({
      data: { email: 'ops@example.com', username: 'ops', displayName: 'Ops' },
    });
    const video = (status: 'PROCESSING' | 'FAILED') =>
      prisma.video.create({
        data: {
          authorId: author.id,
          title: status,
          status,
          originalKey: 'x',
          originalFilename: 'x.mp4',
          sizeBytes: 1n,
        },
      });
    await video('FAILED');
    const late = await video('PROCESSING');
    expect((await ops().expect(200)).body).toMatchObject({
      status: 'ok',
      videosStuck: 0,
      videosFailed24h: 1,
    });
    await prisma.$executeRaw`UPDATE "Video" SET "updatedAt" = now() - interval '2 hours' WHERE id = ${late.id}::uuid`;
    expect((await ops().expect(503)).body).toMatchObject({
      status: 'alert',
      videosStuck: 1,
    });
    await redis.del(WORKER_HEARTBEAT_KEY);
  });
});

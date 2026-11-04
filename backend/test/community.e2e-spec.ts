import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { PlanExpiryService } from '../src/modules/plans/plan-expiry.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

// The other suites run as the cloud (.env.test: EDITION=cloud). The environment is validated when
// the app module is imported, so the switch has to happen before the imports above run.
vi.hoisted(() => {
  process.env.EDITION = 'community';
});

type C = ReturnType<typeof client>;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const KEY = 'community-test/original.mp4';

/**
 * A self-hosted instance: no tiers, no tariff and no payment. One set of limits for every
 * account, without a limit on file or shelf until the admin sets one; downloads go straight to
 * storage; tiers cannot be handed out and tier.expire does nothing.
 */
describe('self-hosted instance (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: C, ann: C;
  let annId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await app.get(StorageService).put('private', {
      key: KEY,
      body: Buffer.alloc(64 * 1024),
      contentType: 'video/mp4',
    });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = client(app);
    ann = client(app);
    const adminId = await signUp(app, admin, {
      email: 'boss@example.com',
      username: 'boss',
      password: 'secret123',
    });
    await makeAdmin(prisma, adminId);
    annId = await signUp(app, ann, {
      email: 'ann@example.com',
      username: 'ann',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
    process.env.EDITION = 'cloud';
  });

  const startUpload = (size: number) =>
    ann
      .post('/api/uploads')
      .send({ filename: 'big.mp4', size, mimeType: 'video/mp4' });
  const settings = async () =>
    (await admin.get('/api/admin/settings').expect(200)).body;

  it('says it is self-hosted; every account has the one set of limits and no tier', async () => {
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body.edition).toBe('community');

    const me = (await ann.get('/api/auth/me').expect(200)).body;
    expect(me.plan).toMatchObject({
      until: null,
      source: null,
      limits: {
        maxFileBytes: 0,
        storageQuotaBytes: 0,
        requestsPerDay: 30,
        downloadsPerMonth: 0,
        downloadSpeedBytesPerSec: 0,
        downloadConcurrency: 0,
        trafficBytesPerMonth: 0,
        trashRetentionDays: 90,
        apiRateMultiplier: 1,
      },
    });
    expect(
      (await ann.get('/api/me/trash').expect(200)).body.retentionDays,
    ).toBe(90);

    // Even an account marked PREMIUM before (say, a database moved from the cloud) gets the same.
    await prisma.user.update({
      where: { id: annId },
      data: { tier: 'PREMIUM', tierUntil: null, tierSource: 'ADMIN' },
    });
    const again = (await ann.get('/api/auth/me').expect(200)).body;
    expect(again.plan.limits).toEqual(me.plan.limits);
    expect(again.plan).toMatchObject({ until: null, source: null });
  });

  it('has no limit on file or shelf until the admin sets one, then keeps to it', async () => {
    expect(
      (await ann.get('/api/uploads/quota').expect(200)).body,
    ).toMatchObject({ quotaBytes: 0, maxFileBytes: 0 });
    // 40 GiB: over every cloud limit, fine here (the session only reserves the space).
    const big = await startUpload(40 * GiB).expect(200);
    await ann.delete(`/api/uploads/${big.body.id}`).expect(200);
    // What a multipart upload cannot carry is refused with that size, not with "0 B".
    const huge = await startUpload(200 * GiB).expect(400);
    expect(huge.body.code).toBe('fileTooLarge');
    expect(huge.body.message).toContain('156 GiB');

    const s = await settings();
    expect(s.limits).toEqual(SETTING_DEFAULTS.limits);
    await admin
      .put('/api/admin/settings')
      .send({
        ...s,
        limits: { ...s.limits, maxFileBytes: GiB, storageQuotaBytes: 2 * GiB },
      })
      .expect(200);
    expect(
      (await ann.get('/api/uploads/quota').expect(200)).body,
    ).toMatchObject({ quotaBytes: 2 * GiB, maxFileBytes: GiB });
    expect((await startUpload(GiB + 1).expect(400)).body.code).toBe(
      'fileTooLarge',
    );
    const first = await startUpload(GiB).expect(200);
    await startUpload(GiB).expect(200);
    expect((await startUpload(MiB).expect(400)).body.code).toBe(
      'quotaExceeded',
    );
    await ann.delete(`/api/uploads/${first.body.id}`).expect(200);
    await startUpload(MiB).expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.update' },
    });
    expect(audit?.meta).toMatchObject({
      limits: { to: { maxFileBytes: GiB, storageQuotaBytes: 2 * GiB } },
    });
  });

  it('downloads go straight to storage, uncounted, for everyone', async () => {
    const video = await prisma.video.create({
      data: {
        authorId: annId,
        title: 'Holiday',
        visibility: 'PUBLIC',
        status: 'READY',
        originalKey: KEY,
        originalFilename: 'holiday.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(64 * 1024),
        holdings: { create: { holderId: annId, source: 'AUTHOR' } },
      },
    });
    const bob = client(app);
    await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    const page = await bob.get(`/api/downloads/${video.code}`).expect(200);
    expect(page.body).toMatchObject({ direct: true });
    for (let i = 0; i < 12; i++) {
      const t = await bob.post(`/api/videos/${video.id}/download`).expect(200);
      expect(t.body.direct).toBe(true);
      expect(t.body.url).toMatch(/X-Amz-Signature=/);
    }
    const me = (await bob.get('/api/auth/me').expect(200)).body;
    expect(me.plan.usage.downloadsThisMonth).toBe(0);
  });

  it('has no payments: billing answers 404, nothing about Pro in the plan or notifications', async () => {
    const guest = request(app.getHttpServer());
    expect((await guest.get('/api/billing').expect(404)).body.code).toBe(
      'billingDisabled',
    );
    await guest
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send({ event_id: 'evt_1' })
      .expect(404);
    await ann.post('/api/billing/portal').expect(404);
    expect(
      (await ann.get('/api/auth/me').expect(200)).body.plan.subscription,
    ).toBeNull();
    const types = (
      await ann.get('/api/me/notification-preferences').expect(200)
    ).body.map((p: { type: string }) => p.type) as string[];
    expect(types).toContain('VIDEO_PROCESSED');
    expect(types.filter((t) => t.startsWith('PLAN_'))).toEqual([]);
    // No Pro badge, even on an account marked PREMIUM before.
    await prisma.user.update({
      where: { id: annId },
      data: { tier: 'PREMIUM' },
    });
    const profile = await guest.get('/api/users/ann').expect(200);
    expect(profile.body.pro).toBe(false);
  });

  it('tiers cannot be handed out, and tier.expire leaves accounts alone', async () => {
    for (const body of [{ tier: 'PREMIUM' }, { tierUntil: null }]) {
      const res = await admin
        .patch(`/api/admin/users/${annId}`)
        .send(body)
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'tiersDisabled',
        message: 'This server has no plans.',
      });
    }
    const detail = (await admin.get(`/api/admin/users/${annId}`).expect(200))
      .body;
    expect(detail).toMatchObject({
      quotaBytes: 0,
      tierUntil: null,
      tierSource: null,
    });

    // A PREMIUM that "ended" yesterday or ends tomorrow: no reminder, no end, no notification.
    await prisma.user.update({
      where: { id: annId },
      data: {
        tier: 'PREMIUM',
        tierUntil: new Date(Date.now() - 24 * 3600 * 1000),
      },
    });
    expect(await app.get(PlanExpiryService).run()).toEqual({
      expired: 0,
      reminded: 0,
    });
    await app.get(OutboxRelayService).drain();
    expect(
      (await ann.get('/api/notifications').expect(200)).body.items,
    ).toEqual([]);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: annId },
        select: { tier: true },
      }),
    ).toEqual({ tier: 'PREMIUM' });
  });
});

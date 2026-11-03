import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';

import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { PlanExpiryService } from '../src/modules/plans/plan-expiry.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const GiB = 1024 ** 3;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * Plans: public limits, the user's
 * plan, PREMIUM by hand with an end date, the end taking effect at once, and the hourly tier.expire
 * job with its reminders.
 */
describe('plans (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let expiry: PlanExpiryService;
  let admin: C, ann: C;
  let annId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    expiry = app.get(PlanExpiryService);
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
  });

  const me = async () => (await ann.get('/api/auth/me').expect(200)).body;
  const startUpload = (size: number) =>
    ann
      .post('/api/uploads')
      .send({ filename: 'big.mp4', size, mimeType: 'video/mp4' });
  const notes = async () => {
    await relay.drain();
    return (await ann.get('/api/notifications').expect(200)).body.items as {
      type: string;
      payload: Record<string, unknown>;
    }[];
  };
  const setPremium = (tierUntil: string | null) =>
    admin
      .patch(`/api/admin/users/${annId}`)
      .send({ tier: 'PREMIUM', tierUntil });

  it('publishes the limits of both tiers to guests, also in the site info', async () => {
    const plans = await request(app.getHttpServer())
      .get('/api/plans')
      .expect(200);
    expect(plans.headers['cache-control']).toBe('public, max-age=300');
    expect(plans.body).toEqual({
      edition: 'cloud',
      tiers: SETTING_DEFAULTS.tiers,
    });
    expect(plans.body.tiers.BASIC).toMatchObject({
      maxFileBytes: 500 * 1024 ** 2,
      storageQuotaBytes: 5 * GiB,
    });
    expect(plans.body.tiers.PREMIUM).toMatchObject({
      maxFileBytes: 5 * GiB,
      storageQuotaBytes: 200 * GiB,
      apiRateMultiplier: 3,
    });
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body).toMatchObject({
      edition: 'cloud',
      plans: SETTING_DEFAULTS.tiers,
    });
  });

  it('a new account is on BASIC with its limits and usage', async () => {
    const body = await me();
    expect(body.tier).toBe('BASIC');
    expect(body.plan).toEqual({
      tier: 'BASIC',
      until: null,
      source: null,
      limits: SETTING_DEFAULTS.tiers.BASIC,
      usage: {
        storageBytes: 0,
        downloadsThisMonth: 0,
        downloadsResetAt: expect.stringMatching(
          /^\d{4}-\d{2}-01T00:00:00\.000Z$/,
        ),
      },
      subscription: null,
    });
  });

  it('an admin grants PREMIUM until a date: limits change at once, audited; past dates are refused', async () => {
    await startUpload(3 * GiB).expect(400);
    const until = new Date(Date.now() + 30 * DAY).toISOString();
    const detail = (await setPremium(until).expect(200)).body;
    expect(detail).toMatchObject({
      tier: 'PREMIUM',
      tierUntil: until,
      tierSource: 'ADMIN',
      quotaBytes: 200 * GiB,
    });
    expect((await me()).plan).toMatchObject({
      tier: 'PREMIUM',
      until,
      source: 'ADMIN',
      limits: SETTING_DEFAULTS.tiers.PREMIUM,
    });
    await startUpload(3 * GiB).expect(200);

    const past = await setPremium(new Date(Date.now() - HOUR).toISOString());
    expect(past.status).toBe(400);
    expect(past.body.code).toBe('tierUntilPast');

    // No end at all, then back to BASIC (the date goes with it).
    await setPremium(null).expect(200);
    expect((await me()).plan).toMatchObject({ tier: 'PREMIUM', until: null });
    await admin
      .patch(`/api/admin/users/${annId}`)
      .send({ tier: 'BASIC' })
      .expect(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: annId } });
    expect(row).toMatchObject({
      tier: 'BASIC',
      tierUntil: null,
      tierSource: null,
    });
    const log = await prisma.auditLog.findMany({
      where: { action: 'user.tier' },
      orderBy: { id: 'asc' },
    });
    expect(log.map((l) => l.meta)).toEqual([
      {
        username: 'ann',
        from: 'BASIC',
        to: 'PREMIUM',
        fromUntil: null,
        until,
      },
      {
        username: 'ann',
        from: 'PREMIUM',
        to: 'PREMIUM',
        fromUntil: until,
        until: null,
      },
      {
        username: 'ann',
        from: 'PREMIUM',
        to: 'BASIC',
        fromUntil: null,
        until: null,
      },
    ]);
  });

  it('PREMIUM past its end counts as BASIC at once; tier.expire writes it down and tells the user once', async () => {
    await prisma.user.update({
      where: { id: annId },
      data: {
        tier: 'PREMIUM',
        tierSource: 'ADMIN',
        tierUntil: new Date(Date.now() - HOUR),
        // 40 GiB of originals: over the BASIC quota, so uploads stop.
        storageUsedBytes: BigInt(40 * GiB),
      },
    });
    expect((await me()).plan).toMatchObject({
      tier: 'BASIC',
      until: null,
      source: null,
    });
    const blocked = await startUpload(100 * 1024 ** 2).expect(400);
    expect(blocked.body.code).toBe('quotaExceeded');

    expect(await expiry.run()).toEqual({ expired: 1, reminded: 0 });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: annId } }),
    ).toMatchObject({ tier: 'BASIC', tierUntil: null, tierSource: null });
    const ended = (await notes()).filter((n) => n.type === 'PLAN_EXPIRED');
    expect(ended).toHaveLength(1);
    expect(ended[0]!.payload).toEqual({
      maxFileBytes: 500 * 1024 ** 2,
      storageQuotaBytes: 5 * GiB,
      overQuota: true,
    });
    // Nothing on the shelf was touched and a second run has nothing to do.
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 0 });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
        .storageUsedBytes,
    ).toBe(BigInt(40 * GiB));
  });

  it('reminds a week before and on the last day, once each; a new end date re-arms them', async () => {
    await setPremium(new Date(Date.now() + 3 * DAY).toISOString()).expect(200);
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 1 });
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 0 });

    // The last day comes: the second reminder, then silence.
    const lastDay = new Date(Date.now() + 2.5 * DAY);
    expect(await expiry.run(lastDay)).toEqual({ expired: 0, reminded: 1 });
    expect(await expiry.run(lastDay)).toEqual({ expired: 0, reminded: 0 });
    const reminders = (await notes()).filter((n) => n.type === 'PLAN_EXPIRING');
    expect(reminders).toHaveLength(2);

    // Extended by an admin: the week reminder comes again for the new date.
    const until = new Date(Date.now() + 5 * DAY).toISOString();
    await setPremium(until).expect(200);
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 1 });
    const latest = (await notes()).find((n) => n.type === 'PLAN_EXPIRING');
    expect(latest!.payload).toEqual({ until });
  });

  it('a short grant gets only the last-day reminder; a far end date none yet', async () => {
    await setPremium(new Date(Date.now() + 6 * HOUR).toISOString()).expect(200);
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 1 });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
        .tierReminder,
    ).toBe(1);
    await setPremium(new Date(Date.now() + 60 * DAY).toISOString()).expect(200);
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 0 });
  });
});

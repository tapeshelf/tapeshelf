import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { signPaddle } from '../src/modules/billing/paddle-signature.js';
import { RENEWAL_SLACK_MS } from '../src/modules/billing/subscription-access.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { PlanExpiryService } from '../src/modules/plans/plan-expiry.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { type PaddleStub, startPaddleStub } from './utils/paddle-stub.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const DAY = 24 * 3600 * 1000;
const SECRET = process.env['PADDLE_WEBHOOK_SECRET']!;

/**
 * Pro subscriptions through Paddle: prices from the API, signed
 * webhooks applied once and by their own time, the account's tier following its subscription
 * (renewing, cancelled, failed renewal with a limited grace, ended), the customer portal and the
 * subscription stopped when the account is deleted.
 */
describe('billing (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let expiry: PlanExpiryService;
  let stub: PaddleStub;
  let admin: C, ann: C;
  let annId: string;
  let seq = 0;

  beforeAll(async () => {
    stub = await startPaddleStub();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    expiry = app.get(PlanExpiryService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    stub.calls.length = 0;
    stub.statuses.clear();
    stub.scheduled.clear();
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
    await stub.close();
  });

  const at = (days: number, from = Date.now()) => new Date(from + days * DAY);

  /** A Paddle subscription entity as webhooks carry it. */
  const sub = (over: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    status: 'active',
    customer_id: 'ctm_1',
    current_billing_period: {
      starts_at: at(-1).toISOString(),
      ends_at: at(30).toISOString(),
    },
    billing_cycle: { interval: 'month', frequency: 1 },
    scheduled_change: null,
    items: [{ price: { id: 'pri_month' } }],
    custom_data: { userId: annId },
    ...over,
  });

  /** Posts a signed webhook, as Paddle would. */
  function webhook(
    type: string,
    data: object,
    opts: { at?: Date; id?: string; secret?: string } = {},
  ) {
    const raw = JSON.stringify({
      event_id: opts.id ?? `evt_${++seq}`,
      event_type: type,
      occurred_at: (opts.at ?? new Date()).toISOString(),
      notification_id: 'ntf_1',
      data,
    });
    return request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Paddle-Signature', signPaddle(raw, opts.secret ?? SECRET))
      .send(raw);
  }

  const me = async () => (await ann.get('/api/auth/me').expect(200)).body;
  const tier = () =>
    prisma.user.findUniqueOrThrow({
      where: { id: annId },
      select: { tier: true, tierUntil: true, tierSource: true },
    });
  const notes = async () => {
    await relay.drain();
    return (await ann.get('/api/notifications').expect(200)).body.items as {
      type: string;
      payload: Record<string, unknown>;
    }[];
  };

  it('publishes the prices from Paddle and what Paddle.js needs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/billing')
      .expect(200);
    expect(res.body).toEqual({
      environment: 'sandbox',
      clientToken: 'test_clienttoken',
      month: {
        id: 'pri_month',
        interval: 'month',
        amount: 999,
        currency: 'EUR',
      },
      year: { id: 'pri_year', interval: 'year', amount: 5999, currency: 'EUR' },
    });
    // Cached: the second page view does not ask Paddle again.
    await request(app.getHttpServer()).get('/api/billing').expect(200);
    expect(stub.calls.filter((c) => c.path.startsWith('/prices'))).toHaveLength(
      2,
    );
  });

  it("refuses a webhook from outside Paddle's addresses, even signed", async () => {
    const event = await webhook('subscription.created', sub())
      .set('X-Forwarded-For', '203.0.113.9')
      .expect(403);
    expect(event.body.code).toBe('billingSource');
    expect((await tier()).tier).toBe('BASIC');
  });

  it('refuses a webhook that Paddle did not sign; a duplicate changes nothing', async () => {
    const forged = await webhook('subscription.created', sub(), {
      secret: 'someone-else',
    }).expect(400);
    expect(forged.body.code).toBe('billingSignature');
    await request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .send({ event_id: 'evt_x' })
      .expect(400);
    expect((await tier()).tier).toBe('BASIC');

    await webhook('subscription.created', sub(), { id: 'evt_same' }).expect(
      200,
    );
    // Paddle redelivers the same event: already handled, even if it now reads differently.
    await webhook('subscription.canceled', sub({ status: 'canceled' }), {
      id: 'evt_same',
    }).expect(200);
    expect((await tier()).tier).toBe('PREMIUM');
    expect(await prisma.billingEvent.count()).toBe(1);
  });

  it('a purchase gives Pro to the end of the period, renewing without reminders', async () => {
    const ends = at(30);
    await webhook(
      'subscription.created',
      sub({
        current_billing_period: {
          starts_at: at(-1).toISOString(),
          ends_at: ends.toISOString(),
        },
      }),
    ).expect(200);
    expect(await tier()).toEqual({
      tier: 'PREMIUM',
      tierUntil: new Date(ends.getTime() + RENEWAL_SLACK_MS),
      tierSource: 'PADDLE',
    });
    const plan = (await me()).plan;
    expect(plan).toMatchObject({ tier: 'PREMIUM', source: 'PADDLE' });
    expect(plan.subscription).toEqual({
      status: 'ACTIVE',
      interval: 'month',
      customerId: expect.stringMatching(/^ctm_/),
      renews: true,
      periodEndsAt: ends.toISOString(),
      endsAt: null,
      graceUntil: null,
    });
    const profile = await request(app.getHttpServer())
      .get('/api/users/ann')
      .expect(200);
    expect(profile.body.pro).toBe(true);

    // Five days before a renewal: a renewing subscription gets no "Pro ends" reminder.
    await webhook(
      'subscription.updated',
      sub({
        current_billing_period: {
          starts_at: at(-25).toISOString(),
          ends_at: at(5).toISOString(),
        },
      }),
    ).expect(200);
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 0 });
  });

  it('a cancelled subscription keeps Pro to the end of the paid period, with reminders, then ends', async () => {
    await webhook('subscription.created', sub()).expect(200);
    const end = at(5);
    await webhook(
      'subscription.updated',
      sub({
        scheduled_change: { action: 'cancel', effective_at: end.toISOString() },
      }),
    ).expect(200);
    expect((await tier()).tierUntil).toEqual(end);
    expect((await me()).plan.subscription).toMatchObject({
      renews: false,
      endsAt: end.toISOString(),
    });
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 1 });
    expect((await notes()).map((n) => n.type)).toEqual(['PLAN_EXPIRING']);

    // The period is over: Paddle says canceled. Free at once; tier.expire writes it down.
    await webhook('subscription.canceled', sub({ status: 'canceled' })).expect(
      200,
    );
    expect((await me()).plan).toMatchObject({
      tier: 'BASIC',
      subscription: null,
    });
    expect(await expiry.run()).toMatchObject({ expired: 1 });
    expect((await tier()).tier).toBe('BASIC');
    expect((await notes()).map((n) => n.type)).toContain('PLAN_EXPIRED');
  });

  it('a failed renewal keeps Pro only for the grace period from the first failure', async () => {
    await webhook('subscription.created', sub(), { at: at(-40) }).expect(200);
    const failed = at(-3);
    await webhook('subscription.past_due', sub({ status: 'past_due' }), {
      at: failed,
    }).expect(200);
    const grace = at(7, failed.getTime());
    expect(await tier()).toMatchObject({ tier: 'PREMIUM', tierUntil: grace });
    expect((await me()).plan.subscription).toMatchObject({
      status: 'PAST_DUE',
      graceUntil: grace.toISOString(),
    });
    const failedNotes = (await notes()).filter(
      (n) => n.type === 'PLAN_PAYMENT_FAILED',
    );
    expect(failedNotes).toEqual([
      expect.objectContaining({ payload: { until: grace.toISOString() } }),
    ]);

    // Paddle tries again two days later: the grace is not restarted and nobody is told twice.
    await webhook('subscription.updated', sub({ status: 'past_due' }), {
      at: at(-1),
    }).expect(200);
    expect((await tier()).tierUntil).toEqual(grace);
    expect(
      (await notes()).filter((n) => n.type === 'PLAN_PAYMENT_FAILED'),
    ).toHaveLength(1);
    // The week-before reminder is replaced by the payment notice; the last-day one is not due yet.
    expect(await expiry.run()).toEqual({ expired: 0, reminded: 0 });

    // The payment goes through: Pro to the end of the new period again.
    const ends = at(30);
    await webhook(
      'subscription.updated',
      sub({
        current_billing_period: {
          starts_at: at(0).toISOString(),
          ends_at: ends.toISOString(),
        },
      }),
    ).expect(200);
    expect((await tier()).tierUntil).toEqual(
      new Date(ends.getTime() + RENEWAL_SLACK_MS),
    );
    expect((await me()).plan.subscription).toMatchObject({
      status: 'ACTIVE',
      graceUntil: null,
    });
  });

  it('past the grace the account is Free even while Paddle keeps trying', async () => {
    await webhook('subscription.created', sub(), { at: at(-40) }).expect(200);
    await webhook('subscription.past_due', sub({ status: 'past_due' }), {
      at: at(-8),
    }).expect(200);
    expect((await me()).plan.tier).toBe('BASIC');
    expect(await expiry.run()).toMatchObject({ expired: 1 });
    expect((await notes()).map((n) => n.type)).toContain('PLAN_EXPIRED');
    // A later attempt still failing does not bring Pro back.
    await webhook('subscription.updated', sub({ status: 'past_due' }), {
      at: at(-1),
    }).expect(200);
    expect((await me()).plan.tier).toBe('BASIC');
  });

  it('events are applied by their own time, not by arrival', async () => {
    await webhook('subscription.created', sub(), { at: at(-2) }).expect(200);
    await webhook('subscription.canceled', sub({ status: 'canceled' }), {
      at: at(-1),
    }).expect(200);
    // A delivery Paddle retried late: older than what is known, so ignored.
    await webhook('subscription.updated', sub(), { at: at(-1.5) }).expect(200);
    expect((await me()).plan.tier).toBe('BASIC');
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: 'sub_1' } }))
        .status,
    ).toBe('CANCELED');
  });

  it('a better grant by an admin is left alone; unknown accounts and other events are acknowledged', async () => {
    await admin
      .patch(`/api/admin/users/${annId}`)
      .send({ tier: 'PREMIUM', tierUntil: null })
      .expect(200);
    await webhook('subscription.created', sub()).expect(200);
    expect(await tier()).toMatchObject({
      tier: 'PREMIUM',
      tierUntil: null,
      tierSource: 'ADMIN',
    });

    await webhook(
      'subscription.created',
      sub({
        id: 'sub_2',
        custom_data: { userId: '0199d1c0-0000-7000-8000-00000000dead' },
      }),
    ).expect(200);
    await webhook('transaction.completed', { id: 'txn_1' }).expect(200);
    expect(await prisma.subscription.count({ where: { id: 'sub_2' } })).toBe(0);
  });

  it('opens the customer portal for the subscriber, with deep links', async () => {
    const none = await ann.post('/api/billing/portal').expect(404);
    expect(none.body.code).toBe('noSubscription');
    await webhook('subscription.created', sub()).expect(200);
    const res = await ann.post('/api/billing/portal').expect(200);
    expect(res.body).toEqual({
      url: 'https://customer-portal.paddle.test/ctm_1/overview',
      cancelUrl: 'https://customer-portal.paddle.test/sub_1/cancel',
      updatePaymentUrl: 'https://customer-portal.paddle.test/sub_1/payment',
    });
    expect(stub.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/customers/ctm_1/portal-sessions',
      body: { subscription_ids: ['sub_1'] },
    });
  });

  it('deleting the account stops its subscription at Paddle', async () => {
    await webhook('subscription.created', sub()).expect(200);
    await ann.delete('/api/me').send({ password: 'secret123' }).expect(200);
    await relay.drain();
    expect(stub.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /subscriptions/sub_1',
      'POST /subscriptions/sub_1/cancel',
    ]);
    expect(stub.calls[1]!.body).toEqual({ effective_from: 'immediately' });
  });

  it('a ban cancels the subscription for the end of the paid period; an unban takes it back', async () => {
    const calls = () => stub.calls.map((c) => `${c.method} ${c.path}`);
    await webhook('subscription.created', sub()).expect(200);
    await admin
      .post(`/api/admin/users/${annId}/ban`)
      .send({ reason: 'spam' })
      .expect(200);
    await relay.drain();
    expect(calls()).toEqual([
      'GET /subscriptions/sub_1',
      'POST /subscriptions/sub_1/cancel',
    ]);
    expect(stub.calls[1]!.body).toEqual({
      effective_from: 'next_billing_period',
    });

    stub.calls.length = 0;
    await admin.post(`/api/admin/users/${annId}/unban`).expect(200);
    await relay.drain();
    expect(calls()).toEqual([
      'GET /subscriptions/sub_1',
      'PATCH /subscriptions/sub_1',
    ]);
    expect(stub.calls[1]!.body).toEqual({ scheduled_change: null });

    // A cancel the user scheduled is theirs: a ban leaves it, an unban does not undo it.
    await webhook(
      'subscription.updated',
      sub({
        scheduled_change: {
          action: 'cancel',
          effective_at: at(20).toISOString(),
        },
      }),
    ).expect(200);
    stub.calls.length = 0;
    await admin
      .post(`/api/admin/users/${annId}/ban`)
      .send({ reason: 'spam' })
      .expect(200);
    await admin.post(`/api/admin/users/${annId}/unban`).expect(200);
    await relay.drain();
    expect(calls()).toEqual([]);
  });
});

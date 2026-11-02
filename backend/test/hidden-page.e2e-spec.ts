import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { PlanExpiryService } from '../src/modules/plans/plan-expiry.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Pro users and admins hide their page. It answers 404 to everyone
 * but them and admins (and to the owner previewing it as a visitor); copies others already hold keep
 * playing; the person drops out of other people's public lists and of "What's new"; nobody new may
 * follow them; the page opens again when Pro ends.
 */
describe('hidden page (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let expiry: PlanExpiryService;
  let admin: C, ann: C, bob: C, carl: C, guest: C;
  let annId: string, bobId: string, carlId: string;

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
    bob = client(app);
    carl = client(app);
    guest = client(app);
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
    bobId = await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    carlId = await signUp(app, carl, {
      email: 'carl@example.com',
      username: 'carl',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed(authorId: string, title: string) {
    const v = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PUBLIC',
        status: 'READY',
        readyAt: new Date(),
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    return v;
  }

  const pro = (userId: string, until: Date | null = null) =>
    prisma.user.update({
      where: { id: userId },
      data: { tier: 'PREMIUM', tierSource: 'ADMIN', tierUntil: until },
    });

  const hide = (c: C, hidden = true) => c.put('/api/me/page').send({ hidden });

  it('Pro and admins may hide their page; Free may not', async () => {
    const free = await hide(ann).expect(403);
    expect(free.body.code).toBe('pageHidingNotAllowed');
    expect((await ann.get('/api/auth/me').expect(200)).body).toMatchObject({
      pageHidden: false,
      canHidePage: false,
    });

    await pro(annId);
    const done = await hide(ann).expect(200);
    expect(done.body).toMatchObject({ pageHidden: true, canHidePage: true });
    await hide(ann, false).expect(200);
    expect((await ann.get('/api/auth/me').expect(200)).body.pageHidden).toBe(
      false,
    );
    await hide(admin).expect(200);
  });

  it('404 for everyone but the owner and admins, also for the owner previewing as a visitor', async () => {
    const v = await seed(annId, 'clip');
    await pro(annId);
    await hide(ann).expect(200);

    const paths = [
      '/api/users/ann',
      '/api/users/ann/collection',
      '/api/users/ann/collection/summary',
      `/api/users/ann/videos/${v.id}`,
      '/api/users/ann/social?list=followers',
      `/api/videos/code/${v.code}`,
    ];
    for (const path of paths) {
      await guest.get(path).expect(404);
      await bob.get(path).expect(404);
      await ann.get(path).set('X-As-Guest', '1').expect(404);
    }
    const own = await ann.get('/api/users/ann').expect(200);
    expect(own.body.pageHidden).toBe(true);
    await ann.get('/api/users/ann/collection').expect(200);
    const seen = await admin.get('/api/users/ann').expect(200);
    expect(seen.body.pageHidden).toBe(true);
    await admin.get(`/api/users/ann/videos/${v.id}`).expect(200);

    // A request to someone whose shelf nobody can see.
    await bob
      .post('/api/exchange')
      .send({ holderUsername: 'ann', videoIds: [v.id] })
      .expect(404);
  });

  it('copies others hold keep playing; a link opens the viewer’s own copy; the author goes without a link', async () => {
    const v = await seed(annId, 'clip');
    await prisma.videoAccess.create({
      data: { videoId: v.id, holderId: bobId, source: 'EXCHANGE' },
    });
    await pro(annId);
    await hide(ann).expect(200);

    const ctx = await bob.get(`/api/videos/code/${v.code}`).expect(200);
    expect(ctx.body.username).toBe('bob');
    // Bob's shelf is not hidden: his copy shows to anyone, the author's name without a link.
    const page = await carl.get(`/api/users/bob/videos/${v.id}`).expect(200);
    expect(page.body.viewer.canStream).toBe(true);
    expect(page.body.author).toMatchObject({
      username: 'ann',
      pageVisible: false,
    });
    const forAdmin = await admin
      .get(`/api/users/bob/videos/${v.id}`)
      .expect(200);
    expect(forAdmin.body.author.pageVisible).toBe(true);
    // Still a stranger to Carl via the link: the author's page is not there.
    await carl.get(`/api/videos/code/${v.code}`).expect(404);
  });

  it('others’ lists show them to the list’s owner and admins only; nobody new follows; whoever they follow may follow back', async () => {
    await ann.post('/api/users/bob/follow').expect(200); // ann follows bob
    await carl.post('/api/users/bob/follow').expect(200);
    await pro(annId);
    await hide(ann).expect(200);

    const followers = async (c: C) =>
      (await c.get('/api/users/bob/social?list=followers').expect(200))
        .body as {
        items: { username: string; pageHidden: boolean }[];
        total: number;
        counts: { followers: number };
      };
    const seenByCarl = await followers(carl);
    expect(seenByCarl.items.map((u) => u.username)).toEqual(['carl']);
    expect(seenByCarl.counts.followers).toBe(1);
    expect(
      (await guest.get('/api/users/bob').expect(200)).body.counts.followers,
    ).toBe(1);
    const seenByBob = await followers(bob);
    expect(seenByBob.items).toContainEqual(
      expect.objectContaining({ username: 'ann', pageHidden: true }),
    );
    expect(seenByBob.counts.followers).toBe(2);
    expect((await followers(admin)).counts.followers).toBe(2);

    // Nobody new: carl cannot follow ann; bob, whom ann follows, may follow her back.
    await carl.post('/api/users/ann/follow').expect(404);
    await bob.post('/api/users/ann/follow').expect(200);
    // Following ends either way, also on a hidden page.
    await bob.delete('/api/users/ann/follow').expect(200);
    expect(
      await prisma.follow.count({
        where: { followerId: bobId, followeeId: annId },
      }),
    ).toBe(0);
  });

  it('their new videos stay out of their followers’ "What’s new"', async () => {
    await carl.post('/api/users/ann/follow').expect(200);
    await pro(annId);
    await hide(ann).expect(200);
    await seed(annId, 'fresh');
    const feed = await carl.get('/api/me/whats-new').expect(200);
    expect(feed.body.items).toEqual([]);
    expect(
      (await carl.get('/api/me/whats-new/state').expect(200)).body.hasNew,
    ).toBe(false);
  });

  it('the end of Pro opens the page, said in the reminder and in the notice of the end', async () => {
    await pro(annId, new Date(Date.now() + DAY - HOUR));
    await hide(ann).expect(200);
    expect(await expiry.run()).toMatchObject({ reminded: 1 });

    await prisma.user.update({
      where: { id: annId },
      data: { tierUntil: new Date(Date.now() - HOUR) },
    });
    expect(await expiry.run()).toMatchObject({ expired: 1 });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
        .pageHidden,
    ).toBe(false);
    await guest.get('/api/users/ann').expect(200);

    await relay.drain();
    const notes = (await ann.get('/api/notifications').expect(200)).body
      .items as { type: string; payload: Record<string, unknown> }[];
    expect(
      notes.find((n) => n.type === 'PLAN_EXPIRING')?.payload,
    ).toMatchObject({ pageHidden: true });
    expect(notes.find((n) => n.type === 'PLAN_EXPIRED')?.payload).toMatchObject(
      { pageReopened: true },
    );
  });

  it('an admin taking Pro or the admin role away opens it too', async () => {
    await pro(annId);
    await hide(ann).expect(200);
    await admin
      .patch(`/api/admin/users/${annId}`)
      .send({ tier: 'BASIC' })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
        .pageHidden,
    ).toBe(false);

    await makeAdmin(prisma, carlId);
    await hide(carl).expect(200);
    const row = await admin.get(`/api/admin/users/${carlId}`).expect(200);
    expect(row.body.pageHidden).toBe(true);
    await admin
      .patch(`/api/admin/users/${carlId}`)
      .send({ role: 'USER' })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: carlId } }))
        .pageHidden,
    ).toBe(false);
  });
});

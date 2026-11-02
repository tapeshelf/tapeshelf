import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

/**
 * requests, negotiation rounds, exchange execution,
 * races, cooldown, daily limit, blocks and what happens when a video disappears mid-negotiation.
 */
describe('requests and exchange (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let settings: SettingsService;
  let holder: C, requester: C, other: C;
  let holderId: string, requesterId: string, otherId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    settings = app.get(SettingsService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    holder = client(app);
    requester = client(app);
    other = client(app);
    holderId = await signUp(app, holder, {
      email: 'holder@example.com',
      username: 'holder',
      password: 'secret123',
    });
    requesterId = await signUp(app, requester, {
      email: 'req@example.com',
      username: 'req',
      password: 'secret123',
    });
    otherId = await signUp(app, other, {
      email: 'other@example.com',
      username: 'other',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed(
    authorId: string,
    title: string,
    visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE',
    status: 'READY' | 'QUEUED' = 'READY',
  ) {
    const v = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility,
        status,
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    return v.id;
  }

  const hold = (
    videoId: string,
    userId: string,
    source: 'EXCHANGE' | 'SHARE' | 'PUBLIC_ADD' = 'EXCHANGE',
    hidden = false,
  ) =>
    prisma.videoAccess.create({
      data: { videoId, holderId: userId, source, hidden },
    });

  const create = (
    c: C,
    holderUsername: string,
    videoIds: string[],
    message?: string,
  ) => c.post('/api/exchange').send({ holderUsername, videoIds, message });

  const holdings = async (userId: string) =>
    (
      await prisma.videoAccess.findMany({
        where: { holderId: userId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((h) => `${h.videoId}:${h.source}`);

  const notifications = async (c: C) =>
    (
      (await c.get('/api/notifications').expect(200)).body.items as {
        type: string;
        payload: Record<string, unknown>;
      }[]
    ).map((n) => n.type);

  describe('creating requests', () => {
    it('keeps only requestable videos, reports the rest, notifies the holder', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const pub = await seed(holderId, 'pub', 'PUBLIC');
      const queued = await seed(holderId, 'queued', 'PRIVATE', 'QUEUED');
      const bookmark = await seed(otherId, 'bm', 'PUBLIC');
      await hold(bookmark, holderId, 'PUBLIC_ADD');
      const hiddenOne = await seed(otherId, 'hidden');
      await hold(hiddenOne, holderId, 'SHARE', true);
      const mine = await seed(otherId, 'mine');
      await hold(mine, requesterId, 'SHARE');
      await hold(mine, holderId, 'SHARE');

      const res = await create(
        requester,
        'holder',
        [
          a,
          b,
          pub,
          queued,
          bookmark,
          hiddenOne,
          mine,
          '0199d1c0-0000-7000-8000-000000000000',
        ],
        ' hi ',
      ).expect(201);
      expect(res.body.request).toMatchObject({
        status: 'OPEN',
        round: 0,
        role: 'requester',
        awaitingMe: false,
        message: 'hi',
        counterpart: { username: 'holder' },
        actions: ['cancel'],
      });
      expect(
        res.body.request.requested.map((v: { title: string }) => v.title),
      ).toEqual(['a', 'b']);
      expect(res.body.request.offers).toHaveLength(1);
      expect(res.body.skipped).toEqual(
        expect.arrayContaining([
          { videoId: pub, reason: 'alreadyWatchable' },
          { videoId: queued, reason: 'notRequestable' },
          { videoId: bookmark, reason: 'notRequestable' },
          { videoId: hiddenOne, reason: 'notRequestable' },
          { videoId: mine, reason: 'alreadyWatchable' },
          {
            videoId: '0199d1c0-0000-7000-8000-000000000000',
            reason: 'notFound',
          },
        ]),
      );
      const id = res.body.request.id;
      await relay.drain();
      expect(await notifications(holder)).toEqual(['REQUEST_RECEIVED']);
      const incoming = (
        await holder.get('/api/exchange?tab=incoming').expect(200)
      ).body;
      expect(incoming.items).toHaveLength(1);
      expect(incoming.items[0]).toMatchObject({
        id,
        role: 'holder',
        awaitingMe: true,
      });
      expect(
        (await holder.get('/api/exchange/summary').expect(200)).body,
      ).toEqual({ awaitingMe: 1, outgoing: 0 });
      expect(
        (await requester.get('/api/exchange/summary').expect(200)).body,
      ).toEqual({ awaitingMe: 0, outgoing: 1 });
      // Strangers cannot see it.
      await other.get(`/api/exchange/${id}`).expect(404);

      // Same video again → already requested; nothing left → 400.
      const again = await create(requester, 'holder', [a]).expect(400);
      expect(again.body.code).toBe('nothingToRequest');
      expect(again.body.details).toEqual([
        { videoId: a, reason: 'alreadyRequested' },
      ]);
      await create(holder, 'holder', [a]).expect(400);

      // The video page reflects the open request.
      const page = (
        await requester.get(`/api/users/holder/videos/${a}`).expect(200)
      ).body;
      expect(page.viewer.requestBlocker).toBeNull();
      expect(page.viewer.request).toMatchObject({
        openRequestId: id,
        cooldownUntil: null,
        blocked: false,
        limitReached: false,
      });
    });

    it('enforces the daily limit per requested video, counting cancelled requests', async () => {
      await settings.set('tiers', {
        BASIC: {
          maxFileBytes: 1,
          storageQuotaBytes: 1,
          requestsPerDay: 2,
          downloadsPerMonth: 0,
          downloadSpeedBytesPerSec: 0,
          downloadConcurrency: 0,
          trashRetentionDays: 30,
          apiRateMultiplier: 1,
          extensionPerDay: 0,
        },
        PREMIUM: {
          maxFileBytes: 1,
          storageQuotaBytes: 1,
          requestsPerDay: 2,
          downloadsPerMonth: 0,
          downloadSpeedBytesPerSec: 0,
          downloadConcurrency: 0,
          trashRetentionDays: 30,
          apiRateMultiplier: 1,
          extensionPerDay: 0,
        },
      });
      const ids = [];
      for (const t of ['a', 'b', 'c']) ids.push(await seed(holderId, t));
      const res = await create(requester, 'holder', ids).expect(201);
      expect(res.body.request.requested).toHaveLength(2);
      expect(res.body.skipped).toEqual([{ videoId: ids[2], reason: 'limit' }]);
      await requester
        .post(`/api/exchange/${res.body.request.id}/cancel`)
        .expect(200);
      const again = await create(requester, 'holder', [ids[2]]).expect(400);
      expect(again.body.details).toEqual([
        { videoId: ids[2], reason: 'limit' },
      ]);
      const page = (
        await requester.get(`/api/users/holder/videos/${ids[2]}`).expect(200)
      ).body;
      expect(page.viewer.request.limitReached).toBe(true);
      // It says when there is room again: a day after the request that used it up.
      const made = (
        await prisma.videoRequest.findUniqueOrThrow({
          where: { id: res.body.request.id },
        })
      ).createdAt;
      expect(new Date(page.viewer.request.limitFreesAt).getTime()).toBe(
        made.getTime() + 24 * 3600 * 1000,
      );
      // Incoming requests do not consume the holder's allowance.
      const h = await seed(requesterId, 'from req');
      expect(
        (await create(holder, 'req', [h]).expect(201)).body.request.requested,
      ).toHaveLength(1);
    });

    it('a daily limit of 0 means no limit', async () => {
      const basic = (await settings.get('tiers')).BASIC;
      await settings.set('tiers', {
        BASIC: { ...basic, requestsPerDay: 0 },
        PREMIUM: { ...basic, requestsPerDay: 0 },
      });
      const ids = [];
      for (const t of ['a', 'b', 'c']) ids.push(await seed(holderId, t));
      const res = await create(requester, 'holder', ids).expect(201);
      expect(res.body.request.requested).toHaveLength(3);
      const page = (
        await requester.get(`/api/users/holder/videos/${ids[0]}`).expect(200)
      ).body;
      expect(page.viewer.request).toMatchObject({
        limitReached: false,
        limitFreesAt: null,
      });
    });
  });

  describe('negotiation', () => {
    it('share gives SHARE holdings; counter → counter → accept exchanges both ways', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const x = await seed(requesterId, 'x');
      const y = await seed(requesterId, 'y');
      const z = await seed(otherId, 'z');
      await hold(z, requesterId, 'SHARE'); // received videos can be traded further

      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const round0 = req.offers[0].id;
      // Holder counters: a + b for x.
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a, b], requesterGives: [] })
        .expect(400);
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a, b], requesterGives: [z, 'bad'] })
        .expect(400);
      const c1 = (
        await holder
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a, b], requesterGives: [x], message: 'deal?' })
          .expect(200)
      ).body;
      expect(c1).toMatchObject({
        round: 1,
        awaitingMe: false,
        actions: ['share', 'block'],
      });
      expect(c1.offers[0].status).toBe('SUPERSEDED');
      expect(c1.offers[1]).toMatchObject({
        round: 1,
        status: 'PENDING',
        message: 'deal?',
      });
      // Requester cannot accept the stale round-0 offer id, nor can the holder act as awaiting side.
      await requester
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: round0 })
        .expect(409);
      await holder
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: c1.currentOfferId })
        .expect(409);
      // Requester counters back: a for z.
      const options = (
        await requester.get(`/api/exchange/${req.id}/options`).expect(200)
      ).body;
      expect(
        options.theirs.map((v: { title: string }) => v.title).sort(),
      ).toEqual(['a', 'b']);
      expect(
        options.mine.map((v: { title: string }) => v.title).sort(),
      ).toEqual(['x', 'y', 'z']);
      const c2 = (
        await requester
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a], requesterGives: [z] })
          .expect(200)
      ).body;
      expect(c2).toMatchObject({ round: 2, awaitingMe: false });
      // Holder accepts round 2.
      const done = (
        await holder
          .post(`/api/exchange/${req.id}/accept`)
          .send({ offerId: c2.currentOfferId })
          .expect(200)
      ).body;
      expect(done).toMatchObject({ status: 'ACCEPTED', actions: [] });
      expect(await holdings(requesterId)).toEqual(
        expect.arrayContaining([`${a}:EXCHANGE`]),
      );
      expect(await holdings(holderId)).toEqual(
        expect.arrayContaining([`${z}:EXCHANGE`]),
      );
      expect(await holdings(holderId)).not.toEqual(
        expect.arrayContaining([`${x}:EXCHANGE`]),
      );
      await relay.drain();
      expect(await notifications(holder)).toEqual([
        'EXCHANGE_COMPLETED',
        'OFFER_RECEIVED',
        'REQUEST_RECEIVED',
      ]);
      expect(await notifications(requester)).toEqual([
        'EXCHANGE_COMPLETED',
        'OFFER_RECEIVED',
      ]);
      // Closed requests sit in history for both.
      expect(
        (await holder.get('/api/exchange?tab=history').expect(200)).body
          .items[0].status,
      ).toBe('ACCEPTED');
      expect(
        (await requester.get('/api/exchange?tab=incoming').expect(200)).body
          .items,
      ).toEqual([]);

      // A plain share of a fresh request.
      const req2 = (await create(requester, 'holder', [b]).expect(201)).body
        .request;
      await requester.post(`/api/exchange/${req2.id}/share`).expect(409);
      const shared = (
        await holder.post(`/api/exchange/${req2.id}/share`).expect(200)
      ).body;
      expect(shared.status).toBe('ACCEPTED');
      expect(await holdings(requesterId)).toEqual(
        expect.arrayContaining([`${b}:SHARE`]),
      );
      await relay.drain();
      expect((await notifications(requester))[0]).toBe('REQUEST_SHARED');
      void y;
    });

    it('decline starts the cooldown for the requester no matter who declined; cancel does not', async () => {
      await settings.set('requestCooldownDays', 7);
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a, b]).expect(201)).body
        .request;
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a, b], requesterGives: [x] })
        .expect(200);
      // The requester declines the counter-offer: still a cooldown.
      const declined = (
        await requester
          .post(`/api/exchange/${req.id}/decline`)
          .send({ comment: 'no thanks' })
          .expect(200)
      ).body;
      expect(declined).toMatchObject({
        status: 'DECLINED',
        declineComment: 'no thanks',
      });
      const page = (
        await requester.get(`/api/users/holder/videos/${a}`).expect(200)
      ).body;
      expect(page.viewer.request.cooldownUntil).not.toBeNull();
      const again = await create(requester, 'holder', [a, b]).expect(400);
      expect(
        again.body.details.map((s: { reason: string }) => s.reason),
      ).toEqual(['cooldown', 'cooldown']);
      await relay.drain();
      expect(await notifications(holder)).toEqual([
        'REQUEST_DECLINED',
        'REQUEST_RECEIVED',
      ]);

      // Cancelling a request leaves no cooldown.
      const c = await seed(holderId, 'c');
      const req2 = (await create(requester, 'holder', [c]).expect(201)).body
        .request;
      await holder.post(`/api/exchange/${req2.id}/cancel`).expect(409);
      await requester.post(`/api/exchange/${req2.id}/cancel`).expect(200);
      expect(
        (await create(requester, 'holder', [c]).expect(201)).body.request
          .requested,
      ).toHaveLength(1);
    });

    it('accept and counter race: one wins, the other gets 409', async () => {
      const a = await seed(holderId, 'a');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const c1 = (
        await holder
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a], requesterGives: [x] })
          .expect(200)
      ).body;
      const [accept, counter] = await Promise.all([
        requester
          .post(`/api/exchange/${req.id}/accept`)
          .send({ offerId: c1.currentOfferId }),
        requester
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a], requesterGives: [x] }),
      ]);
      expect([accept.status, counter.status].sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const final = (await holder.get(`/api/exchange/${req.id}`).expect(200))
        .body;
      expect(['ACCEPTED', 'OPEN']).toContain(final.status);
    });
  });

  describe('blocks and lost videos', () => {
    it('blocking from a request closes every open request between the two and hides the block', async () => {
      const a = await seed(holderId, 'a');
      const h = await seed(requesterId, 'h');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const back = (await create(holder, 'req', [h]).expect(201)).body.request;
      const blocked = (
        await holder.post(`/api/exchange/${req.id}/block`).expect(200)
      ).body;
      expect(blocked.status).toBe('BLOCKED');
      // The blocked side sees its request as declined and the other one as closed by the system.
      expect(
        (await requester.get(`/api/exchange/${req.id}`).expect(200)).body
          .status,
      ).toBe('DECLINED');
      expect(
        (await requester.get(`/api/exchange/${back.id}`).expect(200)).body
          .status,
      ).toBe('INVALIDATED');
      expect(
        (await holder.get(`/api/exchange/${back.id}`).expect(200)).body.status,
      ).toBe('BLOCKED');
      await relay.drain();
      expect(await notifications(requester)).toEqual([
        'REQUEST_INVALIDATED',
        'REQUEST_DECLINED',
        'REQUEST_RECEIVED',
      ]);
      // No more requests either way; the video page shows a block without naming it.
      const b = await seed(holderId, 'b');
      expect(
        (await create(requester, 'holder', [b]).expect(403)).body.code,
      ).toBe('blocked');
      await create(holder, 'req', [h]).expect(403);
      const page = (
        await requester.get(`/api/users/holder/videos/${b}`).expect(200)
      ).body;
      expect(page.viewer.request.blocked).toBe(true);
      expect(
        (await holder.get('/api/me/blocks').expect(200)).body.map(
          (x: { user: { username: string } }) => x.user.username,
        ),
      ).toEqual(['req']);
      await holder.delete(`/api/me/blocks/${requesterId}`).expect(200);
      await create(requester, 'holder', [b]).expect(201);
      await holder.post(`/api/me/blocks/${holderId}`).expect(400);
    });

    it('a deleted video voids the counter-offer and falls back to round 0; losing every requested video invalidates', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a, b]).expect(201)).body
        .request;
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a], requesterGives: [x] })
        .expect(200);
      // The requester deletes x, which sits in the current offer.
      await requester.delete(`/api/videos/${x}`).expect(200);
      let d = (await holder.get(`/api/exchange/${req.id}`).expect(200)).body;
      expect(d).toMatchObject({ status: 'OPEN', round: 0, awaitingMe: true });
      expect(d.resetAt).not.toBeNull();
      expect(d.offers.map((o: { status: string }) => o.status)).toEqual([
        'PENDING',
        'VOID',
      ]);
      expect(d.requested.map((v: { title: string }) => v.title)).toEqual([
        'a',
        'b',
      ]);
      // The holder deletes a: round 0 shrinks but stays open.
      await holder.delete(`/api/videos/${a}`).expect(200);
      d = (await holder.get(`/api/exchange/${req.id}`).expect(200)).body;
      expect(d.status).toBe('OPEN');
      expect(d.requested.map((v: { title: string }) => v.title)).toEqual(['b']);
      // And b: nothing left → INVALIDATED.
      await holder.delete(`/api/videos/${b}`).expect(200);
      d = (await requester.get(`/api/exchange/${req.id}`).expect(200)).body;
      expect(d.status).toBe('INVALIDATED');
      await relay.drain();
      expect(await notifications(requester)).toEqual([
        'REQUEST_INVALIDATED',
        'REQUEST_INVALIDATED',
        'REQUEST_INVALIDATED',
        'OFFER_RECEIVED',
      ]);
    });

    it('accepting an offer whose video vanished answers 409 and resets the thread', async () => {
      const a = await seed(holderId, 'a');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const c1 = (
        await holder
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a], requesterGives: [x] })
          .expect(200)
      ).body;
      // Simulate a loss the deletion hook did not see (e.g. a direct status change).
      await prisma.video.update({
        where: { id: x },
        data: { status: 'FAILED' },
      });
      const res = await requester
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: c1.currentOfferId })
        .expect(409);
      expect(res.body.code).toBe('offerChanged');
      const d = (await requester.get(`/api/exchange/${req.id}`).expect(200))
        .body;
      expect(d).toMatchObject({ status: 'OPEN', round: 0 });
      expect(await holdings(requesterId)).not.toEqual(
        expect.arrayContaining([`${a}:EXCHANGE`]),
      );
    });
  });

  describe('races and edges', () => {
    /** Runs `body` inside a transaction that stays open until `release` is called. */
    function holdOpen(
      body: (
        tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
      ) => Promise<unknown>,
    ) {
      let release!: () => void;
      let ready!: () => void;
      const released = new Promise<void>((r) => (release = r));
      const started = new Promise<void>((r) => (ready = r));
      const done = prisma.$transaction(
        async (tx) => {
          await body(tx);
          ready();
          await released;
        },
        { timeout: 15_000 },
      );
      return { started, release, done };
    }
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it('blocking from a request thread ends the follows both ways, like any block', async () => {
      await requester.post('/api/users/holder/follow').expect(200);
      await holder.post('/api/users/req/follow').expect(200);
      const a = await seed(holderId, 'a');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      await holder.post(`/api/exchange/${req.id}/block`).expect(200);
      expect(
        await prisma.follow.count({
          where: {
            OR: [
              { followerId: holderId, followeeId: requesterId },
              { followerId: requesterId, followeeId: holderId },
            ],
          },
        }),
      ).toBe(0);
    });

    it('a block that waits for an accept in progress leaves the settled request alone', async () => {
      const a = await seed(holderId, 'a');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      // An accept holding the request: it has settled it but not committed yet.
      const accept = holdOpen(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "VideoRequest" WHERE id = ${req.id}::uuid FOR UPDATE`;
        await tx.videoRequest.update({
          where: { id: req.id },
          data: {
            status: 'ACCEPTED',
            awaitingUserId: null,
            resolvedAt: new Date(),
          },
        });
      });
      await accept.started;
      const blocking = holder
        .post(`/api/me/blocks/${requesterId}`)
        .then((r) => r);
      await pause(300); // the block is now waiting for the request's lock
      accept.release();
      await accept.done;
      expect((await blocking).status).toBe(200);
      const row = await prisma.videoRequest.findUniqueOrThrow({
        where: { id: req.id },
      });
      expect(row.status).toBe('ACCEPTED');
    });

    it('accepting while one of the videos is being deleted answers 409 at once, then works', async () => {
      const a = await seed(holderId, 'a');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const c1 = (
        await holder
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [a], requesterGives: [x] })
          .expect(200)
      ).body;
      // A deletion of x in progress holds its row.
      const deletion = holdOpen(
        (tx) =>
          tx.$executeRaw`SELECT id FROM "Video" WHERE id = ${x}::uuid FOR UPDATE`,
      );
      await deletion.started;
      const res = await requester
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: c1.currentOfferId });
      deletion.release();
      await deletion.done;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('offerChanged');
      // Nothing was lost: once the row is free the same offer goes through.
      const ok = await requester
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: c1.currentOfferId })
        .expect(200);
      expect(ok.body.status).toBe('ACCEPTED');
      // And a retry of that accept gets the same answer, not a 409.
      const again = await requester
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: c1.currentOfferId })
        .expect(200);
      expect(again.body.status).toBe('ACCEPTED');
    });

    it('the other side’s hidden videos cannot go into a counter-offer; one’s own can', async () => {
      const a = await seed(holderId, 'a');
      const x = await seed(requesterId, 'x');
      const y = await seed(otherId, 'y');
      await hold(y, requesterId, 'EXCHANGE', true); // hidden on the requester's shelf
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const asked = await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a], requesterGives: [y] })
        .expect(400);
      expect(asked.body.code).toBe('invalidOffer');
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a], requesterGives: [x] })
        .expect(200);
      // The requester may offer their own hidden video.
      await requester
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a], requesterGives: [y] })
        .expect(200);
    });

    it('after a reset to round 0 the next offer gets a new round number; offers keep their order', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const x = await seed(requesterId, 'x');
      const z = await seed(requesterId, 'z');
      const req = (await create(requester, 'holder', [a, b]).expect(201)).body
        .request;
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a], requesterGives: [x] })
        .expect(200);
      await requester.delete(`/api/videos/${x}`).expect(200); // voids round 1, back to round 0
      const d = (
        await holder
          .post(`/api/exchange/${req.id}/counter`)
          .send({ holderGives: [b], requesterGives: [z] })
          .expect(200)
      ).body;
      expect(d.round).toBe(2);
      expect(
        d.offers.map((o: { round: number; status: string }) => [
          o.round,
          o.status,
        ]),
      ).toEqual([
        [0, 'SUPERSEDED'],
        [1, 'VOID'],
        [2, 'PENDING'],
      ]);
    });

    it('a video its author keeps only for themselves cannot be requested nor picked by the other side', async () => {
      const a = await seed(holderId, 'a');
      const secret = await seed(holderId, 'secret');
      await prisma.videoAccess.update({
        where: { videoId_holderId: { videoId: secret, holderId } },
        data: { hidden: true },
      });
      const page = (
        await requester.get(`/api/users/holder/videos/${secret}`).expect(404)
      ).body;
      expect(page.code).toBeDefined();
      const res = (await create(requester, 'holder', [a, secret]).expect(201))
        .body;
      expect(
        res.skipped.map((s: { videoId: string; reason: string }) => [
          s.videoId,
          s.reason,
        ]),
      ).toEqual([[secret, 'notRequestable']]);
      const theirs = (
        await requester
          .get(`/api/exchange/${res.request.id}/options`)
          .expect(200)
      ).body.theirs.map((v: { title: string }) => v.title);
      expect(theirs).toEqual(['a']);
      // The author may still offer it themselves.
      const own = (
        await holder.get(`/api/exchange/${res.request.id}/options`).expect(200)
      ).body.mine.map((v: { title: string }) => v.title);
      expect(own.sort()).toEqual(['a', 'secret']);
    });

    it('the requester’s message travels with the notification', async () => {
      const a = await seed(holderId, 'a');
      await create(
        requester,
        'holder',
        [a],
        '  Swap for my\n lake clip?  ',
      ).expect(201);
      await relay.drain();
      const items = (await holder.get('/api/notifications').expect(200)).body
        .items as {
        type: string;
        payload: Record<string, unknown>;
      }[];
      expect(
        items.find((n) => n.type === 'REQUEST_RECEIVED')?.payload['message'],
      ).toBe('Swap for my lake clip?');
    });
  });

  describe('trading aids', () => {
    const payloads = async (c: C, type: string) =>
      (
        (await c.get('/api/notifications').expect(200)).body.items as {
          type: string;
          payload: Record<string, unknown>;
          readAt: string | null;
        }[]
      ).filter((n) => n.type === type);

    it('offer options name each video’s category and say what came from others; the other side’s hidden categories stay unnamed', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const z = await seed(otherId, 'z');
      await hold(z, holderId, 'SHARE');
      const x = await seed(requesterId, 'x');
      const travel = await prisma.category.create({
        data: { ownerId: holderId, name: 'Travel' },
      });
      const secret = await prisma.category.create({
        data: { ownerId: holderId, name: 'Secret', hidden: true },
      });
      const mine = await prisma.category.create({
        data: { ownerId: requesterId, name: 'Mine' },
      });
      const file = (videoId: string, holder: string, categoryId: string) =>
        prisma.videoAccess.update({
          where: { videoId_holderId: { videoId, holderId: holder } },
          data: { categoryId },
        });
      await file(a, holderId, travel.id);
      await file(b, holderId, secret.id);
      await file(x, requesterId, mine.id);
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const options = (
        await requester.get(`/api/exchange/${req.id}/options`).expect(200)
      ).body as {
        theirs: {
          title: string;
          categoryId: string | null;
          received: boolean;
        }[];
        mine: { title: string; categoryId: string | null; received: boolean }[];
        theirCategories: { id: string; name: string }[];
        myCategories: { id: string; name: string }[];
      };
      const byTitle = (list: typeof options.theirs) =>
        Object.fromEntries(
          list.map((v) => [v.title, [v.categoryId, v.received]]),
        );
      expect(byTitle(options.theirs)).toEqual({
        a: [travel.id, false],
        b: [null, false],
        z: [null, true],
      });
      expect(options.theirCategories).toEqual([
        { id: travel.id, name: 'Travel' },
      ]);
      expect(byTitle(options.mine)).toEqual({ x: [mine.id, false] });
      expect(options.myCategories).toEqual([{ id: mine.id, name: 'Mine' }]);
      // The holder sees its own hidden category by name.
      const own = (
        await holder.get(`/api/exchange/${req.id}/options`).expect(200)
      ).body as typeof options;
      expect(own.myCategories.map((c) => c.name).sort()).toEqual([
        'Secret',
        'Travel',
      ]);
    });

    it('the list row carries the deal; an offer says what for what; opening a thread clears its notifications', async () => {
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const x = await seed(requesterId, 'x');
      const req = (await create(requester, 'holder', [a], 'please').expect(201))
        .body.request;
      const row = async (c: C, tab: string) =>
        (await c.get(`/api/exchange?tab=${tab}`).expect(200)).body.items[0]
          .deal;
      expect(await row(holder, 'incoming')).toEqual({
        give: 1,
        get: 0,
        lastMessage: 'please',
      });
      await holder
        .post(`/api/exchange/${req.id}/counter`)
        .send({ holderGives: [a, b], requesterGives: [x], message: 'deal?' })
        .expect(200);
      expect(await row(requester, 'outgoing')).toEqual({
        give: 1,
        get: 2,
        lastMessage: 'deal?',
      });
      await relay.drain();
      const [offer] = await payloads(requester, 'OFFER_RECEIVED');
      expect(offer!.payload).toMatchObject({
        requestId: req.id,
        round: 1,
        gives: 'a',
        givesMore: 1,
        wants: 'x',
        wantsMore: 0,
      });
      expect(offer!.readAt).toBeNull();
      await requester
        .post('/api/notifications/requests/not-a-uuid/read')
        .expect(400);
      await requester
        .post(`/api/notifications/requests/${req.id}/read`)
        .expect(200);
      expect(
        (await payloads(requester, 'OFFER_RECEIVED'))[0]!.readAt,
      ).not.toBeNull();
      // Only the reader's own notifications.
      expect(
        (await payloads(holder, 'REQUEST_RECEIVED'))[0]!.readAt,
      ).toBeNull();
    });

    it('what came is "new" to its new holder until opened, and to nobody else', async () => {
      const a = await seed(holderId, 'a');
      const req = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      await holder.post(`/api/exchange/${req.id}/share`).expect(200);
      const unseen = async (c: C) =>
        (
          (await c.get('/api/users/req/collection').expect(200)).body.items as {
            video: { title: string };
            unseen: boolean;
          }[]
        ).map((i) => [i.video.title, i.unseen]);
      expect(await unseen(requester)).toEqual([['a', true]]);
      expect(await unseen(other)).toEqual([['a', false]]);
      // Someone else opening it changes nothing; the holder opening it does.
      await other.get(`/api/users/req/videos/${a}`).expect(200);
      expect(await unseen(requester)).toEqual([['a', true]]);
      await requester.get(`/api/users/req/videos/${a}`).expect(200);
      expect(await unseen(requester)).toEqual([['a', false]]);
      // The author's own holding was never new.
      expect(
        (
          await prisma.videoAccess.findUniqueOrThrow({
            where: { videoId_holderId: { videoId: a, holderId } },
          })
        ).unseen,
      ).toBe(false);
    });

    it('a refusal tells the requester when to ask again, the holder only that it was declined', async () => {
      await settings.set('requestCooldownDays', 7);
      const a = await seed(holderId, 'a');
      const b = await seed(holderId, 'b');
      const first = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      await requester.post(`/api/exchange/${first.id}/cancel`).expect(200);
      const second = (await create(requester, 'holder', [b]).expect(201)).body
        .request;
      await holder
        .post(`/api/exchange/${second.id}/decline`)
        .send({ comment: 'not now' })
        .expect(200);
      const req3 = (await create(requester, 'holder', [a]).expect(201)).body
        .request;
      const x = await seed(requesterId, 'x');
      await holder
        .post(`/api/exchange/${req3.id}/counter`)
        .send({ holderGives: [a], requesterGives: [x] })
        .expect(200);
      await requester
        .post(`/api/exchange/${req3.id}/decline`)
        .send({})
        .expect(200);
      await relay.drain();
      const [toRequester] = await payloads(requester, 'REQUEST_DECLINED');
      expect(toRequester!.payload).toMatchObject({
        requestId: second.id,
        title: 'b',
        comment: 'not now',
        cooldownDays: 7,
      });
      const [toHolder] = await payloads(holder, 'REQUEST_DECLINED');
      expect(toHolder!.payload['requestId']).toBe(req3.id);
      expect(toHolder!.payload).not.toHaveProperty('cooldownDays');
    });
  });

  describe('a request with an offer from the start', () => {
    const createWithOffer = (
      c: C,
      videoIds: string[],
      offerVideoIds: string[],
    ) =>
      c
        .post('/api/exchange')
        .send({ holderUsername: 'holder', videoIds, offerVideoIds });

    it('the requester offers own videos; the holder accepts the exchange, both get theirs', async () => {
      const a = await seed(holderId, 'a');
      const x = await seed(requesterId, 'x');
      const y = await seed(requesterId, 'y');
      const z = await seed(otherId, 'z');
      // What may be offered: own videos the holder does not have.
      const offerable = (
        await requester.get('/api/exchange/offerable/holder').expect(200)
      ).body;
      expect(
        offerable.mine.map((v: { title: string }) => v.title).sort(),
      ).toEqual(['x', 'y']);
      await requester.get('/api/exchange/offerable/req').expect(404);
      // Not someone else's, not what is asked for.
      await createWithOffer(requester, [a], [z]).expect(400);
      await createWithOffer(requester, [a], [a]).expect(400);

      const req = (await createWithOffer(requester, [a], [x]).expect(201)).body
        .request;
      expect(req.requested.map((v: { title: string }) => v.title)).toEqual([
        'a',
      ]);
      const seen = (await holder.get(`/api/exchange/${req.id}`).expect(200))
        .body;
      expect(seen).toMatchObject({
        round: 0,
        awaitingMe: true,
        deal: { give: 1, get: 1 },
      });
      expect(seen.actions).toEqual(
        expect.arrayContaining(['accept', 'share', 'counter', 'decline']),
      );
      await relay.drain();
      const [received] = (
        (await holder.get('/api/notifications').expect(200)).body.items as {
          type: string;
          payload: Record<string, unknown>;
        }[]
      ).filter((n) => n.type === 'REQUEST_RECEIVED');
      expect(received!.payload).toMatchObject({ title: 'a', offered: 1 });

      await holder
        .post(`/api/exchange/${req.id}/accept`)
        .send({ offerId: seen.currentOfferId })
        .expect(200);
      expect(await holdings(requesterId)).toEqual(
        expect.arrayContaining([`${a}:EXCHANGE`]),
      );
      expect(await holdings(holderId)).toEqual(
        expect.arrayContaining([`${x}:EXCHANGE`]),
      );
      await relay.drain();
      expect((await notifications(requester))[0]).toBe('EXCHANGE_COMPLETED');
      expect((await notifications(holder))[0]).toBe('EXCHANGE_COMPLETED');
      void y;
    });

    it('the holder may still share for free: the offered video stays with the requester', async () => {
      const b = await seed(holderId, 'b');
      const y = await seed(requesterId, 'y');
      const req = (await createWithOffer(requester, [b], [y]).expect(201)).body
        .request;
      await holder.post(`/api/exchange/${req.id}/share`).expect(200);
      expect(await holdings(requesterId)).toEqual(
        expect.arrayContaining([`${b}:SHARE`]),
      );
      expect(await holdings(holderId)).not.toEqual(
        expect.arrayContaining([`${y}:EXCHANGE`]),
      );
    });

    it('a lost offered video leaves the rest of the offer and the request as they were', async () => {
      const c = await seed(holderId, 'c');
      const y1 = await seed(requesterId, 'y1');
      const y2 = await seed(requesterId, 'y2');
      const req = (await createWithOffer(requester, [c], [y1, y2]).expect(201))
        .body.request;
      await requester.delete(`/api/videos/${y1}`).expect(200);
      const d = (await holder.get(`/api/exchange/${req.id}`).expect(200)).body;
      expect(d).toMatchObject({
        status: 'OPEN',
        round: 0,
        deal: { give: 1, get: 1 },
      });
      expect(d.requested.map((v: { title: string }) => v.title)).toEqual(['c']);
      void y2;
    });
  });

  describe('hint', () => {
    it('counts shows and allows dismissing only after the minimum', async () => {
      expect(
        (await requester.get('/api/exchange/hint').expect(200)).body,
      ).toMatchObject({
        seenCount: 0,
        dismissed: false,
        minShows: 3,
        collectionEmpty: true,
      });
      await requester.post('/api/exchange/hint/dismiss').expect(400);
      for (let i = 0; i < 3; i++)
        await requester.post('/api/exchange/hint/seen').expect(200);
      const state = (
        await requester.post('/api/exchange/hint/dismiss').expect(200)
      ).body;
      expect(state).toMatchObject({ seenCount: 3, dismissed: true });
      // Bookmarks cannot be offered in return: a shelf of them still gets the tip.
      const bookmarked = await seed(otherId, 'public one', 'PUBLIC');
      await hold(bookmarked, requesterId, 'PUBLIC_ADD');
      expect(
        (await requester.get('/api/exchange/hint').expect(200)).body
          .collectionEmpty,
      ).toBe(true);
      await seed(requesterId, 'mine');
      expect(
        (await requester.get('/api/exchange/hint').expect(200)).body
          .collectionEmpty,
      ).toBe(false);
    });
  });

  describe('a video its author is editing', () => {
    it('is not lost to the exchange: the request waits until the edit is done', async () => {
      const v = await seed(holderId, 'being edited');
      const req = (await create(other, 'holder', [v]).expect(201)).body.request;
      await prisma.video.update({
        where: { id: v },
        data: { status: 'PROCESSING', stage: 'EDIT' },
      });
      expect(
        (await holder.post(`/api/exchange/${req.id}/share`).expect(409)).body
          .code,
      ).toBe('videoBeingEdited');
      expect(
        (
          await prisma.videoRequest.findUniqueOrThrow({
            where: { id: req.id },
          })
        ).status,
      ).toBe('OPEN');
      await prisma.video.update({
        where: { id: v },
        data: { status: 'READY', stage: null },
      });
      expect(
        (await holder.post(`/api/exchange/${req.id}/share`).expect(200)).body
          .status,
      ).toBe('ACCEPTED');
    });
  });
});

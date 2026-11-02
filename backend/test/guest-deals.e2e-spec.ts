import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { GuestEscrowService } from '../src/modules/deals/guest-escrow.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { clearMailbox, waitForMail } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const DAY = 24 * 3600 * 1000;

/**
 * Exchanges with guests and exchange links: a guest offers their own uploads for a
 * private video; their uploads wait on the server only while the deal goes on; three quiet days end
 * it, each round gives three more; what they received plays and downloads for a week; signing in
 * hands everything to the account.
 */
describe('guest deals (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let relay: OutboxRelayService;
  let escrow: GuestEscrowService;
  let ann: C;
  let annId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    relay = app.get(OutboxRelayService);
    escrow = app.get(GuestEscrowService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ann = client(app);
    annId = await signUp(app, ann, {
      email: 'ann@example.com',
      username: 'ann',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: annId },
      data: { exchangeWants: 'Old cartoons', exchangeAvoid: 'Ads' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** A ready private video of `authorId` with an original and a tiny HLS package. */
  async function seed(authorId: string, title: string) {
    const video = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PRIVATE',
        status: 'READY',
        originalKey: 'pending',
        originalFilename: `${title}.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 0n,
        durationSec: 10,
        width: 1920,
        height: 1080,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    const originalKey = `videos/${video.id}/original.mp4`;
    const hlsPrefix = `videos/${video.id}/hls/v1`;
    await storage.putMany('private', [
      { key: originalKey, body: randomBytes(2048), contentType: 'video/mp4' },
      {
        key: `${hlsPrefix}/master.m3u8`,
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nindex.m3u8\n',
        contentType: 'application/vnd.apple.mpegurl',
      },
      {
        key: `${hlsPrefix}/index.m3u8`,
        body: '#EXTM3U\n#EXTINF:10,\nseg_00000.ts\n#EXT-X-ENDLIST\n',
        contentType: 'application/vnd.apple.mpegurl',
      },
    ]);
    await prisma.video.update({
      where: { id: video.id },
      data: { originalKey, sizeBytes: 2048n, hlsPrefix },
    });
    return video.id;
  }

  /** A guest uploads a file for the deal the way the page does: multipart straight to storage. */
  async function upload(g: C, dealId: string, title: string) {
    const body = randomBytes(64 * 1024);
    const session = (
      await g
        .post(`/api/guest/deals/${dealId}/uploads`)
        .send({
          filename: `${title}.mp4`,
          size: body.length,
          mimeType: 'video/mp4',
        })
        .expect(200)
    ).body as { id: string };
    const parts = (
      await g
        .post(`/api/guest/deals/${dealId}/uploads/${session.id}/parts`)
        .send({ partNumbers: [1] })
        .expect(200)
    ).body as { parts: { url: string }[] };
    const put = await fetch(parts.parts[0]!.url, { method: 'PUT', body });
    expect(put.ok).toBe(true);
    const view = (
      await g
        .post(`/api/guest/deals/${dealId}/uploads/${session.id}/complete`)
        .send({
          title,
          parts: [
            { partNumber: 1, etag: put.headers.get('etag'), size: body.length },
          ],
        })
        .expect(200)
    ).body as { uploads: { id: string; title: string }[] };
    return view.uploads.find((u) => u.title === title)!.id;
  }

  /** The worker's processing, played: the upload is ready. */
  async function ready(videoId: string) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'READY', durationSec: 5, width: 1280, height: 720 },
    });
  }

  /** A guest's deal for ann's private video, sent and ready on her side. */
  async function openDeal(title = 'Trip') {
    const wanted = await seed(annId, title);
    const g = client(app);
    const started = (
      await g
        .post('/api/guest/deals')
        .send({ videoId: wanted, holder: 'ann', message: 'Swap?' })
        .expect(200)
    ).body as { id: string; key: string };
    const mine = await upload(g, started.id, 'My clip');
    await ready(mine);
    await g
      .post(`/api/guest/deals/${started.id}/send`)
      .send({ message: 'Swap?' })
      .expect(200);
    const view = (await g.get(`/api/guest/deals/${started.id}`).expect(200))
      .body;
    expect(view.deal.status).toBe('OPEN');
    return { g, id: started.id, key: started.key, wanted, mine };
  }

  it('a guest offers an upload for a private video; ann accepts; the guest has a week', async () => {
    const wanted = await seed(annId, 'Trip');
    const page = (await client(app).get(`/api/users/ann/videos/${wanted}`))
      .body;
    expect(page.viewer).toMatchObject({ guestExchange: true });
    expect(page.holder).toMatchObject({ exchangeWants: 'Old cartoons' });

    const g = client(app);
    const started = await g
      .post('/api/guest/deals')
      .send({ videoId: wanted, holder: 'ann', message: 'Swap?' })
      .expect(200);
    expect(String(started.headers['set-cookie'])).toContain('vs_guest=');
    const id = started.body.id as string;
    // A draft: ann sees nothing yet.
    expect(
      (await ann.get('/api/exchange?tab=incoming').expect(200)).body.items,
    ).toEqual([]);
    await g.post(`/api/guest/deals/${id}/send`).expect(400);

    const mine = await upload(g, id, 'My clip');
    await g.post(`/api/guest/deals/${id}/send`).expect(200);
    let view = (await g.get(`/api/guest/deals/${id}`).expect(200)).body;
    expect(view).toMatchObject({ sent: true, deal: { status: 'DRAFT' } });
    expect(view.deal.holder).toMatchObject({
      username: 'ann',
      exchangeWants: 'Old cartoons',
      exchangeAvoid: 'Ads',
    });
    // Ready: it reaches ann, with three days on the clock.
    await ready(mine);
    view = (await g.get(`/api/guest/deals/${id}`).expect(200)).body;
    expect(view.deal.status).toBe('OPEN');
    expect(view.expiresInSec).toBeGreaterThan(3 * 86400 - 60);
    await relay.drain();
    const bell = (await ann.get('/api/notifications').expect(200)).body.items;
    expect(bell[0]).toMatchObject({
      type: 'REQUEST_RECEIVED',
      payload: { guest: true, offered: 1 },
    });
    const thread = (await ann.get(`/api/exchange/${id}`).expect(200)).body;
    expect(thread.requester).toMatchObject({ guest: true });
    expect(thread.expiresAt).not.toBeNull();
    // Ann sees the guest's upload as a card: title, size, quality; never the video.
    expect(thread.offers[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          givingSide: 'REQUESTER',
          video: expect.objectContaining({ title: 'My clip', height: 720 }),
        }),
      ]),
    );
    await ann.post(`/api/videos/${mine}/playback`).expect(403);
    // The guest's video has no page of its own.
    await client(app)
      .get(
        `/api/videos/code/${(await prisma.video.findUniqueOrThrow({ where: { id: mine } })).code}`,
      )
      .expect(404);

    await ann
      .post(`/api/exchange/${id}/accept`)
      .send({ offerId: thread.currentOfferId })
      .expect(200);
    view = (await g.get(`/api/guest/deals/${id}`).expect(200)).body;
    expect(view.deal.status).toBe('ACCEPTED');
    expect(view.accessInSec).toBeGreaterThan(7 * 86400 - 60);
    expect(view.received.map((v: { id: string }) => v.id)).toEqual([wanted]);
    const play = await g
      .post(`/api/guest/deals/${id}/videos/${wanted}/playback`)
      .expect(200);
    expect(play.body.playlistUrl).toContain('/master.m3u8?t=');
    const playlist = await client(app).get(
      new URL(play.body.playlistUrl).pathname +
        new URL(play.body.playlistUrl).search,
    );
    expect(playlist.status).toBe(200);
    const dl = await g
      .get(`/api/guest/deals/${id}/videos/${wanted}/download`)
      .expect(302);
    expect(dl.headers.location).toContain('original.mp4');
    // Ann keeps the guest's video; it stays on the server.
    await ann.post(`/api/videos/${mine}/playback`).expect(200);
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: mine } })).purgedAt,
    ).toBeNull();
    // The week over: nothing plays any more.
    await prisma.videoRequest.update({
      where: { id },
      data: { guestAccessUntil: new Date(Date.now() - 1000) },
    });
    await g
      .post(`/api/guest/deals/${id}/videos/${wanted}/playback`)
      .expect(404);
  });

  it('declined, cancelled or run out: the guest’s uploads are erased at once', async () => {
    const one = await openDeal('One');
    await ann.post(`/api/exchange/${one.id}/decline`).send({}).expect(200);
    const gone = await prisma.video.findUniqueOrThrow({
      where: { id: one.mine },
    });
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.purgedAt).not.toBeNull();
    expect(await storage.head('private', gone.originalKey)).toBeNull();

    const two = await openDeal('Two');
    // A round gives three more days; three quiet days end it.
    const options = (
      await ann.get(`/api/exchange/${two.id}/options`).expect(200)
    ).body;
    expect(options.theirs.map((v: { id: string }) => v.id)).toEqual([two.mine]);
    const extra = await seed(annId, 'Extra');
    await prisma.videoRequest.update({
      where: { id: two.id },
      data: { expiresAt: new Date(Date.now() + DAY) },
    });
    await ann
      .post(`/api/exchange/${two.id}/counter`)
      .send({ holderGives: [two.wanted, extra], requesterGives: [two.mine] })
      .expect(200);
    const after = await prisma.videoRequest.findUniqueOrThrow({
      where: { id: two.id },
    });
    expect(after.expiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 3 * DAY - 60_000,
    );
    await prisma.videoRequest.update({
      where: { id: two.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await escrow.expire()).toBe(1);
    expect(
      (await prisma.videoRequest.findUniqueOrThrow({ where: { id: two.id } }))
        .status,
    ).toBe('EXPIRED');
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: two.mine } }))
        .purgedAt,
    ).not.toBeNull();
    await relay.drain();
    const bell = (await ann.get('/api/notifications').expect(200)).body.items;
    expect(bell[0]).toMatchObject({
      type: 'REQUEST_INVALIDATED',
      payload: { reason: 'expired' },
    });

    const three = await openDeal('Three');
    await three.g.post(`/api/guest/deals/${three.id}/cancel`).expect(200);
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: three.mine } }))
        .purgedAt,
    ).not.toBeNull();
  });

  it('the guest’s email: no confirmation, the deal’s link comes at once, then the other side’s moves', async () => {
    const deal = await openDeal();
    await clearMailbox();
    await deal.g
      .post(`/api/guest/deals/${deal.id}/email`)
      .send({ email: 'guest@example.com' })
      .expect(200);
    const mail = await waitForMail('guest@example.com', 'Your deal with');
    const link = /\/deal\/[^\s"]+/.exec(mail.text)![0];
    expect(new URL(link, 'http://x').searchParams.get('k')).toBe(deal.key);
    // Another browser opens the link: the key lets it in.
    const phone = client(app);
    await phone.get(`/api/guest/deals/${deal.id}`).expect(404);
    await phone.post('/api/guest/claim').send({ key: deal.key }).expect(200);
    const view = (await phone.get(`/api/guest/deals/${deal.id}`).expect(200))
      .body;
    expect(view.email).toBe('g•••@example.com');

    const extra = await seed(annId, 'Extra');
    await ann
      .post(`/api/exchange/${deal.id}/counter`)
      .send({ holderGives: [extra], requesterGives: [deal.mine] })
      .expect(200);
    await relay.drain();
    await waitForMail('guest@example.com', 'answered your offer');
  });

  it('the guest’s letters speak the language the deal page was last read in', async () => {
    const deal = await openDeal('Lake');
    const guestLocale = async () =>
      (
        await prisma.videoRequest.findUniqueOrThrow({
          where: { id: deal.id },
          select: { requester: { select: { locale: true } } },
        })
      ).requester.locale;
    expect(await guestLocale()).toBe('en');
    await deal.g
      .get(`/api/guest/deals/${deal.id}`)
      .set('Accept-Language', 'de')
      .expect(200);
    expect(await guestLocale()).toBe('de');
    // A request without a language leaves it as it is.
    await deal.g.get(`/api/guest/deals/${deal.id}`).expect(200);
    expect(await guestLocale()).toBe('de');
  });

  it('an exchange link: one per set of videos, its page, a guest’s deal from it, taken back', async () => {
    const a = await seed(annId, 'A');
    const b = await seed(annId, 'B');
    const link = (
      await ann
        .post('/api/me/exchange-links')
        .send({ videoIds: [a, b] })
        .expect(200)
    ).body;
    expect(
      (
        await ann
          .post('/api/me/exchange-links')
          .send({ videoIds: [b, a] })
          .expect(200)
      ).body.id,
    ).toBe(link.id);
    const invite = (
      await client(app).get(`/api/exchange-links/${link.code}`).expect(200)
    ).body;
    expect(invite).toMatchObject({
      owner: { username: 'ann', exchangeWants: 'Old cartoons' },
      own: false,
    });
    expect(invite.videos.map((v: { id: string }) => v.id)).toEqual([a, b]);
    expect(invite).toMatchObject({ guestExchange: true, guestDeal: null });
    // One private video on ann's shelf, offered the same way.
    const code = (await prisma.video.findUniqueOrThrow({ where: { id: a } }))
      .code;
    expect(
      (await client(app).get(`/api/exchange-offers/ann/${code}`).expect(200))
        .body,
    ).toMatchObject({ code: null, guestExchange: true, videos: [{ id: a }] });

    // A guest's deal asks for both; it remembers the link even with guests turned off.
    await ann
      .patch('/api/me')
      .send({ acceptGuestExchanges: false })
      .expect(200);
    const g = client(app);
    await g
      .post('/api/guest/deals')
      .send({ videoId: a, holder: 'ann' })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('guestExchangeOff'));
    const started = (
      await g.post('/api/guest/deals').send({ link: link.code }).expect(200)
    ).body;
    // Back on the link, the guest finds the deal they started there.
    expect(
      (await g.get(`/api/exchange-links/${link.code}`).expect(200)).body
        .guestDeal,
    ).toBe(started.id);
    const deal = await prisma.videoRequest.findUniqueOrThrow({
      where: { id: started.id },
      include: { offers: { include: { items: true } } },
    });
    expect(deal.exchangeLinkId).toBe(link.id);
    expect(deal.offers[0]!.items.map((i) => i.videoId).sort()).toEqual(
      [a, b].sort(),
    );

    // A person by the same link: an ordinary request, remembered too.
    const bob = client(app);
    await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    const req = (
      await bob
        .post('/api/exchange')
        .send({
          holderUsername: 'ann',
          videoIds: [a, b],
          exchangeLink: link.code,
        })
        .expect(201)
    ).body.request;
    expect(
      (await prisma.videoRequest.findUniqueOrThrow({ where: { id: req.id } }))
        .exchangeLinkId,
    ).toBe(link.id);
    // Back on the link, bob is shown into his request, not offered a new one.
    expect(
      (await bob.get(`/api/exchange-links/${link.code}`).expect(200)).body,
    ).toMatchObject({ request: req.id, guestDeal: null });

    await ann.delete(`/api/me/exchange-links/${link.id}`).expect(200);
    await client(app).get(`/api/exchange-links/${link.code}`).expect(404);
    expect((await ann.get('/api/me/exchange-links').expect(200)).body).toEqual(
      [],
    );
  });

  it('signing in hands the deal and the uploads to the account; it no longer runs out', async () => {
    const deal = await openDeal();
    await signUp(app, client(app), {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    await deal.g
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'secret123' })
      .expect(200);
    const bob = await prisma.user.findUniqueOrThrow({
      where: { username: 'bob' },
    });
    const after = await prisma.videoRequest.findUniqueOrThrow({
      where: { id: deal.id },
    });
    expect(after).toMatchObject({ requesterId: bob.id, expiresAt: null });
    const video = await prisma.video.findUniqueOrThrow({
      where: { id: deal.mine },
    });
    expect(video).toMatchObject({ authorId: bob.id, dealId: null });
    const thread = (await deal.g.get(`/api/exchange/${deal.id}`).expect(200))
      .body;
    expect(thread.role).toBe('requester');
    // The old addresses still lead to it: the video's exchange page knows the account's deal, the
    // guest's deal page is no more (the app opens the thread instead).
    const { code } = await prisma.video.findUniqueOrThrow({
      where: { id: deal.wanted },
      select: { code: true },
    });
    expect(
      (await deal.g.get(`/api/exchange-offers/ann/${code}`).expect(200)).body,
    ).toMatchObject({ request: deal.id, guestDeal: null });
    await deal.g.get(`/api/guest/deals/${deal.id}`).expect(404);
    // The ghost is gone; its key opens nothing.
    await client(app)
      .post('/api/guest/claim')
      .send({ key: deal.key })
      .expect(404);
  });
});

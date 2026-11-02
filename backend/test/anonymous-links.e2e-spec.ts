import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { PlanExpiryService } from '../src/modules/plans/plan-expiry.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

const HOUR = 60 * 60 * 1000;
/** The owner's nickname: nothing seen through their anonymous link may carry it. */
const NICK = 'nightowl';

/**
 * Pro users make anonymous links to their shelf. Through /p/<code> (`~<code>` in the
 * API) the shelf, its videos, their codes and contact sheets, and whatever comes of an exchange —
 * the deal, notifications, the copies received and passed on — never name the owner; deleted, or
 * once Pro ends, the link is a 404 while what came of it stays masked.
 */
describe('anonymous links (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let expiry: PlanExpiryService;
  let owl: C, bob: C, carl: C, guest: C;
  let owlId: string, bobId: string, carlId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    expiry = app.get(PlanExpiryService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    owl = client(app);
    bob = client(app);
    carl = client(app);
    guest = client(app);
    owlId = await signUp(app, owl, {
      email: 'owl@example.com',
      username: NICK,
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

  const pro = (userId: string, until: Date | null = null) =>
    prisma.user.update({
      where: { id: userId },
      data: { tier: 'PREMIUM', tierSource: 'ADMIN', tierUntil: until },
    });

  async function seed(
    authorId: string,
    title: string,
    visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE',
  ) {
    const prefix = `v/${title}/tok`;
    return prisma.video.create({
      data: {
        authorId,
        title,
        visibility,
        status: 'READY',
        readyAt: new Date(),
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        assetPrefix: prefix,
        thumbnailKey: `${prefix}/f07.jpg`,
        contactSheetKey: `${prefix}/sheet-linked.jpg`,
        plainSheetKey: `${prefix}/sheet-plain.jpg`,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
  }

  /** A link named "Moth" (the display name is the nickname, so it needs one). */
  async function link(note = 'for Bob') {
    await pro(owlId);
    const res = await owl
      .post('/api/me/anonymous-links')
      .send({ note, name: 'Moth' })
      .expect(200);
    return res.body as { id: string; code: string };
  }

  const leaks = (body: unknown) =>
    JSON.stringify(body).toLowerCase().includes(NICK);

  it('Pro makes, lists and deletes them; a name that gives the nickname away is refused', async () => {
    const free = await owl.post('/api/me/anonymous-links').send({}).expect(403);
    expect(free.body.code).toBe('anonymousLinkPro');

    await pro(owlId);
    // The display name is the nickname: the link needs a name of its own, and not this one.
    const unnamed = await owl
      .post('/api/me/anonymous-links')
      .send({ note: 'x' })
      .expect(400);
    expect(unnamed.body.code).toBe('anonymousLinkName');
    await owl
      .post('/api/me/anonymous-links')
      .send({ name: 'Night_Owl fan' })
      .expect(400);

    const made = await owl
      .post('/api/me/anonymous-links')
      .send({ note: 'for Bob', name: 'Moth' })
      .expect(200);
    expect(made.body.code).toMatch(/^[2-9a-hjkmnp-z]{10}$/);
    const mine = await owl.get('/api/me/anonymous-links').expect(200);
    expect(mine.body).toMatchObject({
      nameNeeded: true,
      links: [{ note: 'for Bob', name: 'Moth', ownName: true, works: true }],
    });

    // A display name of their own needs no name for the link.
    await prisma.user.update({
      where: { id: owlId },
      data: { displayName: 'Mira Lane' },
    });
    const plain = await owl
      .post('/api/me/anonymous-links')
      .send({})
      .expect(200);
    expect(plain.body).toMatchObject({ name: 'Mira Lane', ownName: false });

    for (let i = 2; i < 20; i++)
      await owl.post('/api/me/anonymous-links').send({}).expect(200);
    const many = await owl.post('/api/me/anonymous-links').send({}).expect(409);
    expect(many.body.code).toBe('anonymousLinkTooMany');

    await guest.get(`/api/users/~${made.body.code}`).expect(200);
    await owl.delete(`/api/me/anonymous-links/${made.body.id}`).expect(204);
    await guest.get(`/api/users/~${made.body.code}`).expect(404);
    await bob.delete(`/api/me/anonymous-links/${plain.body.id}`).expect(404);
  });

  it('through the link the shelf, its videos, their codes and sheets never name the owner', async () => {
    const pub = await seed(owlId, 'sunrise', 'PUBLIC');
    const priv = await seed(owlId, 'midnight');
    const carls = await seed(carlId, 'harbor');
    await prisma.videoAccess.create({
      data: { videoId: carls.id, holderId: owlId, source: 'EXCHANGE' },
    });
    const { code } = await link();
    const handle = `~${code}`;

    const profile = await guest.get(`/api/users/${handle}`).expect(200);
    expect(profile.body).toMatchObject({
      username: handle,
      displayName: 'Moth',
      counts: { followers: 0, following: 0, friends: 0 },
      relation: null,
    });
    expect(leaks(profile.body)).toBe(false);

    const shelf = await guest
      .get(`/api/users/${handle}/collection`)
      .expect(200);
    expect(leaks(shelf.body)).toBe(false);
    const cards = new Map(
      (
        shelf.body.items as {
          video: {
            id: string;
            code: string;
            contactSheetUrl: string | null;
            author: { username: string; displayName: string };
          };
        }[]
      ).map((i) => [i.video.id, i.video]),
    );
    expect(cards.size).toBe(3);
    for (const v of [pub, priv]) {
      const card = cards.get(v.id)!;
      expect(card.author).toMatchObject({
        username: handle,
        displayName: 'Moth',
      });
      expect(card.code).not.toBe(v.code);
      expect(card.contactSheetUrl).toContain('sheet-plain.jpg');
    }
    // Carl's video stays Carl's; only its code is the one seen through the link.
    const harbor = cards.get(carls.id)!;
    expect(harbor.author.username).toBe('carl');
    expect(harbor.code).not.toBe(carls.code);
    expect(harbor.contactSheetUrl).toContain('sheet-linked.jpg');

    for (const path of ['summary', 'featured', 'folders'])
      expect(
        leaks(
          (
            await guest
              .get(`/api/users/${handle}/collection/${path}`)
              .expect(200)
          ).body,
        ),
      ).toBe(false);

    // The code seen through the link opens the video in the link's page.
    const seen = cards.get(priv.id)!.code;
    const ctx = await guest.get(`/api/videos/code/${seen}`).expect(200);
    expect(ctx.body).toMatchObject({
      id: priv.id,
      code: seen,
      username: handle,
    });
    const page = await guest
      .get(`/api/users/${handle}/videos/${priv.id}`)
      .expect(200);
    expect(leaks(page.body)).toBe(false);
    expect(page.body).toMatchObject({
      holder: { username: handle, displayName: 'Moth' },
      author: { username: handle, displayName: 'Moth', pageVisible: true },
      video: { code: seen },
    });
    // The same code each time; the owner opens their own copy by it.
    expect(
      (await guest.get(`/api/users/${handle}/collection`).expect(200)).body
        .items,
    ).toEqual(shelf.body.items);
    expect(
      (await owl.get(`/api/videos/code/${seen}`).expect(200)).body.username,
    ).toBe(NICK);

    // A nickname finds nothing on the shelf; the title does.
    const byNick = await guest
      .get(`/api/users/${handle}/collection?q=${NICK}`)
      .expect(200);
    expect(byNick.body.total).toBe(0);
    const byTitle = await guest
      .get(`/api/users/${handle}/collection?q=midnight`)
      .expect(200);
    expect(byTitle.body.total).toBe(1);

    // A picture's address carries the id: an old /v/<id> link no longer leads to the owner.
    await guest.get(`/api/videos/${pub.id}/context`).expect(404);
    await bob.get(`/api/videos/${pub.id}/context`).expect(404);
    await owl.get(`/api/videos/${pub.id}/context`).expect(200);

    // Following, messages and the like never go through a link.
    await bob.post(`/api/users/${handle}/follow`).expect(404);

    // A hidden page still opens through the link, and only through it.
    await owl.put('/api/me/page').send({ hidden: true }).expect(200);
    await guest.get(`/api/users/${NICK}`).expect(404);
    await guest.get(`/api/users/${handle}/collection`).expect(200);
  });

  it('an exchange through the link keeps the owner masked, in what bob receives and passes on too', async () => {
    const priv = await seed(owlId, 'midnight');
    const { id: linkId, code } = await link();
    const handle = `~${code}`;

    const asked = await bob
      .post('/api/exchange')
      .send({ holderUsername: handle, videoIds: [priv.id] })
      .expect(201);
    expect(leaks(asked.body)).toBe(false);
    const requestId = asked.body.request.id as string;
    expect(asked.body.request).toMatchObject({
      holder: { username: handle, displayName: 'Moth' },
      counterpart: { username: handle },
      anonymousLink: null,
    });
    expect(
      leaks((await bob.get(`/api/exchange/${requestId}`).expect(200)).body),
    ).toBe(false);
    expect(
      leaks((await bob.get('/api/exchange?tab=outgoing').expect(200)).body),
    ).toBe(false);

    // The owner sees who asks, and that it came through their link.
    const theirs = await owl.get(`/api/exchange/${requestId}`).expect(200);
    expect(theirs.body).toMatchObject({
      anonymousLink: { note: 'for Bob' },
      requester: { username: 'bob' },
      holder: { username: NICK },
    });

    await owl.post(`/api/exchange/${requestId}/share`).expect(200);
    const held = await prisma.videoAccess.findUniqueOrThrow({
      where: { videoId_holderId: { videoId: priv.id, holderId: bobId } },
    });
    expect(held.anonymousLinkId).toBe(linkId);

    await relay.drain();
    const notes = (await bob.get('/api/notifications').expect(200)).body;
    expect(leaks(notes)).toBe(false);
    expect(
      (
        notes.items as { type: string; payload: Record<string, unknown> }[]
      ).find((n) => n.type === 'REQUEST_SHARED')?.payload,
    ).toMatchObject({ fromName: 'Moth' });

    // On bob's shelf, to bob and to anyone else, the author goes by the link.
    for (const viewer of [bob, carl, guest]) {
      const shelf = await viewer.get('/api/users/bob/collection').expect(200);
      expect(leaks(shelf.body)).toBe(false);
      expect(shelf.body.items[0].video.author.username).toBe(handle);
    }
    const page = await bob.get(`/api/users/bob/videos/${priv.id}`).expect(200);
    expect(leaks(page.body)).toBe(false);

    // Passed on to Carl, it stays masked.
    const toCarl = await carl
      .post('/api/exchange')
      .send({ holderUsername: 'bob', videoIds: [priv.id] })
      .expect(201);
    expect(leaks(toCarl.body)).toBe(false);
    await bob.post(`/api/exchange/${toCarl.body.request.id}/share`).expect(200);
    const carlHolds = await prisma.videoAccess.findUniqueOrThrow({
      where: { videoId_holderId: { videoId: priv.id, holderId: carlId } },
    });
    expect(carlHolds.anonymousLinkId).toBe(linkId);
    expect(
      leaks((await carl.get('/api/users/carl/collection').expect(200)).body),
    ).toBe(false);

    // Deleted, the link is a 404; what came of it still goes by the link's name, without a page.
    await owl.delete(`/api/me/anonymous-links/${linkId}`).expect(204);
    await bob.get(`/api/users/${handle}`).expect(404);
    const after = await bob.get('/api/users/bob/collection').expect(200);
    expect(after.body.items[0].video.author).toMatchObject({
      username: '~',
      displayName: 'Moth',
    });
    expect(leaks(after.body)).toBe(false);
    const own = await bob.get(`/api/users/bob/videos/${priv.id}`).expect(200);
    expect(own.body.author).toMatchObject({
      username: '~',
      pageVisible: false,
    });
  });

  it('a copy got through the link stays masked in temporary links, guest offers, downloads and the notice of its deletion', async () => {
    const priv = await seed(owlId, 'midnight');
    const { code } = await link();
    const handle = `~${code}`;
    const seen = (
      (await guest.get(`/api/users/${handle}/collection`).expect(200)).body
        .items as { video: { id: string; code: string } }[]
    ).find((i) => i.video.id === priv.id)!.video.code;

    // A guest offered the private video from the page seen through the link.
    const offer = await guest
      .get(`/api/exchange-offers/${handle}/${seen}`)
      .expect(200);
    expect(offer.body.owner).toMatchObject({
      username: handle,
      displayName: 'Moth',
    });
    expect(offer.body.videos[0].code).toBe(seen);
    expect(leaks(offer.body)).toBe(false);

    const asked = await bob
      .post('/api/exchange')
      .send({ holderUsername: handle, videoIds: [priv.id] })
      .expect(201);
    await owl.post(`/api/exchange/${asked.body.request.id}/share`).expect(200);

    // Bob sends it on by a temporary link: Carl sees it masked.
    const sent = await bob
      .post('/api/me/links')
      .send({ videoIds: [priv.id], ttl: '1d' })
      .expect(200);
    const linkPage = await carl.get(`/api/links/${sent.body.code}`).expect(200);
    expect(linkPage.body.videos[0].video.author.username).toBe(handle);
    expect(leaks(linkPage.body)).toBe(false);

    // The download page keeps the code it was opened by.
    const download = await bob.get(`/api/downloads/${seen}`).expect(200);
    expect(download.body).toMatchObject({ videoId: priv.id, code: seen });

    // The owner deletes it: Bob learns it under the link's name.
    await owl.delete(`/api/videos/${priv.id}`).expect(200);
    await relay.drain();
    const notes = (await bob.get('/api/notifications').expect(200)).body;
    expect(leaks(notes)).toBe(false);
    expect(
      (
        notes.items as { type: string; payload: Record<string, unknown> }[]
      ).find((n) => n.type === 'VIDEO_REMOVED')?.payload,
    ).toMatchObject({ authorName: 'Moth' });
  });

  it('the end of Pro closes the links, as the reminder and the notice say', async () => {
    const { code } = await link();
    await prisma.user.update({
      where: { id: owlId },
      data: { tierUntil: new Date(Date.now() + 23 * HOUR) },
    });
    expect(await expiry.run()).toMatchObject({ reminded: 1 });
    await prisma.user.update({
      where: { id: owlId },
      data: { tierUntil: new Date(Date.now() - HOUR) },
    });
    expect(await expiry.run()).toMatchObject({ expired: 1 });
    await guest.get(`/api/users/~${code}`).expect(404);
    expect(
      (await owl.get('/api/me/anonymous-links').expect(200)).body.links[0]
        .works,
    ).toBe(false);

    await relay.drain();
    const notes = (await owl.get('/api/notifications').expect(200)).body
      .items as { type: string; payload: Record<string, unknown> }[];
    expect(
      notes.find((n) => n.type === 'PLAN_EXPIRING')?.payload,
    ).toMatchObject({ anonymousLinks: true });
    expect(notes.find((n) => n.type === 'PLAN_EXPIRED')?.payload).toMatchObject(
      { anonymousLinks: true },
    );

    // Pro back, the link opens again.
    await pro(owlId);
    await guest.get(`/api/users/~${code}`).expect(200);
  });
});

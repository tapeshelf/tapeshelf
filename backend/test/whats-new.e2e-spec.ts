import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { VISIT_GAP_MS } from '../src/modules/collection/collection.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

/**
 * "What's new" lists the new videos of the people one follows, newest first, with a
 * dot for what came since the last look; a shelf visited before lights what was added since.
 */
describe('what’s new and shelf visits (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ann: C, bob: C, eve: C, guest: C;
  let annId: string, bobId: string, eveId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ann = client(app);
    bob = client(app);
    eve = client(app);
    guest = client(app);
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
    eveId = await signUp(app, eve, {
      email: 'eve@example.com',
      username: 'eve',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  async function seed(
    authorId: string,
    title: string,
    readyAt: Date | null,
    opts: { hidden?: boolean; status?: 'READY' | 'QUEUED' } = {},
  ) {
    const v = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PRIVATE',
        status: opts.status ?? 'READY',
        readyAt,
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        holdings: {
          create: {
            holderId: authorId,
            source: 'AUTHOR',
            hidden: opts.hidden ?? false,
            createdAt: readyAt ?? new Date(),
          },
        },
      },
    });
    return v.id;
  }

  const feed = async (c: C) =>
    (await c.get('/api/me/whats-new').expect(200)).body as {
      items: {
        video: { title: string; author: { username: string } };
        isNew: boolean;
      }[];
      hasMore: boolean;
    };
  const hasNew = async (c: C) =>
    (await c.get('/api/me/whats-new/state').expect(200)).body.hasNew as boolean;

  it('lists what the people I follow made, newest first, only what their shelf shows me', async () => {
    await bob.post('/api/users/ann/follow').expect(200);
    await bob.post('/api/users/eve/follow').expect(200);
    await prisma.follow.updateMany({
      where: { followerId: bobId },
      data: { createdAt: ago(600) },
    });
    await prisma.user.update({
      where: { id: bobId },
      data: { whatsNewSeenAt: ago(60) },
    });
    await seed(annId, 'old lake', ago(120));
    await seed(annId, 'new lake', ago(10));
    await seed(eveId, 'eve river', ago(30));
    await seed(annId, 'only for me', ago(5), { hidden: true });
    await seed(annId, 'still processing', null, { status: 'QUEUED' });
    await seed(bobId, 'my own', ago(1));
    const deleted = await seed(annId, 'deleted', ago(2));
    await prisma.video.update({
      where: { id: deleted },
      data: { deletedAt: new Date() },
    });

    const list = await feed(bob);
    expect(list.items.map((i) => [i.video.title, i.isNew])).toEqual([
      ['new lake', true],
      ['eve river', true],
      ['old lake', false],
    ]);
    expect(list.hasMore).toBe(false);
    // Pages: one more row tells whether there is more, no count of everything.
    const first = (await bob.get('/api/me/whats-new?limit=2').expect(200)).body;
    expect(
      first.items.map((i: { video: { title: string } }) => i.video.title),
    ).toEqual(['new lake', 'eve river']);
    expect(first.hasMore).toBe(true);
    const next = (
      await bob.get('/api/me/whats-new?limit=2&offset=2').expect(200)
    ).body;
    expect(
      next.items.map((i: { video: { title: string } }) => i.video.title),
    ).toEqual(['old lake']);
    expect(next.hasMore).toBe(false);
    expect(await hasNew(bob)).toBe(true);
    // Looking clears the dot; what is listed stays.
    await bob.post('/api/me/whats-new/seen').expect(200);
    expect(await hasNew(bob)).toBe(false);
    expect((await feed(bob)).items.every((i) => !i.isNew)).toBe(true);

    // A block either way takes that person out; a closed account too.
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: eveId, blockedId: bobId } },
      create: { blockerId: eveId, blockedId: bobId },
      update: {},
    });
    await prisma.user.update({
      where: { id: annId },
      data: { status: 'BANNED' },
    });
    expect((await feed(bob)).items).toEqual([]);
    // Guests have no such list.
    await guest.get('/api/me/whats-new').expect(401);
  });

  it('a new follow does not light up the back catalogue; a video after it does', async () => {
    await seed(annId, 'before the follow', ago(30));
    await bob.post('/api/users/ann/follow').expect(200);
    expect(await hasNew(bob)).toBe(false);
    expect(
      (await feed(bob)).items.map((i) => [i.video.title, i.isNew]),
    ).toEqual([['before the follow', false]]);
    await seed(annId, 'after the follow', new Date(Date.now() + 1000));
    expect(await hasNew(bob)).toBe(true);
  });

  it('a shelf visited before lights what was added since; the same visit keeps its line', async () => {
    await seed(annId, 'first', ago(300));
    const summary = async (c: C) =>
      (await c.get('/api/users/ann/collection/summary').expect(200)).body
        .newSince as string | null;
    // First visit: nothing to compare with. The owner and guests never get a line.
    expect(await summary(bob)).toBeNull();
    expect(await summary(ann)).toBeNull();
    expect(await summary(guest)).toBeNull();
    // Opened again soon (a reload, back from a video): still the same visit.
    expect(await summary(bob)).toBeNull();
    // Hours later: the line is the end of the previous visit.
    const lastSeen = ago(120);
    await prisma.shelfVisit.update({
      where: { visitorId_ownerId: { visitorId: bobId, ownerId: annId } },
      data: { lastSeenAt: lastSeen },
    });
    const line = await summary(bob);
    expect(line).toBe(lastSeen.toISOString());
    // Within the visit the line stays put.
    await prisma.shelfVisit.update({
      where: { visitorId_ownerId: { visitorId: bobId, ownerId: annId } },
      data: { lastSeenAt: new Date(Date.now() - VISIT_GAP_MS + 60_000) },
    });
    expect(await summary(bob)).toBe(line);
  });
});

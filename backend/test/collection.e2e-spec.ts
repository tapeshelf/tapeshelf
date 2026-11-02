import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

/**
 * categories, holdings (category, hidden, manual order), bulk actions and their permission
 * boundaries, folder filters and counts, page settings, avatar/cover.
 */
describe('collection management (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let guest: C, owner: C, other: C;
  let ownerId: string, otherId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    guest = client(app);
    owner = client(app);
    other = client(app);
    ownerId = await signUp(app, owner, {
      email: 'owner@example.com',
      username: 'owner',
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

  interface SeedOptions {
    visibility?: 'PUBLIC' | 'PRIVATE';
    status?: 'QUEUED' | 'READY';
    title?: string;
    sizeBytes?: bigint;
  }

  /** A video with its AUTHOR holding (no files: nothing here streams). */
  async function seed(authorId: string, opts: SeedOptions = {}) {
    const video = await prisma.video.create({
      data: {
        authorId,
        title: opts.title ?? 'Clip',
        visibility: opts.visibility ?? 'PRIVATE',
        status: opts.status ?? 'READY',
        originalKey: 'x',
        originalFilename: 'clip.mp4',
        sizeBytes: opts.sizeBytes ?? 1000n,
        durationSec: 10,
        progress: 100,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    await prisma.user.update({
      where: { id: authorId },
      data: { storageUsedBytes: { increment: opts.sizeBytes ?? 1000n } },
    });
    return video.id;
  }

  function hold(
    videoId: string,
    holderId: string,
    source: 'EXCHANGE' | 'SHARE' | 'PUBLIC_ADD' = 'EXCHANGE',
  ) {
    return prisma.videoAccess.create({ data: { videoId, holderId, source } });
  }

  const createCategory = async (c: C, name: string): Promise<string> =>
    (await c.post('/api/me/categories').send({ name }).expect(201)).body.id;

  const titles = (body: { items: { video: { title: string } }[] }) =>
    body.items.map((i) => i.video.title);

  describe('categories', () => {
    it('creates, lists with counts, renames, hides, reorders and rejects duplicates', async () => {
      const trips = await createCategory(owner, 'Trips');
      const music = await createCategory(owner, ' Music ');
      await owner
        .post('/api/me/categories')
        .send({ name: 'trips' })
        .expect(409);
      await owner.post('/api/me/categories').send({ name: '   ' }).expect(400);
      // Another user's names do not clash with mine.
      await other
        .post('/api/me/categories')
        .send({ name: 'Trips' })
        .expect(201);

      const v = await seed(ownerId, { title: 'a' });
      await owner
        .patch(`/api/videos/${v}/holding`)
        .send({ categoryId: trips })
        .expect(200);

      let list = (await owner.get('/api/me/categories').expect(200)).body;
      expect(
        list.map((c: { name: string; count: number }) => [c.name, c.count]),
      ).toEqual([
        ['Trips', 1],
        ['Music', 0],
      ]);

      await owner
        .patch(`/api/me/categories/${music}`)
        .send({ name: 'TRIPS' })
        .expect(409);
      const renamed = (
        await owner
          .patch(`/api/me/categories/${music}`)
          .send({ name: 'Concerts', hidden: true })
          .expect(200)
      ).body;
      expect(renamed).toMatchObject({
        name: 'Concerts',
        hidden: true,
        count: 0,
      });

      list = (
        await owner
          .put('/api/me/categories/order')
          .send({ ids: [music] })
          .expect(200)
      ).body;
      expect(list.map((c: { name: string }) => c.name)).toEqual([
        'Concerts',
        'Trips',
      ]);

      // Other people's categories are invisible and untouchable.
      await other
        .patch(`/api/me/categories/${trips}`)
        .send({ name: 'x' })
        .expect(404);
      await other.delete(`/api/me/categories/${trips}`).expect(404);
      expect(
        (await other.get('/api/me/categories').expect(200)).body,
      ).toHaveLength(1);
      await guest.get('/api/me/categories').expect(401);
    });

    it('deleting a category keeps its videos, now uncategorized', async () => {
      const trips = await createCategory(owner, 'Trips');
      const v = await seed(ownerId);
      await owner
        .patch(`/api/videos/${v}/holding`)
        .send({ categoryId: trips })
        .expect(200);
      await owner.delete(`/api/me/categories/${trips}`).expect(200);
      const holding = await prisma.videoAccess.findUniqueOrThrow({
        where: { videoId_holderId: { videoId: v, holderId: ownerId } },
      });
      expect(holding.categoryId).toBeNull();
      expect((await owner.get('/api/me/categories').expect(200)).body).toEqual(
        [],
      );
    });
  });

  describe('holdings', () => {
    it('files videos under own categories only; received and own ones can be hidden', async () => {
      const mine = await createCategory(owner, 'Mine');
      const theirs = await createCategory(other, 'Theirs');
      const own = await seed(ownerId, { title: 'own' });
      const received = await seed(otherId, { title: 'received' });
      await hold(received, ownerId, 'SHARE');

      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ categoryId: theirs })
        .expect(404);
      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ hidden: true })
        .expect(200);
      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ hidden: false })
        .expect(200);
      await owner
        .patch(`/api/videos/${received}/holding`)
        .send({ categoryId: mine, hidden: true })
        .expect(200);
      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ categoryId: mine })
        .expect(200);
      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ categoryId: null })
        .expect(200);

      const page = (
        await owner.get(`/api/users/owner/videos/${received}`).expect(200)
      ).body;
      expect(page.holding).toMatchObject({
        hidden: true,
        categoryId: mine,
        category: { id: mine, name: 'Mine' },
      });
      // A category assignment is per holder: the author's own holding is untouched.
      const authorHolding = await prisma.videoAccess.findUniqueOrThrow({
        where: { videoId_holderId: { videoId: received, holderId: otherId } },
      });
      expect(authorHolding.categoryId).toBeNull();
      expect(authorHolding.hidden).toBe(false);
      // The composite FK refuses a foreign category even if the check were bypassed.
      await expect(
        prisma.videoAccess.update({
          where: { videoId_holderId: { videoId: own, holderId: ownerId } },
          data: { categoryId: theirs },
        }),
      ).rejects.toThrow();
    });

    it('bulk: category and hidden over a mixed set, counting only what changed', async () => {
      const cat = await createCategory(owner, 'Cat');
      const a = await seed(ownerId, { title: 'a' });
      const b = await seed(ownerId, { title: 'b' });
      const r = await seed(otherId, { title: 'r' });
      await hold(r, ownerId);
      const notMine = await seed(otherId, { title: 'not mine' });

      const res = (
        await owner
          .patch('/api/me/collection/holdings')
          .send({ videoIds: [a, b, r, notMine], categoryId: cat, hidden: true })
          .expect(200)
      ).body;
      expect(res.updated).toBe(3);
      const holdings = await prisma.videoAccess.findMany({
        where: { holderId: ownerId },
        orderBy: { createdAt: 'asc' },
      });
      // Own videos are hidden too ("only for me"); a foreign one is not touched.
      expect(holdings.map((h) => [h.categoryId === cat, h.hidden])).toEqual([
        [true, true],
        [true, true],
        [true, true],
      ]);
      await owner
        .patch('/api/me/collection/holdings')
        .send({
          videoIds: [a],
          categoryId: '0199d1c0-1111-7000-8000-000000000001',
        })
        .expect(404);
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [], hidden: false })
        .expect(400);
    });
  });

  describe('bulk video actions', () => {
    it('visibility and the sensitive mark apply to own videos only; delete frees the quota', async () => {
      const a = await seed(ownerId, { title: 'a', sizeBytes: 500n });
      const b = await seed(ownerId, { title: 'b', sizeBytes: 700n });
      const r = await seed(otherId, { title: 'r', visibility: 'PUBLIC' });
      await hold(r, ownerId, 'PUBLIC_ADD');

      const upd = (
        await owner
          .patch('/api/me/collection/videos')
          .send({
            videoIds: [a, b, r],
            visibility: 'PUBLIC',
            sensitive: true,
          })
          .expect(200)
      ).body;
      expect(upd.updated).toBe(2);
      const videos = await prisma.video.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(videos.map((v) => [v.visibility, v.sensitive])).toEqual([
        ['PUBLIC', true],
        ['PUBLIC', true],
        ['PUBLIC', false],
      ]);
      // Empty change set is a no-op, not an error.
      expect(
        (
          await owner
            .patch('/api/me/collection/videos')
            .send({ videoIds: [a] })
            .expect(200)
        ).body.updated,
      ).toBe(0);

      const del = (
        await owner
          .post('/api/me/collection/videos/delete')
          .send({ videoIds: [a, b, r] })
          .expect(200)
      ).body;
      expect(del.updated).toBe(2);
      const me = await prisma.user.findUniqueOrThrow({
        where: { id: ownerId },
      });
      expect(me.storageUsedBytes).toBe(0n);
      const rVideo = await prisma.video.findUniqueOrThrow({ where: { id: r } });
      expect(rVideo.deletedAt).toBeNull();
      expect(
        (await owner.get('/api/users/owner/collection').expect(200)).body.total,
      ).toBe(1);
      // Deleting again changes nothing.
      expect(
        (
          await owner
            .post('/api/me/collection/videos/delete')
            .send({ videoIds: [a] })
            .expect(200)
        ).body.updated,
      ).toBe(0);
    });
  });

  describe('search on a shelf', () => {
    it('finds titles containing the text, case aside, within the folder; visitors only among what they see', async () => {
      const cat = await createCategory(owner, 'Trips');
      const lake = await seed(ownerId, {
        title: 'Lake Baikal',
        visibility: 'PUBLIC',
      });
      await seed(ownerId, { title: 'Озеро Байкал' });
      await seed(ownerId, { title: '100% lake_side' });
      const hiddenLake = await seed(ownerId, { title: 'lake, hidden' });
      await prisma.videoAccess.update({
        where: { videoId_holderId: { videoId: hiddenLake, holderId: ownerId } },
        data: { hidden: true },
      });
      const theirs = await seed(otherId, { title: 'Their LAKE' });
      await hold(theirs, ownerId);
      await owner
        .patch(`/api/videos/${lake}/holding`)
        .send({ categoryId: cat })
        .expect(200);
      const list = async (c: C, query: string) =>
        titles(
          (
            await c
              .get(`/api/users/owner/collection?sort=title&${query}`)
              .expect(200)
          ).body,
        ).sort();

      expect(await list(owner, 'q=LAKE')).toEqual([
        '100% lake_side',
        'Lake Baikal',
        'Their LAKE',
      ]);
      expect(await list(owner, `q=${encodeURIComponent('байкал')}`)).toEqual([
        'Озеро Байкал',
      ]);
      // LIKE's own characters are plain text.
      expect(await list(owner, `q=${encodeURIComponent('0% l')}`)).toEqual([
        '100% lake_side',
      ]);
      expect(await list(owner, 'q=e_s')).toEqual(['100% lake_side']);
      expect(await list(owner, `q=${encodeURIComponent('%')}`)).toEqual([
        '100% lake_side',
      ]);
      // Within the folder or category asked for; hidden ones only in "Hidden".
      expect(await list(owner, 'q=lake&section=OTHERS')).toEqual([
        'Their LAKE',
      ]);
      expect(await list(owner, `q=lake&categoryId=${cat}`)).toEqual([
        'Lake Baikal',
      ]);
      expect(await list(owner, 'q=lake&section=HIDDEN')).toEqual([
        'lake, hidden',
      ]);
      // Spaces alone are no search ("All" without the hidden one).
      expect(
        (await owner.get('/api/users/owner/collection?q=%20%20').expect(200))
          .body.total,
      ).toBe(4);
      // A guest finds among what a guest sees.
      expect(await list(guest, 'q=lake')).toEqual([
        '100% lake_side',
        'Lake Baikal',
        'Their LAKE',
      ]);
      expect(
        (
          await guest
            .get('/api/users/owner/collection?q=lake&section=PUBLIC')
            .expect(200)
        ).body.total,
      ).toBe(1);
      await guest
        .get(`/api/users/owner/collection?q=${'x'.repeat(101)}`)
        .expect(400);
    });
  });

  describe('a wider search', () => {
    it('reaches the description, the category, the stack and the author, forgives a typo, title first', async () => {
      const dives = await createCategory(owner, 'Mountaineering hub');
      const secret = await createCategory(owner, 'Secret room');
      const inTitle = await seed(ownerId, {
        title: 'Deep mountaineering',
        visibility: 'PUBLIC',
      });
      const described = await seed(ownerId, {
        title: 'Morning walk',
        visibility: 'PUBLIC',
      });
      await prisma.video.update({
        where: { id: described },
        data: { description: 'A calm mountaineering trip' },
      });
      const filed = await seed(ownerId, {
        title: 'Untitled 7',
        visibility: 'PUBLIC',
      });
      await owner
        .patch(`/api/videos/${filed}/holding`)
        .send({ categoryId: dives })
        .expect(200);
      const stacked = await seed(ownerId, {
        title: 'Clip A',
        visibility: 'PUBLIC',
      });
      const stacked2 = await seed(ownerId, {
        title: 'Clip B',
        visibility: 'PUBLIC',
      });
      await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [stacked, stacked2], name: 'Bubble rings' })
        .expect((r) => expect(r.status).toBeLessThan(300));
      const theirs = await seed(otherId, { title: 'Sunset' });
      await hold(theirs, ownerId);
      const hiddenAway = await seed(ownerId, {
        title: 'Quiet one',
        visibility: 'PUBLIC',
      });
      await owner
        .patch(`/api/videos/${hiddenAway}/holding`)
        .send({ categoryId: secret })
        .expect(200);
      await owner
        .patch(`/api/me/categories/${secret}`)
        .send({ hidden: true })
        .expect(200);

      const found = async (c: C, q: string) =>
        titles(
          (
            await c
              .get(`/api/users/owner/collection?q=${encodeURIComponent(q)}`)
              .expect(200)
          ).body,
        );
      // In the title first, then what was found elsewhere (description, category).
      const free = await found(owner, 'mountaineering');
      expect(free[0]).toBe('Deep mountaineering');
      expect([...free].sort()).toEqual([
        'Deep mountaineering',
        'Morning walk',
        'Untitled 7',
      ]);
      // A typo still finds it; the near miss comes last.
      expect(await found(owner, 'mountaneering')).toContain(
        'Deep mountaineering',
      );
      // The stack's name, the author's nickname.
      expect([...(await found(owner, 'bubble'))].sort()).toEqual([
        'Clip A',
        'Clip B',
      ]);
      expect(await found(owner, 'other')).toEqual(['Sunset']);
      // A guest's search never reaches a category hidden from guests; the owner's does.
      expect(await found(owner, 'secret room')).toEqual(['Quiet one']);
      expect(await found(guest, 'secret room')).toEqual([]);
      // Short words stay exact: no near misses under four letters.
      expect(await found(owner, 'dep')).toEqual([]);
      expect(inTitle).toBeTruthy();
    });
  });

  describe('months, letters and what is new', () => {
    const at = async (videoId: string, iso: string) =>
      prisma.videoAccess.update({
        where: { videoId_holderId: { videoId, holderId: ownerId } },
        data: { createdAt: new Date(iso) },
      });

    it('divides newest first by month in the viewer’s time zone, by title by first letter, not otherwise', async () => {
      await at(
        await seed(ownerId, { title: 'apple', visibility: 'PUBLIC' }),
        '2026-10-05T10:00:00Z',
      );
      await at(
        await seed(ownerId, { title: 'Banana', visibility: 'PUBLIC' }),
        '2026-10-01T10:00:00Z',
      );
      // 23:30 UTC on 30 September is already October in Paris.
      await at(
        await seed(ownerId, { title: '123 go', visibility: 'PUBLIC' }),
        '2026-09-30T23:30:00Z',
      );
      await at(
        await seed(ownerId, { title: 'avocado', visibility: 'PUBLIC' }),
        '2026-08-15T10:00:00Z',
      );
      const buckets = async (query: string) =>
        (
          await guest
            .get(`/api/users/owner/collection/buckets?${query}`)
            .expect(200)
        ).body;
      expect(await buckets('sort=added')).toEqual({
        by: 'month',
        buckets: [
          { key: '2026-10', count: 2 },
          { key: '2026-09', count: 1 },
          { key: '2026-08', count: 1 },
        ],
      });
      expect((await buckets('sort=added&tz=Europe/Paris')).buckets).toEqual([
        { key: '2026-10', count: 3 },
        { key: '2026-08', count: 1 },
      ]);
      // An unknown zone is UTC, not an error.
      expect((await buckets('sort=added&tz=Mars/Base')).buckets[0]).toEqual({
        key: '2026-10',
        count: 2,
      });
      expect(await buckets('sort=title')).toEqual({
        by: 'letter',
        buckets: [
          { key: '#', count: 1 },
          { key: 'A', count: 2 },
          { key: 'B', count: 1 },
        ],
      });
      expect(await buckets('sort=manual')).toEqual({ by: null, buckets: [] });
      expect(await buckets('sort=added&q=apple')).toEqual({
        by: null,
        buckets: [],
      });
      expect((await buckets('sort=added&section=PRIVATE')).buckets).toEqual([]);
    });

    it('counts what is new since a signed-in visitor’s last visit and lists only that on request', async () => {
      const old = await seed(ownerId, {
        title: 'Seen before',
        visibility: 'PUBLIC',
      });
      await at(old, new Date(Date.now() - 3 * 3600_000).toISOString());
      // The first visit draws no line.
      expect(
        (await other.get('/api/users/owner/collection/summary').expect(200))
          .body,
      ).toMatchObject({
        newSince: null,
        newCount: 0,
      });
      // Two hours later, one more video.
      await prisma.shelfVisit.updateMany({
        where: { visitorId: otherId, ownerId },
        data: { lastSeenAt: new Date(Date.now() - 2 * 3600_000) },
      });
      await seed(ownerId, { title: 'Brand new', visibility: 'PUBLIC' });
      const summary = (
        await other.get('/api/users/owner/collection/summary').expect(200)
      ).body;
      expect(summary.newCount).toBe(1);
      expect(
        titles(
          (
            await other
              .get(
                `/api/users/owner/collection?addedAfter=${encodeURIComponent(summary.newSince)}`,
              )
              .expect(200)
          ).body,
        ),
      ).toEqual(['Brand new']);
      // Guests and the owner have no line.
      expect(
        (await guest.get('/api/users/owner/collection/summary').expect(200))
          .body.newCount,
      ).toBe(0);
      expect(
        (await owner.get('/api/users/owner/collection/summary').expect(200))
          .body.newCount,
      ).toBe(0);
      await guest
        .get('/api/users/owner/collection?addedAfter=yesterday')
        .expect(400);
    });
  });

  describe('Inbox, titles at once, duplicates', () => {
    const inboxOf = async (c: C) =>
      titles(
        (
          await c
            .get('/api/users/owner/collection?section=INBOX&sort=title')
            .expect(200)
        ).body,
      );

    it('keeps unsorted uploads in the Inbox until they get a category, a stack or are kept as they are', async () => {
      const ids: string[] = [];
      for (const title of ['A one', 'B two', 'C three', 'D four', 'E five']) {
        const id = await seed(ownerId, { title, visibility: 'PUBLIC' });
        await prisma.videoAccess.update({
          where: { videoId_holderId: { videoId: id, holderId: ownerId } },
          data: { inbox: true },
        });
        ids.push(id);
      }
      expect(await inboxOf(owner)).toEqual([
        'A one',
        'B two',
        'C three',
        'D four',
        'E five',
      ]);
      expect(
        (await owner.get('/api/users/owner/collection/summary').expect(200))
          .body.inbox,
      ).toBe(5);
      const cat = await createCategory(owner, 'Sorted');
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [ids[0]], categoryId: cat })
        .expect(200);
      await owner
        .patch(`/api/videos/${ids[1]}/holding`)
        .send({ categoryId: cat })
        .expect(200);
      await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [ids[2], ids[3]] })
        .expect((r) => expect(r.status).toBeLessThan(300));
      expect(await inboxOf(owner)).toEqual(['E five']);
      // Out of a category again, it does not come back: it was sorted once.
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [ids[0]], categoryId: null })
        .expect(200);
      expect(await inboxOf(owner)).toEqual(['E five']);
      expect(
        (
          await owner
            .post('/api/me/collection/inbox/done')
            .send({ videoIds: [ids[4]] })
            .expect(200)
        ).body.updated,
      ).toBe(1);
      expect(await inboxOf(owner)).toEqual([]);
      // Visitors have no Inbox of the owner's.
      await prisma.videoAccess.updateMany({
        where: { holderId: ownerId },
        data: { inbox: true },
      });
      expect(await inboxOf(guest)).toEqual([]);
      expect(
        (await guest.get('/api/users/owner/collection/summary').expect(200))
          .body.inbox,
      ).toBe(0);
    });

    it('renames many at once: own titles, received ones get my own name; others are skipped', async () => {
      const own = await seed(ownerId, { title: 'Summer_trip-lake-1080p' });
      const theirs = await seed(otherId, { title: 'their_file' });
      await hold(theirs, ownerId, 'SHARE');
      const notMine = await seed(otherId, { title: 'not mine' });
      expect(
        (
          await owner
            .patch('/api/me/collection/titles')
            .send({
              items: [
                { videoId: own, title: 'Summer trip lake' },
                { videoId: theirs, title: '  Their file  ' },
                { videoId: notMine, title: 'Nope' },
              ],
            })
            .expect(200)
        ).body.updated,
      ).toBe(2);
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: own } })).title,
      ).toBe('Summer trip lake');
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: theirs } })).title,
      ).toBe('their_file');
      expect(
        (
          await prisma.videoAccess.findUniqueOrThrow({
            where: { videoId_holderId: { videoId: theirs, holderId: ownerId } },
          })
        ).customTitle,
      ).toBe('Their file');
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: notMine } }))
          .title,
      ).toBe('not mine');
      await owner
        .patch('/api/me/collection/titles')
        .send({ items: [{ videoId: own, title: ' ' }] })
        .expect(400);
    });

    it('knows a file again before it is uploaded, and groups the likely same videos', async () => {
      const a = await seed(ownerId, { title: 'Sunset at sea' });
      const b = await seed(ownerId, { title: 'sunset at sea (copy)' });
      const c = await seed(ownerId, { title: 'Totally else' });
      const d = await seed(ownerId, { title: 'Another one' });
      await prisma.video.update({
        where: { id: a },
        data: {
          uploadedSize: 123456n,
          originalFilename: 'Sunset.MP4',
          originalSha256: 'f'.repeat(64),
        },
      });
      await prisma.video.update({
        where: { id: c },
        data: { originalSha256: 'f'.repeat(64) },
      });
      await prisma.video.update({
        where: { id: d },
        data: { originalFilename: 'other.mp4' },
      });
      const check = (
        await owner
          .post('/api/me/collection/duplicates/check')
          .send({
            files: [
              { name: 'renamed.mp4', size: 123456 },
              { name: 'sunset.mp4', size: 1 },
              { name: 'fresh.mp4', size: 9 },
            ],
          })
          .expect(200)
      ).body;
      expect(check.matches).toEqual([
        {
          index: 0,
          videoId: a,
          code: expect.any(String),
          title: 'Sunset at sea',
        },
        {
          index: 1,
          videoId: a,
          code: expect.any(String),
          title: 'Sunset at sea',
        },
      ]);
      const groups = (
        await owner.get('/api/me/collection/duplicates').expect(200)
      ).body.groups as {
        reason: string;
        videos: { id: string }[];
      }[];
      // a and c: the same file; b has c's file name and length, and a title like a's.
      const withA = groups.find((g) => g.videos.some((v) => v.id === a))!;
      expect(withA.reason).toBe('file');
      expect(withA.videos.map((v) => v.id).sort()).toEqual([a, b, c].sort());
      // d: another name, another title: no group.
      expect(groups.some((g) => g.videos.some((v) => v.id === d))).toBe(false);
      // The guest has no such tools.
      await guest.get('/api/me/collection/duplicates').expect(401);
    });
  });

  describe('featured, folders, one feed and the table', () => {
    const keysOf = (body: { order: string[] }) => body.order;

    it('lists one feed for a visitor on request, newest first across visibility', async () => {
      const older = await seed(ownerId, {
        title: 'Older public',
        visibility: 'PUBLIC',
      });
      const newer = await seed(ownerId, { title: 'Newer private' });
      await prisma.videoAccess.update({
        where: { videoId_holderId: { videoId: older, holderId: ownerId } },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      expect(
        titles(
          (await guest.get('/api/users/owner/collection').expect(200)).body,
        ),
      ).toEqual(['Older public', 'Newer private']);
      expect(
        titles(
          (await guest.get('/api/users/owner/collection?flat=true').expect(200))
            .body,
        ),
      ).toEqual(['Newer private', 'Older public']);
      expect(
        titles(
          (
            await guest
              .get('/api/users/owner/collection?flat=false')
              .expect(200)
          ).body,
        ),
      ).toEqual(['Older public', 'Newer private']);
      expect(newer).toBeTruthy();
    });

    it('sorts the owner’s table by a column either way; a visitor keeps the page’s order', async () => {
      const ids: Record<string, string> = {};
      for (const [title, dur, size, height] of [
        ['Short', 5, 3000n, 720],
        ['Long', 50, 1000n, 1080],
        ['Middle', 20, 2000n, 480],
      ] as const) {
        ids[title] = await seed(ownerId, {
          title,
          visibility: 'PUBLIC',
          sizeBytes: size,
        });
        await prisma.video.update({
          where: { id: ids[title] },
          data: {
            durationSec: dur,
            height,
            width: Math.round((height * 16) / 9),
          },
        });
      }
      const list = async (c: C, query: string) =>
        titles(
          (await c.get(`/api/users/owner/collection?${query}`).expect(200))
            .body,
        );
      expect(await list(owner, 'sort=duration')).toEqual([
        'Long',
        'Middle',
        'Short',
      ]);
      expect(await list(owner, 'sort=duration&dir=asc')).toEqual([
        'Short',
        'Middle',
        'Long',
      ]);
      expect(await list(owner, 'sort=size')).toEqual([
        'Short',
        'Middle',
        'Long',
      ]);
      expect(await list(owner, 'sort=quality')).toEqual([
        'Long',
        'Short',
        'Middle',
      ]);
      expect(await list(owner, 'sort=title&dir=desc')).toEqual([
        'Short',
        'Middle',
        'Long',
      ]);
      const cat = await createCategory(owner, 'Alpha');
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [ids['Middle']], categoryId: cat })
        .expect(200);
      expect((await list(owner, 'sort=category'))[0]).toBe('Middle');
      // Paged, the order holds across pages.
      expect([
        ...(await list(owner, 'sort=duration&limit=2')),
        ...(await list(owner, 'sort=duration&limit=2&offset=2')),
      ]).toEqual(['Long', 'Middle', 'Short']);
      // Not a visitor's: the page's own order (newest first).
      expect(await list(guest, 'sort=duration')).toEqual([
        'Middle',
        'Long',
        'Short',
      ]);
      await owner.get('/api/users/owner/collection?sort=length').expect(400);
      await owner.get('/api/users/owner/collection?dir=up').expect(400);
      expect(
        (
          await owner
            .get('/api/users/owner/collection/buckets?sort=size')
            .expect(200)
        ).body,
      ).toEqual({ by: null, buckets: [] });
      expect(
        (
          await owner
            .get('/api/users/owner/collection/buckets?sort=added&dir=asc')
            .expect(200)
        ).body.by,
      ).toBeNull();
    });

    it('shows categories as cards with counts, length and pictures; the owner picks a cover', async () => {
      const shown = await createCategory(owner, 'Shown');
      const secret = await createCategory(owner, 'Secret');
      await createCategory(owner, 'Empty');
      await owner
        .patch(`/api/me/categories/${secret}`)
        .send({ hidden: true })
        .expect(200);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = await seed(ownerId, {
          title: `Card ${i}`,
          visibility: 'PUBLIC',
        });
        await prisma.video.update({
          where: { id },
          data: { thumbnailKey: `t/${i}.jpg`, durationSec: 60 },
        });
        await prisma.videoAccess.update({
          where: { videoId_holderId: { videoId: id, holderId: ownerId } },
          data: {
            categoryId: i < 5 ? shown : secret,
            createdAt: new Date(Date.now() - (10 - i) * 1000),
          },
        });
        ids.push(id);
      }
      const asGuest = (
        await guest.get('/api/users/owner/collection/folders').expect(200)
      ).body;
      expect(asGuest.folders).toHaveLength(1);
      const card = asGuest.folders[0];
      expect(card).toMatchObject({
        id: shown,
        name: 'Shown',
        count: 5,
        durationSec: 300,
        coverVideoId: null,
      });
      // The latest four, newest first.
      expect(card.pictures.map((p: { videoId: string }) => p.videoId)).toEqual([
        ids[4],
        ids[3],
        ids[2],
        ids[1],
      ]);
      expect(card.pictures[0].url).toMatch(/t\/4\.jpg$/);
      const asOwner = (
        await owner.get('/api/users/owner/collection/folders').expect(200)
      ).body;
      expect(asOwner.folders.map((f: { name: string }) => f.name)).toEqual([
        'Shown',
        'Secret',
      ]);
      // For a visitor, a hidden category is no category: its videos are with the rest.
      expect(
        titles(
          (
            await guest
              .get('/api/users/owner/collection?categoryId=none')
              .expect(200)
          ).body,
        ),
      ).toEqual(['Card 5']);
      expect(
        titles(
          (
            await owner
              .get('/api/users/owner/collection?categoryId=none')
              .expect(200)
          ).body,
        ),
      ).toEqual([]);

      // A cover of its own videos only.
      await owner
        .patch(`/api/me/categories/${shown}`)
        .send({ coverVideoId: ids[5] })
        .expect(404);
      const updated = (
        await owner
          .patch(`/api/me/categories/${shown}`)
          .send({ coverVideoId: ids[0] })
          .expect(200)
      ).body;
      expect(updated.coverVideoId).toBe(ids[0]);
      const covered = (
        await guest.get('/api/users/owner/collection/folders').expect(200)
      ).body.folders[0];
      expect(
        covered.pictures.map((p: { videoId: string }) => p.videoId),
      ).toEqual([ids[0]]);
      await owner
        .patch(`/api/me/categories/${shown}`)
        .send({ coverVideoId: null })
        .expect(200);
      expect(
        (await guest.get('/api/users/owner/collection/folders').expect(200))
          .body.folders[0].pictures,
      ).toHaveLength(4);
    });

    it('keeps a category’s own rows and tile size, shown to visitors; null goes back to the page’s', async () => {
      const cat = await createCategory(owner, 'Looks');
      const id = await seed(ownerId, { title: 'Seen', visibility: 'PUBLIC' });
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [id], categoryId: cat })
        .expect(200);
      const fresh = (await owner.get('/api/me/categories').expect(200)).body[0];
      expect(fresh).toMatchObject({ previewRows: null, tileScale: null });
      await owner
        .patch(`/api/me/categories/${cat}`)
        .send({ previewRows: 7 })
        .expect(400);
      await owner
        .patch(`/api/me/categories/${cat}`)
        .send({ tileScale: 'huge' })
        .expect(400);
      const set = (
        await owner
          .patch(`/api/me/categories/${cat}`)
          .send({ previewRows: 4, tileScale: 'lg' })
          .expect(200)
      ).body;
      expect(set).toMatchObject({
        previewRows: 4,
        tileScale: 'lg',
        name: 'Looks',
      });
      const seen = (
        await guest.get('/api/users/owner/collection/summary').expect(200)
      ).body.categories[0];
      expect(seen).toMatchObject({ previewRows: 4, tileScale: 'lg' });
      // Renaming leaves it; null goes back to the page's setting; 0 is "all of it".
      await owner
        .patch(`/api/me/categories/${cat}`)
        .send({ name: 'Looks 2' })
        .expect(200);
      expect(
        (
          await owner
            .patch(`/api/me/categories/${cat}`)
            .send({ previewRows: 0 })
            .expect(200)
        ).body,
      ).toMatchObject({ previewRows: 0, tileScale: 'lg' });
      expect(
        (
          await owner
            .patch(`/api/me/categories/${cat}`)
            .send({ previewRows: null, tileScale: null })
            .expect(200)
        ).body,
      ).toMatchObject({ previewRows: null, tileScale: null });
    });

    it('pins up to twelve videos and stacks in order; visitors see what they may', async () => {
      const a = await seed(ownerId, { title: 'Pin A', visibility: 'PUBLIC' });
      const b = await seed(ownerId, { title: 'Pin B' });
      const hidden = await seed(ownerId, {
        title: 'Pin hidden',
        visibility: 'PUBLIC',
      });
      const s1 = await seed(ownerId, {
        title: 'Stack 1',
        visibility: 'PUBLIC',
      });
      const s2 = await seed(ownerId, {
        title: 'Stack 2',
        visibility: 'PUBLIC',
      });
      const theirs = await seed(otherId, {
        title: 'Not mine',
        visibility: 'PUBLIC',
      });
      await prisma.videoAccess.update({
        where: { videoId_holderId: { videoId: hidden, holderId: ownerId } },
        data: { hidden: true },
      });
      const stack = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [s1, s2] })
      ).body.id as string;
      await owner
        .put('/api/me/collection/featured')
        .send({
          keys: [
            `stack:${stack}`,
            `video:${b}`,
            `video:${theirs}`,
            `video:${hidden}`,
            `video:${a}`,
          ],
        })
        .expect(200);
      const mine = (
        await owner.get('/api/users/owner/collection/featured').expect(200)
      ).body;
      // Not mine: left out; hidden: only in the Hidden folder.
      expect(keysOf(mine)).toEqual([
        `stack:${stack}`,
        `video:${b}`,
        `video:${a}`,
      ]);
      const stackItems = mine.items.filter(
        (i: { stack: { id: string } | null }) => i.stack?.id === stack,
      );
      expect(stackItems).toHaveLength(2);
      expect(stackItems[0].stack.size).toBe(2);
      const pinB = mine.items.find(
        (i: { video: { id: string } }) => i.video.id === b,
      );
      expect(pinB.stack).toBeNull();
      // Reordered and one unpinned, in one call.
      await owner
        .put('/api/me/collection/featured')
        .send({ keys: [`video:${a}`, `stack:${stack}`] })
        .expect(200);
      expect(
        keysOf(
          (await guest.get('/api/users/owner/collection/featured').expect(200))
            .body,
        ),
      ).toEqual([`video:${a}`, `stack:${stack}`]);
      // A stack a visitor sees one video of is that video.
      await prisma.video.update({
        where: { id: s2 },
        data: { status: 'QUEUED' },
      });
      const guestView = (
        await guest.get('/api/users/owner/collection/featured').expect(200)
      ).body;
      expect(keysOf(guestView)).toEqual([`video:${a}`, `video:${s1}`]);
      expect(guestView.items[1].stack).toBeNull();
      await owner
        .put('/api/me/collection/featured')
        .send({
          keys: Array.from(
            { length: 13 },
            (_, i) => `video:${a.slice(0, -2)}${String(i).padStart(2, '0')}`,
          ),
        })
        .expect(400);
      await owner
        .put('/api/me/collection/featured')
        .send({ keys: ['film:x'] })
        .expect(400);
      await guest
        .put('/api/me/collection/featured')
        .send({ keys: [] })
        .expect(401);
      await owner
        .put('/api/me/collection/featured')
        .send({ keys: [] })
        .expect(200);
      expect(
        (await guest.get('/api/users/owner/collection/featured').expect(200))
          .body,
      ).toEqual({
        items: [],
        order: [],
      });
    });
  });

  describe('the holder’s own name for a video', () => {
    it('shows on the holder’s shelf and on the page opened there, with the author’s aside; nowhere else', async () => {
      const theirs = await seed(otherId, { title: 'Zebra crossing' });
      await prisma.video.update({
        where: { id: theirs },
        data: { description: 'By the author' },
      });
      await hold(theirs, ownerId, 'SHARE');
      const own = await seed(ownerId, { title: 'Mine' });
      await owner
        .patch(`/api/videos/${own}/holding`)
        .send({ title: 'Renamed' })
        .expect(400)
        .expect((r) => expect(r.body.code).toBe('ownVideoRename'));
      await owner
        .patch(`/api/videos/${theirs}/holding`)
        .send({ title: '  Apple trip  ', description: 'My notes' })
        .expect(200);

      const shelf = (
        await owner.get('/api/users/owner/collection?sort=title').expect(200)
      ).body.items as {
        video: { title: string };
        originalTitle: string | null;
      }[];
      // Sorted and shown by the holder's name, the author's kept aside.
      expect(shelf.map((i) => [i.video.title, i.originalTitle])).toEqual([
        ['Apple trip', 'Zebra crossing'],
        ['Mine', null],
      ]);
      for (const q of ['apple', 'zebra'])
        expect(
          titles(
            (await owner.get(`/api/users/owner/collection?q=${q}`).expect(200))
              .body,
          ),
        ).toEqual(['Apple trip']);

      const page = (
        await guest.get(`/api/users/owner/videos/${theirs}`).expect(200)
      ).body;
      expect(page.video).toMatchObject({
        title: 'Apple trip',
        description: 'My notes',
      });
      expect(page.original).toEqual({
        title: 'Zebra crossing',
        description: 'By the author',
      });
      expect(page.holding).toMatchObject({
        customTitle: 'Apple trip',
        customDescription: 'My notes',
      });
      // In the author's shelf, the author's.
      const authors = (
        await guest.get(`/api/users/other/videos/${theirs}`).expect(200)
      ).body;
      expect(authors.video.title).toBe('Zebra crossing');
      expect(authors.original).toBeNull();
      expect(
        titles(
          (await guest.get('/api/users/other/collection').expect(200)).body,
        ),
      ).toEqual(['Zebra crossing']);

      // Blank goes back to the author's.
      await owner
        .patch(`/api/videos/${theirs}/holding`)
        .send({ title: ' ', description: null })
        .expect(200);
      const back = (
        await owner.get(`/api/users/owner/videos/${theirs}`).expect(200)
      ).body;
      expect(back.video.title).toBe('Zebra crossing');
      expect(back.original).toBeNull();
      await owner
        .patch(`/api/videos/${theirs}/holding`)
        .send({ title: 'x'.repeat(151) })
        .expect(400);
    });
  });

  describe('folders, sorting and manual order', () => {
    it('owner folders: all excludes hidden, HIDDEN shows only hidden, category filter and sorts', async () => {
      const cat = await createCategory(owner, 'Cat');
      const pub = await seed(ownerId, { title: 'bravo', visibility: 'PUBLIC' });
      const priv = await seed(ownerId, { title: 'alpha' });
      const queued = await seed(ownerId, {
        title: 'charlie',
        status: 'QUEUED',
      });
      const rec = await seed(otherId, { title: 'delta' });
      await hold(rec, ownerId);
      const hid = await seed(otherId, { title: 'echo' });
      await hold(hid, ownerId, 'SHARE');
      await owner
        .patch(`/api/videos/${hid}/holding`)
        .send({ hidden: true })
        .expect(200);
      await owner
        .patch(`/api/videos/${priv}/holding`)
        .send({ categoryId: cat })
        .expect(200);

      const list = (q = '') =>
        owner.get(`/api/users/owner/collection${q}`).expect(200);
      const all = (await list()).body;
      expect(all.mode).toBe('OWNER');
      expect(all.sort).toBe('added');
      expect(titles(all)).toEqual(['delta', 'charlie', 'alpha', 'bravo']);
      expect(titles((await list('?section=HIDDEN')).body)).toEqual(['echo']);
      expect(titles((await list('?section=PUBLIC')).body)).toEqual(['bravo']);
      expect(titles((await list('?section=PRIVATE')).body)).toEqual([
        'charlie',
        'alpha',
      ]);
      expect(titles((await list('?section=OTHERS')).body)).toEqual(['delta']);
      expect(titles((await list(`?categoryId=${cat}`)).body)).toEqual([
        'alpha',
      ]);
      expect(titles((await list('?categoryId=none')).body)).toEqual([
        'delta',
        'charlie',
        'bravo',
      ]);
      expect(titles((await list('?sort=title')).body)).toEqual([
        'alpha',
        'bravo',
        'charlie',
        'delta',
      ]);
      await list('?categoryId=not-a-uuid')
        .then((r) => r)
        .catch(() => undefined);
      await owner.get('/api/users/owner/collection?categoryId=zzz').expect(400);

      const summary = (
        await owner.get('/api/users/owner/collection/summary').expect(200)
      ).body;
      expect(summary).toMatchObject({
        all: 4,
        public: 1,
        private: 2,
        others: 1,
        hidden: 1,
        uncategorized: 3,
      });
      expect(summary.categories).toEqual([
        expect.objectContaining({ id: cat, name: 'Cat', count: 1 }),
      ]);
      void pub;
      void queued;
    });

    it('manual order moves the dragged videos into their slots and persists across folders', async () => {
      const ids: string[] = [];
      for (const t of ['one', 'two', 'three', 'four'])
        ids.push(await seed(ownerId, { title: t }));
      const list = (q = '') =>
        owner.get(`/api/users/owner/collection${q}`).expect(200);
      // Default manual order = newest first (all positions 0).
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'four',
        'three',
        'two',
        'one',
      ]);

      // Move "one" before "three" by sending the subset [one, three] in the wanted order.
      await owner
        .put('/api/me/collection/order')
        .send({ videoIds: [ids[0]!, ids[2]!] })
        .expect(200);
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'four',
        'one',
        'two',
        'three',
      ]);

      // The full list in a new order.
      await owner
        .put('/api/me/collection/order')
        .send({ videoIds: [ids[1]!, ids[0]!, ids[3]!, ids[2]!] })
        .expect(200);
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'two',
        'one',
        'four',
        'three',
      ]);

      // A new video appears first until it is placed.
      await seed(ownerId, { title: 'five' });
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'five',
        'two',
        'one',
        'four',
        'three',
      ]);
      // The owner's default sort follows the page setting.
      await owner.put('/api/me/page').send({ sort: 'manual' }).expect(200);
      expect((await list()).body.sort).toBe('manual');
      // Unknown ids are ignored, foreign videos cannot be ordered into my list.
      const foreign = await seed(otherId, { title: 'foreign' });
      await owner
        .put('/api/me/collection/order')
        .send({ videoIds: [foreign, ids[2]!] })
        .expect(200);
      expect(titles((await list()).body)).toEqual([
        'five',
        'two',
        'one',
        'four',
        'three',
      ]);
    });

    it('a drag moves next to its anchor on the whole shelf; under another sort the shelf adopts it', async () => {
      const ids = new Map<string, string>();
      for (const t of ['delta', 'alpha', 'echo', 'charlie', 'bravo'])
        ids.set(t, await seed(ownerId, { title: t }));
      const list = (q: string) =>
        owner.get(`/api/users/owner/collection${q}`).expect(200);
      // Shown by title, "echo" dropped before "bravo": the shelf takes the title order, then the move.
      await owner
        .post('/api/me/collection/order/move')
        .send({
          videoIds: [ids.get('echo')!],
          anchorId: ids.get('bravo')!,
          side: 'before',
          adopt: 'title',
        })
        .expect(200);
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'alpha',
        'echo',
        'bravo',
        'charlie',
        'delta',
      ]);
      expect((await list('')).body.sort).toBe('manual');
      // Only the first two are "loaded" here: the move still happens on the whole order.
      await owner
        .post('/api/me/collection/order/move')
        .send({
          videoIds: [ids.get('alpha')!],
          anchorId: ids.get('delta')!,
          side: 'after',
        })
        .expect(200);
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'echo',
        'bravo',
        'charlie',
        'delta',
        'alpha',
      ]);
      // A whole stack moves by its id, loaded members or not.
      const stack = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [ids.get('bravo')!, ids.get('charlie')!] })
          .expect(201)
      ).body;
      await owner
        .post('/api/me/collection/order/move')
        .send({
          videoIds: [ids.get('bravo')!],
          stackIds: [stack.id],
          anchorId: ids.get('alpha')!,
          side: 'after',
        })
        .expect(200);
      expect(titles((await list('?sort=manual')).body)).toEqual([
        'echo',
        'delta',
        'alpha',
        'bravo',
        'charlie',
      ]);
    });

    it('a drag on a very large shelf (one array parameter)', async () => {
      // Two parameters per row used to exceed Postgres' 65535 at 32,768 holdings: every drag failed.
      await prisma.$executeRaw`
        WITH v AS (
          INSERT INTO "Video" (id, "authorId", title, visibility, status, progress, "originalKey",
            "originalFilename", "sizeBytes", "durationSec", width, height, "createdAt", "updatedAt", "readyAt")
          SELECT gen_random_uuid(), ${ownerId}::uuid, 'bulk ' || lpad(g::text, 5, '0'), 'PRIVATE', 'READY', 100,
            'seeded/none', 'seeded.mp4', 1, 1, 640, 360, now() - (g || ' seconds')::interval, now(), now()
          FROM generate_series(1, 30000) g RETURNING id, "createdAt")
        INSERT INTO "VideoAccess" (id, "videoId", "holderId", source, "createdAt")
        SELECT gen_random_uuid(), v.id, ${ownerId}::uuid, 'AUTHOR', v."createdAt" FROM v`;
      const ends = await prisma.video.findMany({
        where: {
          authorId: ownerId,
          title: { in: ['bulk 00001', 'bulk 30000'] },
        },
        select: { id: true, title: true },
      });
      const id = (t: string) => ends.find((v) => v.title === t)!.id;
      await owner
        .post('/api/me/collection/order/move')
        .send({
          videoIds: [id('bulk 30000')],
          anchorId: id('bulk 00001'),
          side: 'before',
        })
        .expect(200);
      const first = await owner
        .get('/api/users/owner/collection?sort=manual&limit=2')
        .expect(200);
      expect(titles(first.body)).toEqual(['bulk 30000', 'bulk 00001']);

      // Numbered with room between by then: the next drag writes the moved video alone.
      const positions = async () =>
        new Map(
          (
            await prisma.videoAccess.findMany({
              where: { holderId: ownerId },
              select: { videoId: true, position: true },
            })
          ).map((h) => [h.videoId, h.position]),
        );
      const before = await positions();
      const second = (
        await prisma.video.findFirstOrThrow({
          where: { authorId: ownerId, title: 'bulk 00002' },
          select: { id: true },
        })
      ).id;
      await owner
        .post('/api/me/collection/order/move')
        .send({
          videoIds: [second],
          anchorId: id('bulk 30000'),
          side: 'before',
        })
        .expect(200);
      const after = await positions();
      expect(
        [...after].filter(([v, p]) => before.get(v) !== p).map(([v]) => v),
      ).toEqual([second]);
      const top = await owner
        .get('/api/users/owner/collection?sort=manual&limit=3')
        .expect(200);
      expect(titles(top.body)).toEqual([
        'bulk 00002',
        'bulk 30000',
        'bulk 00001',
      ]);
    }, 180_000); // 7 s here; a busy CI runner once took over a minute and failed the files after it

    it('a visitor’s summary counts only real stacks', async () => {
      const a = await seed(ownerId, { title: 'a', visibility: 'PUBLIC' });
      const b = await seed(ownerId, { title: 'b', visibility: 'PUBLIC' });
      await seed(ownerId, { title: 'c', visibility: 'PUBLIC' }); // on its own
      await seed(ownerId, { title: 'd' }); // private, on its own
      await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [a, b] })
        .expect(201);
      const summary = (
        await guest.get('/api/users/owner/collection/summary').expect(200)
      ).body;
      expect(summary).toMatchObject({ stacked: 2, stacks: 1 });
    });

    it('visitors: category filter across sections, hidden categories unlisted, owner sort applied', async () => {
      const cat = await createCategory(owner, 'Shown');
      const secret = await createCategory(owner, 'Secret');
      await owner
        .patch(`/api/me/categories/${secret}`)
        .send({ hidden: true })
        .expect(200);
      const pub = await seed(ownerId, { title: 'pub', visibility: 'PUBLIC' });
      const priv = await seed(ownerId, { title: 'priv' });
      const rec = await seed(otherId, { title: 'rec' });
      await hold(rec, ownerId);
      const inSecret = await seed(ownerId, {
        title: 'in secret',
        visibility: 'PUBLIC',
      });
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [pub, rec], categoryId: cat })
        .expect(200);
      await owner
        .patch(`/api/videos/${inSecret}/holding`)
        .send({ categoryId: secret })
        .expect(200);
      await owner
        .patch(`/api/videos/${priv}/holding`)
        .send({ categoryId: cat })
        .expect(200);
      await owner
        .put('/api/me/page')
        .send({ sort: 'title', layout: 'list' })
        .expect(200);

      const visitor = (
        await guest.get('/api/users/owner/collection').expect(200)
      ).body;
      expect(visitor.sort).toBe('title');
      expect(titles(visitor)).toEqual(['in secret', 'pub', 'priv', 'rec']);
      const filtered = (
        await guest
          .get(`/api/users/owner/collection?categoryId=${cat}`)
          .expect(200)
      ).body;
      expect(titles(filtered)).toEqual(['pub', 'priv', 'rec']);
      // Visitors cannot peek at hidden holdings through the folder.
      expect(
        (
          await guest
            .get('/api/users/owner/collection?section=HIDDEN')
            .expect(200)
        ).body.total,
      ).toBe(0);

      const summary = (
        await guest.get('/api/users/owner/collection/summary').expect(200)
      ).body;
      expect(summary).toMatchObject({
        all: 4,
        public: 2,
        private: 1,
        others: 1,
        hidden: 0,
      });
      expect(
        summary.categories.map((c: { name: string; count: number }) => [
          c.name,
          c.count,
        ]),
      ).toEqual([['Shown', 3]]);
      const profile = (await guest.get('/api/users/owner').expect(200)).body;
      expect(profile.pageSettings).toMatchObject({
        layout: 'list',
        tileSize: 'md',
        sort: 'title',
        showCover: false,
      });
    });
  });

  describe('received videos off my shelf', () => {
    it('only my copy goes: the video stays with its author, a stack left with one video dissolves, nothing is sent', async () => {
      const a = await seed(ownerId, { title: 'a' });
      const r1 = await seed(otherId, { title: 'r1' });
      const r2 = await seed(otherId, { title: 'r2', visibility: 'PUBLIC' });
      const elsewhere = await seed(otherId, { title: 'elsewhere' });
      await hold(r1, ownerId, 'EXCHANGE');
      await hold(r2, ownerId, 'PUBLIC_ADD');
      await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [a, r1] })
        .expect(201);
      const sent = await prisma.outboxEvent.count();

      const removed = (
        await owner
          .post('/api/me/collection/videos/remove')
          .send({ videoIds: [a, r1, r2, elsewhere] })
          .expect(200)
      ).body;
      // The own video is not removed here (deleting it is another action); a video I never held is not mine to remove.
      expect(removed.updated).toBe(2);
      expect(
        titles(
          (await owner.get('/api/users/owner/collection').expect(200)).body,
        ),
      ).toEqual(['a']);
      expect(await prisma.videoStack.count()).toBe(0);
      for (const id of [r1, r2]) {
        const v = await prisma.video.findUniqueOrThrow({
          where: { id },
          include: { holdings: true },
        });
        expect(v.deletedAt).toBeNull();
        expect(v.holdings.map((h) => [h.holderId, h.source])).toEqual([
          [otherId, 'AUTHOR'],
        ]);
      }
      expect(await prisma.outboxEvent.count()).toBe(sent);
      // Again: nothing left to remove.
      expect(
        (
          await owner
            .post('/api/me/collection/videos/remove')
            .send({ videoIds: [r1] })
            .expect(200)
        ).body.updated,
      ).toBe(0);
    });
  });

  describe('stacks', () => {
    const list = async (c: C = owner, query = 'sort=manual') =>
      (await c.get(`/api/users/owner/collection?${query}`).expect(200))
        .body as {
        items: {
          video: { title: string };
          categoryId: string | null;
          stack: { id: string; name: string | null; size: number } | null;
        }[];
      };
    const stackOf = (body: Awaited<ReturnType<typeof list>>, title: string) =>
      body.items.find((i) => i.video.title === title)!.stack;
    const categoryOf = (
      body: Awaited<ReturnType<typeof list>>,
      title: string,
    ) => body.items.find((i) => i.video.title === title)!.categoryId;
    const summary = async (c: C = owner) =>
      (await c.get('/api/users/owner/collection/summary').expect(200)).body;

    it('stacks videos where the first one sits, lists them with the stack and its size, names, takes out, dissolves', async () => {
      const a = await seed(ownerId, { title: 'A' });
      const b = await seed(ownerId, { title: 'B' });
      const c = await seed(ownerId, { title: 'C' });
      const d = await seed(ownerId, { title: 'D' });
      await owner
        .put('/api/me/collection/order')
        .send({ videoIds: [a, b, c, d] })
        .expect(200);

      // C with A dropped on it: the stack takes C's place, A's slot closes.
      const created = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [c, a] })
          .expect(201)
      ).body;
      expect(created).toMatchObject({ size: 2, name: null, categoryId: null });
      let body = await list();
      expect(titles(body)).toEqual(['B', 'C', 'A', 'D']);
      expect(stackOf(body, 'C')).toEqual({
        id: created.id,
        name: null,
        coverVideoId: null,
        size: 2,
      });
      expect(stackOf(body, 'A')!.id).toBe(created.id);
      expect(stackOf(body, 'B')).toBeNull();
      expect(await summary()).toMatchObject({ all: 4, stacked: 2, stacks: 1 });
      // The own stacks, for "Move to".
      expect(
        (await owner.get('/api/me/collection/stacks').expect(200)).body,
      ).toEqual([
        {
          id: created.id,
          name: null,
          coverVideoId: null,
          size: 2,
          categoryId: null,
        },
      ]);
      await client(app).get('/api/me/collection/stacks').expect(401);

      // Refusals: one video (twice over), a video that is not mine, a stack that is not mine.
      await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [a] })
        .expect(400);
      expect(
        (
          await owner
            .post('/api/me/collection/stacks')
            .send({ videoIds: [a, a] })
            .expect(400)
        ).body.code,
      ).toBe('stackTooSmall');
      const foreign = await seed(otherId, { title: 'F' });
      expect(
        (
          await owner
            .post('/api/me/collection/stacks')
            .send({ videoIds: [b, foreign] })
            .expect(404)
        ).body.code,
      ).toBe('videoNotFound');
      expect(
        (
          await owner
            .post(`/api/me/collection/stacks/${foreign}/videos`)
            .send({ videoIds: [b] })
            .expect(404)
        ).body.code,
      ).toBe('stackNotFound');
      await other
        .post(`/api/me/collection/stacks/${created.id}/videos`)
        .send({ videoIds: [foreign] })
        .expect(404);
      await other.delete(`/api/me/collection/stacks/${created.id}`).expect(404);

      // Added videos line up behind the stack; stacking with a stacked video joins its stack.
      await owner
        .post(`/api/me/collection/stacks/${created.id}/videos`)
        .send({ videoIds: [b] })
        .expect(200);
      body = await list();
      expect(titles(body)).toEqual(['C', 'A', 'B', 'D']);
      const joined = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [d, b] })
          .expect(201)
      ).body;
      expect(joined).toMatchObject({ id: created.id, size: 4 });
      body = await list();
      expect(titles(body)).toEqual(['C', 'A', 'B', 'D']);
      expect(body.items.every((i) => i.stack?.id === created.id)).toBe(true);
      expect(
        titles(await list(owner, `sort=manual&stackId=${created.id}`)),
      ).toEqual(['C', 'A', 'B', 'D']);
      expect(await summary()).toMatchObject({ all: 4, stacked: 4, stacks: 1 });

      // A cover: one of the stack's videos; a stranger is refused; it is forgotten
      // once that video leaves the stack.
      expect(
        (
          await owner
            .patch(`/api/me/collection/stacks/${created.id}`)
            .send({ coverVideoId: d })
            .expect(200)
        ).body.coverVideoId,
      ).toBe(d);
      expect(stackOf(await list(), 'C')).toMatchObject({ coverVideoId: d });
      await owner
        .patch(`/api/me/collection/stacks/${created.id}`)
        .send({ coverVideoId: foreign })
        .expect(404);
      await owner
        .post(`/api/me/collection/stacks/${created.id}/videos/remove`)
        .send({ videoIds: [d] })
        .expect(200);
      expect(stackOf(await list(), 'C')).toMatchObject({
        coverVideoId: null,
        size: 3,
      });
      await owner
        .post(`/api/me/collection/stacks/${created.id}/videos`)
        .send({ videoIds: [d] })
        .expect(200);

      // A name, trimmed; empty clears it.
      expect(
        (
          await owner
            .patch(`/api/me/collection/stacks/${created.id}`)
            .send({ name: '  Summer  ' })
            .expect(200)
        ).body.name,
      ).toBe('Summer');
      expect(stackOf(await list(), 'C')!.name).toBe('Summer');
      expect(
        (
          await owner
            .patch(`/api/me/collection/stacks/${created.id}`)
            .send({ name: '' })
            .expect(200)
        ).body.name,
      ).toBeNull();

      // Taking out: two leave, two stay; one more leaves and the stack is dissolved. Positions stay.
      expect(
        (
          await owner
            .post(`/api/me/collection/stacks/${created.id}/videos/remove`)
            .send({ videoIds: [a, b] })
            .expect(200)
        ).body,
      ).toEqual({ size: 2, dissolved: false });
      expect(
        (
          await owner
            .post(`/api/me/collection/stacks/${created.id}/videos/remove`)
            .send({ videoIds: [d] })
            .expect(200)
        ).body,
      ).toEqual({ size: 0, dissolved: true });
      body = await list();
      expect(body.items.every((i) => i.stack === null)).toBe(true);
      expect(titles(body)).toEqual(['C', 'A', 'B', 'D']);
      await owner.delete(`/api/me/collection/stacks/${created.id}`).expect(404);

      const again = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [a, b, c], name: 'Trio' })
          .expect(201)
      ).body;
      expect(again).toMatchObject({ size: 3, name: 'Trio' });
      await owner.delete(`/api/me/collection/stacks/${again.id}`).expect(200);
      expect((await list()).items.every((i) => i.stack === null)).toBe(true);
      expect(await summary()).toMatchObject({ stacked: 0, stacks: 0 });
    });

    it('a page holding only some videos of a stack carries its first four pictures', async () => {
      const ids: string[] = [];
      for (const title of [
        'P1',
        'Q1',
        'P2',
        'Q2',
        'P3',
        'Q3',
        'P4',
        'Q4',
        'P5',
      ])
        ids.push(await seed(ownerId, { title }));
      const members = ids.filter((_, i) => i % 2 === 0);
      const stack = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: members })
          .expect(201)
      ).body;
      type Row = {
        video: { title: string };
        stack: { id: string; size: number; peek?: { title: string }[] } | null;
      };
      // Newest first, two a page: the stack's videos are spread over the pages.
      const page = (
        await owner
          .get('/api/users/owner/collection?sort=added&limit=2')
          .expect(200)
      ).body.items as Row[];
      expect(page.map((i) => i.video.title)).toEqual(['P5', 'Q4']);
      expect(page[0]!.stack).toMatchObject({ id: stack.id, size: 5 });
      expect(page[0]!.stack!.peek!.map((v) => v.title)).toEqual([
        'P5',
        'P4',
        'P3',
        'P2',
      ]);
      // The pictures follow the shelf's order, the one the open stack shows: by title here.
      const byTitle = (
        await owner
          .get('/api/users/owner/collection?sort=title&limit=2')
          .expect(200)
      ).body.items as Row[];
      expect(byTitle.map((i) => i.video.title)).toEqual(['P1', 'P2']);
      expect(byTitle[0]!.stack!.peek!.map((v) => v.title)).toEqual([
        'P1',
        'P2',
        'P3',
        'P4',
      ]);
      // The cover comes first.
      await owner
        .patch(`/api/me/collection/stacks/${stack.id}`)
        .send({ coverVideoId: members[0] })
        .expect(200);
      const again = (
        await owner
          .get('/api/users/owner/collection?sort=added&limit=2')
          .expect(200)
      ).body.items as Row[];
      expect(again[0]!.stack!.peek!.map((v) => v.title)).toEqual([
        'P1',
        'P5',
        'P4',
        'P3',
      ]);
      // A page that holds enough of it has nothing to add.
      const all = (
        await owner.get('/api/users/owner/collection?sort=added').expect(200)
      ).body.items as Row[];
      expect(all.every((i) => !i.stack?.peek)).toBe(true);
    });

    it('a stack keeps one category: a mix is refused unless one is chosen; a video changing category alone leaves, a whole stack moves', async () => {
      const trips = await createCategory(owner, 'Trips');
      const work = await createCategory(owner, 'Work');
      const theirs = await createCategory(other, 'Theirs');
      const a = await seed(ownerId, { title: 'A' });
      const b = await seed(ownerId, { title: 'B' });
      const c = await seed(ownerId, { title: 'C' });
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [a], categoryId: trips })
        .expect(200);

      const refused = await owner
        .post('/api/me/collection/stacks')
        .send({ videoIds: [b, a] })
        .expect(409);
      expect(refused.body.code).toBe('stackCategories');
      expect(new Set(refused.body.details?.categories)).toEqual(
        new Set([null, trips]),
      );
      // The chosen category files every video of the stack.
      const stack = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [b, a], categoryId: trips })
          .expect(201)
      ).body;
      expect(stack.categoryId).toBe(trips);
      let body = await list();
      expect([categoryOf(body, 'A'), categoryOf(body, 'B')]).toEqual([
        trips,
        trips,
      ]);

      // Joining: a mix is refused, someone else's category too, the stack's own category works.
      await owner
        .post(`/api/me/collection/stacks/${stack.id}/videos`)
        .send({ videoIds: [c] })
        .expect(409);
      await owner
        .post(`/api/me/collection/stacks/${stack.id}/videos`)
        .send({ videoIds: [c], categoryId: theirs })
        .expect(404);
      await owner
        .post(`/api/me/collection/stacks/${stack.id}/videos`)
        .send({ videoIds: [c], categoryId: trips })
        .expect(200);
      body = await list();
      expect(categoryOf(body, 'C')).toBe(trips);
      expect(stackOf(body, 'C')).toMatchObject({ id: stack.id, size: 3 });

      // One video moved to another category leaves the stack; the two others stay.
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [c], categoryId: work })
        .expect(200);
      body = await list();
      expect(stackOf(body, 'C')).toBeNull();
      expect(stackOf(body, 'A')).toMatchObject({ id: stack.id, size: 2 });
      // The whole stack moves together.
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [a, b], categoryId: work })
        .expect(200);
      body = await list();
      expect(stackOf(body, 'A')).toMatchObject({ id: stack.id, size: 2 });
      expect([categoryOf(body, 'A'), categoryOf(body, 'B')]).toEqual([
        work,
        work,
      ]);
      // Through the single-video route too; a stack of two left with one is dissolved.
      await owner
        .patch(`/api/videos/${a}/holding`)
        .send({ categoryId: trips })
        .expect(200);
      body = await list();
      expect(body.items.every((i) => i.stack === null)).toBe(true);

      // Deleting a category leaves its stack whole, now without a category.
      const pair = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [b, c], categoryId: work })
          .expect(201)
      ).body;
      await owner.delete(`/api/me/categories/${work}`).expect(200);
      body = await list();
      expect(stackOf(body, 'B')).toMatchObject({ id: pair.id, size: 2 });
      expect([categoryOf(body, 'B'), categoryOf(body, 'C')]).toEqual([
        null,
        null,
      ]);
    });

    it('visitors meet a stack through the videos they may see, once per section; a stack of one visible video is a plain tile', async () => {
      const p1 = await seed(ownerId, { title: 'P1', visibility: 'PUBLIC' });
      const p2 = await seed(ownerId, { title: 'P2', visibility: 'PUBLIC' });
      const p3 = await seed(ownerId, { title: 'P3', visibility: 'PUBLIC' });
      const v = await seed(ownerId, { title: 'V' });
      const q = await seed(ownerId, {
        title: 'Q',
        visibility: 'PUBLIC',
        status: 'QUEUED',
      });
      const stackA = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [p1, v, p2] })
          .expect(201)
      ).body;
      const stackB = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [q, p3] })
          .expect(201)
      ).body;

      // The owner: every video of a stack counts.
      let body = await list();
      expect(stackOf(body, 'V')).toMatchObject({ id: stackA.id, size: 3 });
      expect(stackOf(body, 'P3')).toMatchObject({ id: stackB.id, size: 2 });
      expect(await summary()).toMatchObject({ all: 5, stacked: 5, stacks: 2 });

      // A guest (newest first): the public section holds P2+P1 of stack A and P3 alone (Q is not
      // ready); the private one holds V alone.
      body = await list(guest, '');
      expect(titles(body)).toEqual(['P3', 'P2', 'P1', 'V']);
      expect(stackOf(body, 'P1')).toEqual({
        id: stackA.id,
        name: null,
        coverVideoId: null,
        size: 2,
      });
      expect(stackOf(body, 'P3')).toMatchObject({ id: stackB.id, size: 1 });
      expect(stackOf(body, 'V')).toMatchObject({ id: stackA.id, size: 1 });
      expect(titles(await list(guest, `stackId=${stackA.id}`))).toEqual([
        'P2',
        'P1',
        'V',
      ]);
      // 4 videos in 3 tiles: [P1 P2], P3, V.
      expect(await summary(guest)).toMatchObject({
        all: 4,
        stacked: 4,
        stacks: 3,
      });

      // The owner hides a received video of a stack: in "All" the stack is one video, a plain tile.
      const own = await seed(ownerId, { title: 'O' });
      const theirs = await seed(otherId, { title: 'T', visibility: 'PUBLIC' });
      await hold(theirs, ownerId);
      const stackC = (
        await owner
          .post('/api/me/collection/stacks')
          .send({ videoIds: [own, theirs] })
          .expect(201)
      ).body;
      await owner
        .patch('/api/me/collection/holdings')
        .send({ videoIds: [theirs], hidden: true })
        .expect(200);
      body = await list();
      expect(stackOf(body, 'O')).toMatchObject({ id: stackC.id, size: 1 });
      expect(stackOf(await list(owner, 'section=HIDDEN'), 'T')).toMatchObject({
        id: stackC.id,
        size: 1,
      });
    });
  });

  describe('page settings and profile images', () => {
    it('validates page settings and merges partial updates', async () => {
      expect(
        (await owner.get('/api/auth/me').expect(200)).body.pageSettings,
      ).toEqual({
        layout: 'grid',
        tileSize: 'md',
        sort: 'added',
        showCover: false,
        firstView: 'videos',
        grouping: 'visibility',
        categoryRows: 2,
        tileScale: 'md',
      });
      await owner.put('/api/me/page').send({ layout: 'table' }).expect(400);
      await owner.put('/api/me/page').send({ firstView: 'cards' }).expect(400);
      await owner.put('/api/me/page').send({ grouping: 'date' }).expect(400);
      await owner.put('/api/me/page').send({ categoryRows: 7 }).expect(400);
      await owner.put('/api/me/page').send({ tileScale: 'huge' }).expect(400);
      const me = (
        await owner
          .put('/api/me/page')
          .send({ tileSize: 'lg', showCover: true })
          .expect(200)
      ).body;
      expect(me.pageSettings).toEqual({
        layout: 'grid',
        tileSize: 'lg',
        sort: 'added',
        showCover: true,
        firstView: 'videos',
        grouping: 'visibility',
        categoryRows: 2,
        tileScale: 'md',
      });
      const next = (
        await owner
          .put('/api/me/page')
          .send({
            firstView: 'folders',
            grouping: 'category',
            categoryRows: 0,
            tileScale: 'sm',
          })
          .expect(200)
      ).body;
      expect(next.pageSettings).toMatchObject({
        tileSize: 'lg',
        firstView: 'folders',
        grouping: 'category',
        categoryRows: 0,
        tileScale: 'sm',
      });
      expect(
        (await guest.get('/api/users/owner').expect(200)).body.pageSettings,
      ).toMatchObject({ firstView: 'folders', grouping: 'category' });
    });

    it('stores a resized avatar and cover in the public bucket and removes the old file', async () => {
      const png = await sharp({
        create: { width: 900, height: 300, channels: 3, background: '#336699' },
      })
        .png()
        .toBuffer();
      const first = (
        await owner
          .put('/api/me/avatar')
          .attach('file', png, 'me.png')
          .expect(200)
      ).body;
      expect(first.avatarUrl).toMatch(
        /\/u\/[0-9a-f-]+\/avatar-[0-9a-f]{16}\.jpg$/,
      );
      const key1 = (
        await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })
      ).avatarKey!;
      const meta = await sharp(
        await storage.getBuffer('public', key1),
      ).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([
        512,
        512,
        'jpeg',
      ]);

      const second = (
        await owner
          .put('/api/me/avatar')
          .attach('file', png, 'me2.png')
          .expect(200)
      ).body;
      expect(second.avatarUrl).not.toBe(first.avatarUrl);
      expect(await storage.head('public', key1)).toBeNull();

      const cover = (
        await owner
          .put('/api/me/cover')
          .attach('file', png, 'cover.png')
          .expect(200)
      ).body;
      const coverKey = (
        await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })
      ).coverKey!;
      const coverMeta = await sharp(
        await storage.getBuffer('public', coverKey),
      ).metadata();
      expect([coverMeta.width, coverMeta.height]).toEqual([1600, 500]);
      expect(cover.coverUrl).toContain('/cover-');

      const profile = (await guest.get('/api/users/owner').expect(200)).body;
      expect(profile.avatarUrl).toBe(second.avatarUrl);
      expect(profile.coverUrl).toBe(cover.coverUrl);

      // Not an image, no file, too large.
      const bad = await owner
        .put('/api/me/avatar')
        .attach('file', Buffer.from('hello'), 'x.png')
        .expect(400);
      expect(bad.body.code).toBe('invalidImage');
      await owner.put('/api/me/avatar').expect(400);
      await owner
        .put('/api/me/avatar')
        .attach('file', Buffer.alloc(6 * 1024 * 1024), 'big.png')
        .expect(413);

      const cleared = (await owner.delete('/api/me/avatar').expect(200)).body;
      expect(cleared.avatarUrl).toBeNull();
      expect(
        await storage.head(
          'public',
          second.avatarUrl.split('/').slice(-3).join('/'),
        ),
      ).toBeNull();
    });
  });
});

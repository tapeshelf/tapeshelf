import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { BlocklistService } from '../src/modules/blocklist/blocklist.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';
import { TrashService } from '../src/modules/trash/trash.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

/** A Free shelf's room, as the plan says: the tests fill it up to a few MiB. */
const FREE_SHELF = BigInt(SETTING_DEFAULTS.tiers.BASIC.storageQuotaBytes);

type C = ReturnType<typeof client>;
const DAY = 24 * 3600 * 1000;
const MiB = 1024 * 1024;

/**
 * the owner's trash with restore, leaving it (time over,
 * deleted from there, emptied, account blocked or gone) without erasing anything, the admin trash,
 * an admin removal with its statement of reasons and the blocklist, the hash backfill, and the
 * retention sweep.
 */
describe('trash, removals and retention (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let relay: OutboxRelayService;
  let admin: C, ann: C, bob: C;
  let adminId: string, annId: string, bobId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    relay = app.get(OutboxRelayService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = client(app);
    ann = client(app);
    bob = client(app);
    adminId = await signUp(app, admin, {
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
  });

  afterAll(async () => {
    await app.close();
  });

  /** A READY video of ann's with a real original in storage; bob holds it by exchange. */
  async function seed(title: string, bytes = randomBytes(64 * 1024)) {
    const v = await prisma.video.create({
      data: {
        authorId: annId,
        title,
        visibility: 'PRIVATE',
        status: 'READY',
        originalKey: 'pending',
        originalFilename: `${title}.mp4`,
        sizeBytes: BigInt(bytes.length),
        holdings: {
          create: [
            { holderId: annId, source: 'AUTHOR' },
            { holderId: bobId, source: 'EXCHANGE' },
          ],
        },
      },
    });
    const originalKey = `videos/${v.id}/original.mp4`;
    await storage.put('private', {
      key: originalKey,
      body: bytes,
      contentType: 'video/mp4',
    });
    await prisma.user.update({
      where: { id: annId },
      data: { storageUsedBytes: { increment: BigInt(bytes.length) } },
    });
    return prisma.video.update({ where: { id: v.id }, data: { originalKey } });
  }

  const notes = async (c: C) => {
    await relay.drain();
    return (await c.get('/api/notifications').expect(200)).body.items as {
      type: string;
      payload: Record<string, unknown>;
    }[];
  };
  const used = async () =>
    (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
      .storageUsedBytes;

  it('the owner sees their deletions with the day they go and brings one back', async () => {
    const v = await seed('Lake');
    await ann.delete(`/api/videos/${v.id}`).expect(200);
    expect(await used()).toBe(0n);
    const trash = (await ann.get('/api/me/trash').expect(200)).body;
    expect(trash.retentionDays).toBe(7);
    expect(trash.items).toHaveLength(1);
    const item = trash.items[0];
    expect(item.video).toMatchObject({ id: v.id, title: 'Lake' });
    expect(
      new Date(item.purgeAt).getTime() - new Date(item.deletedAt).getTime(),
    ).toBe(7 * DAY);
    expect(
      (await ann.get('/api/users/ann/collection/summary').expect(200)).body
        .trash,
    ).toBe(1);
    // Nobody else's trash.
    expect((await bob.get('/api/me/trash').expect(200)).body.items).toEqual([]);
    await bob.post(`/api/me/trash/${v.id}/restore`).expect(404);

    await ann.post(`/api/me/trash/${v.id}/restore`).expect(200);
    expect(await used()).toBe(BigInt(64 * 1024));
    expect((await ann.get('/api/me/trash').expect(200)).body.items).toEqual([]);
    // Back on bob's shelf too.
    await bob.post(`/api/videos/${v.id}/playback`).expect(200);
  });

  it('a restore needs room on the shelf', async () => {
    const v = await seed('Big', randomBytes(2 * MiB));
    await ann.delete(`/api/videos/${v.id}`).expect(200);
    await prisma.user.update({
      where: { id: annId },
      data: { storageUsedBytes: FREE_SHELF - BigInt(MiB) },
    });
    const res = await ann.post(`/api/me/trash/${v.id}/restore`).expect(400);
    expect(res.body.code).toBe('quotaExceeded');
  });

  it('two restores at once take the room one at a time: room for one, one comes back', async () => {
    const a = await seed('One', randomBytes(2 * MiB));
    const b = await seed('Two', randomBytes(2 * MiB));
    await ann.delete(`/api/videos/${a.id}`).expect(200);
    await ann.delete(`/api/videos/${b.id}`).expect(200);
    await prisma.user.update({
      where: { id: annId },
      data: {
        storageUsedBytes: FREE_SHELF - BigInt(3 * MiB),
      },
    });
    const answers = await Promise.all(
      [a, b].map((v) => ann.post(`/api/me/trash/${v.id}/restore`)),
    );
    expect(answers.map((r) => r.status).sort((x, y) => x - y)).toEqual([
      200, 400,
    ]);
    expect(await used()).toBe(FREE_SHELF - BigInt(3 * MiB) + BigInt(2 * MiB));
  });

  it('time over: a video leaves the trash after the plan’s days (Free 7, Pro 30) and nothing is erased', async () => {
    const free = await seed('Free one');
    await ann.delete(`/api/videos/${free.id}`).expect(200);
    const trash = app.get(TrashService);
    expect(await trash.sweep(new Date(Date.now() + 6 * DAY))).toBe(0);
    expect(await trash.sweep(new Date(Date.now() + 8 * DAY))).toBe(1);
    const gone = await prisma.video.findUniqueOrThrow({
      where: { id: free.id },
    });
    expect(gone).toMatchObject({ trashExit: 'EXPIRED', purgedAt: null });
    expect(gone.trashExitAt).not.toBeNull();
    // Out of the author's trash, the files untouched, nothing in the audit log.
    expect((await ann.get('/api/me/trash').expect(200)).body.items).toEqual([]);
    await ann.post(`/api/me/trash/${free.id}/restore`).expect(404);
    expect(await storage.listKeys('private', `videos/${free.id}/`)).not.toEqual(
      [],
    );
    expect(
      await prisma.auditLog.count({ where: { action: 'video.purge' } }),
    ).toBe(0);
    expect(await trash.sweep(new Date(Date.now() + 400 * DAY))).toBe(0);

    await prisma.user.update({
      where: { id: annId },
      data: { tier: 'PREMIUM' },
    });
    const kept = await seed('Pro own');
    const removed = await seed('Pro removed');
    await ann.delete(`/api/videos/${kept.id}`).expect(200);
    await admin
      .post(`/api/admin/videos/${removed.id}/delete`)
      .send({ rule: 'SPAM' })
      .expect(200);
    // Removed by an admin: past the author's trash from the start.
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: removed.id } }),
    ).toMatchObject({ trashExit: 'ADMIN', purgedAt: null });
    expect(
      (await ann.get('/api/me/trash').expect(200)).body.retentionDays,
    ).toBe(30);
    expect(await trash.sweep(new Date(Date.now() + 29 * DAY))).toBe(0);
    expect(await trash.sweep(new Date(Date.now() + 31 * DAY))).toBe(1);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: kept.id } }),
    ).toMatchObject({ trashExit: 'EXPIRED', purgedAt: null });
  });

  it('the author deletes from the trash or empties it: no restore any more, files kept', async () => {
    const one = await seed('One');
    const two = await seed('Two');
    const three = await seed('Three');
    const other = await seed('Not deleted');
    for (const v of [one, two, three])
      await ann.delete(`/api/videos/${v.id}`).expect(200);

    // Someone else's ids and live videos are not touched.
    expect(
      (
        await bob
          .post('/api/me/trash/remove')
          .send({ videoIds: [one.id] })
          .expect(200)
      ).body,
    ).toEqual({ updated: 0 });
    expect(
      (
        await ann
          .post('/api/me/trash/remove')
          .send({ videoIds: [one.id, other.id] })
          .expect(200)
      ).body,
    ).toEqual({ updated: 1 });
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: one.id } }),
    ).toMatchObject({ trashExit: 'REMOVED', purgedAt: null });
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: other.id } }),
    ).toMatchObject({ deletedAt: null, trashExit: null });
    await ann.post(`/api/me/trash/${one.id}/restore`).expect(404);
    const left = (await ann.get('/api/me/trash').expect(200)).body.items as {
      video: { id: string };
    }[];
    expect(left.map((i) => i.video.id).sort()).toEqual(
      [two.id, three.id].sort(),
    );
    expect(
      (await ann.get('/api/users/ann/collection/summary').expect(200)).body
        .trash,
    ).toBe(2);

    expect((await ann.post('/api/me/trash/empty').expect(200)).body).toEqual({
      updated: 2,
    });
    expect((await ann.get('/api/me/trash').expect(200)).body.items).toEqual([]);
    expect(
      (await ann.get('/api/users/ann/collection/summary').expect(200)).body
        .trash,
    ).toBe(0);
    const rows = await prisma.video.findMany({
      where: { id: { in: [two.id, three.id] } },
    });
    expect(rows.map((r) => r.trashExit)).toEqual(['EMPTIED', 'EMPTIED']);
    for (const v of [one, two, three])
      expect(await storage.listKeys('private', `videos/${v.id}/`)).not.toEqual(
        [],
      );
    await client(app).post('/api/me/trash/empty').expect(401);
  });

  it('a blocked or deleted account’s trash goes to the admin; what left a trash is lost to its holders', async () => {
    const banned = await seed('Before the ban');
    await ann.delete(`/api/videos/${banned.id}`).expect(200);
    await admin
      .post(`/api/admin/users/${annId}/ban`)
      .send({ reason: 'spam' })
      .expect(200);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: banned.id } }),
    ).toMatchObject({ trashExit: 'BANNED', purgedAt: null });
    await bob.get(`/api/users/boss/videos/${banned.id}`).expect(404);
    expect(
      (await bob.get('/api/users/boss/collection').expect(200)).body.items,
    ).toEqual([]);
    // Bob's copy is hidden as for any deleted video.
    expect(
      (await bob.get('/api/users/bob/collection').expect(200)).body.items,
    ).toEqual([]);

    // Brought back by the admin: the author has it again, bob does not.
    await admin
      .post('/api/admin/trash/restore')
      .send({ videoIds: [banned.id] })
      .expect(200);
    const holders = await prisma.videoAccess.findMany({
      where: { videoId: banned.id },
      select: { holderId: true, source: true },
    });
    expect(holders.map((h) => h.holderId)).toEqual([annId]);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: banned.id } }),
    ).toMatchObject({ deletedAt: null, trashExit: null, trashExitAt: null });

    await admin.post(`/api/admin/users/${annId}/unban`).expect(200);
    await ann
      .post('/api/auth/login')
      .send({ email: 'ann@example.com', password: 'secret123' })
      .expect(200);
    const trashed = await seed('In the trash');
    const live = await seed('Live');
    await ann.delete(`/api/videos/${trashed.id}`).expect(200);
    await admin
      .post(`/api/admin/users/${annId}/delete`)
      .send({ reason: 'asked' })
      .expect(200);
    const after = await prisma.video.findMany({
      where: { id: { in: [trashed.id, live.id] } },
      orderBy: { title: 'asc' },
      select: { title: true, deleteReason: true, trashExit: true },
    });
    expect(after).toEqual([
      {
        title: 'In the trash',
        deleteReason: 'USER',
        trashExit: 'ACCOUNT_DELETED',
      },
      {
        title: 'Live',
        deleteReason: 'ACCOUNT_DELETED',
        trashExit: 'ACCOUNT_DELETED',
      },
    ]);
  });

  it('the admin trash lists first what left the authors’ trash, then what they can still restore', async () => {
    const own = await seed('Still restorable');
    const emptied = await seed('Emptied');
    const removed = await seed('Removed by admin');
    await ann.delete(`/api/videos/${emptied.id}`).expect(200);
    await ann.post('/api/me/trash/empty').expect(200);
    await ann.delete(`/api/videos/${own.id}`).expect(200);
    await admin
      .post(`/api/admin/videos/${removed.id}/delete`)
      .send({ rule: 'SPAM' })
      .expect(200);
    const list = (await admin.get('/api/admin/trash').expect(200)).body;
    expect(list).toMatchObject({ total: 3, waiting: 2, inUserTrash: 1 });
    expect(
      list.items.map((i: { title: string; trashExit: string | null }) => [
        i.title,
        i.trashExit,
      ]),
    ).toEqual([
      ['Removed by admin', 'ADMIN'],
      ['Emptied', 'EMPTIED'],
      ['Still restorable', null],
    ]);
    const last = list.items[2];
    expect(
      new Date(last.restorableUntil).getTime() -
        new Date(last.deletedAt).getTime(),
    ).toBe(7 * DAY);
    expect(list.items[0].restorableUntil).toBeNull();
    const out = (await admin.get('/api/admin/trash?state=out').expect(200))
      .body;
    expect(out.items).toHaveLength(2);
    const user = (await admin.get('/api/admin/trash?state=user').expect(200))
      .body;
    expect(user.items.map((i: { id: string }) => i.id)).toEqual([own.id]);
    const byExit = (
      await admin.get('/api/admin/trash?exit=EMPTIED').expect(200)
    ).body;
    expect(byExit.items.map((i: { id: string }) => i.id)).toEqual([emptied.id]);
  });

  it('deleting one video several times at once frees its room once; two restores at once add it once', async () => {
    const v = await seed('Twice');
    const before = await used();
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => ann.delete(`/api/videos/${v.id}`)),
    );
    expect(answers.every((r) => r.status === 200 || r.status === 404)).toBe(
      true,
    );
    expect(await used()).toBe(before - v.sizeBytes);
    await Promise.all([
      admin.post('/api/admin/trash/restore').send({ videoIds: [v.id] }),
      admin.post('/api/admin/trash/restore').send({ videoIds: [v.id] }),
    ]);
    expect(await used()).toBe(before);
  });

  it('a video that cannot be erased now is skipped and does not hold up the others', async () => {
    const stuck = await seed('Stuck');
    const fine = await seed('Fine');
    await ann.delete(`/api/videos/${stuck.id}`).expect(200);
    await ann.delete(`/api/videos/${fine.id}`).expect(200);
    const purge = () =>
      admin
        .post('/api/admin/trash/purge')
        .send({ videoIds: [stuck.id, fine.id] })
        .expect(200);
    const original = storage.deletePrefix.bind(storage);
    const spy = vi
      .spyOn(storage, 'deletePrefix')
      .mockImplementation(async (kind, prefix) => {
        if (prefix.includes(stuck.id)) throw new Error('storage says no');
        return original(kind, prefix);
      });
    try {
      expect((await purge()).body).toMatchObject({
        done: 1,
        skipped: [stuck.id],
      });
    } finally {
      spy.mockRestore();
    }
    const rows = await prisma.video.findMany({
      where: { id: { in: [stuck.id, fine.id] } },
      select: { id: true, purgedAt: true },
    });
    expect(rows.find((r) => r.id === fine.id)!.purgedAt).not.toBeNull();
    // Back in the trash, not marked erased: the owner could still restore it, the next try erases it.
    expect(rows.find((r) => r.id === stuck.id)!.purgedAt).toBeNull();
    expect((await purge()).body).toMatchObject({ done: 1 });
    expect(await storage.listKeys('private', `videos/${stuck.id}/`)).toEqual(
      [],
    );
  });

  it('a file waiting for its blocklist hash whose original is already gone is erased anyway', async () => {
    const v = await seed('No original');
    await prisma.video.update({
      where: { id: v.id },
      data: { originalSha256: null },
    });
    await admin
      .post(`/api/admin/videos/${v.id}/delete`)
      .send({ rule: 'COPYRIGHT', blockFile: true })
      .expect(200);
    await prisma.video.update({
      where: { id: v.id },
      data: { originalSha256: null },
    });
    await storage.deleteObjects('private', [v.originalKey]);
    expect(
      (
        await admin
          .post('/api/admin/trash/purge')
          .send({ videoIds: [v.id] })
          .expect(200)
      ).body.done,
    ).toBe(1);
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: v.id } })).purgedAt,
    ).not.toBeNull();
  });

  it('an admin removal tells the author the rule and the words, others the usual; the file is blocked', async () => {
    const v = await seed('Clip');
    await admin.post(`/api/admin/videos/${v.id}/delete`).send({}).expect(400);
    const detail = (
      await admin
        .post(`/api/admin/videos/${v.id}/delete`)
        .send({
          rule: 'COPYRIGHT',
          message: 'The music is not yours.',
          blockFile: true,
        })
        .expect(200)
    ).body;
    expect(detail).toMatchObject({
      deleteReason: 'ADMIN',
      takedownRule: 'COPYRIGHT',
      takedownNote: 'The music is not yours.',
      blocked: true,
    });
    const annNotes = await notes(ann);
    expect(annNotes.map((n) => n.type)).toEqual(['VIDEO_TAKEN_DOWN']);
    expect(annNotes[0]!.payload).toEqual({
      videoId: v.id,
      title: 'Clip',
      rule: 'COPYRIGHT',
      message: 'The music is not yours.',
    });
    expect((await notes(bob)).map((n) => n.type)).toEqual(['VIDEO_REMOVED']);
    // Removed by an admin: not in the author's trash, no restore by the author.
    expect((await ann.get('/api/me/trash').expect(200)).body.items).toEqual([]);
    await ann.post(`/api/me/trash/${v.id}/restore`).expect(404);

    // The original had no hash yet: the block waits for the backfill.
    expect(
      await prisma.blockedFile.findUniqueOrThrow({ where: { videoId: v.id } }),
    ).toMatchObject({
      sha256: null,
      rule: 'COPYRIGHT',
      createdById: adminId,
    });
    expect(await app.get(BlocklistService).backfill()).toBe(1);
    const original = await storage.getBuffer('private', v.originalKey);
    const sum = createHash('sha256').update(original).digest('hex');
    expect(
      await prisma.blockedFile.findUniqueOrThrow({ where: { videoId: v.id } }),
    ).toMatchObject({
      sha256: sum,
    });
    expect(await app.get(BlocklistService).isBlocked(sum)).toBe(true);

    // Undone by an admin: back, and the file is allowed again.
    await admin
      .post('/api/admin/trash/restore')
      .send({ videoIds: [v.id] })
      .expect(200);
    expect(
      await prisma.video.findUniqueOrThrow({ where: { id: v.id } }),
    ).toMatchObject({
      deletedAt: null,
      takedownRule: null,
      takedownNote: null,
    });
    expect(await prisma.blockedFile.count()).toBe(0);
  });

  it('the daily sweep keeps records only as long as the privacy policy says', async () => {
    const v = await seed('Kept');
    const ago = (days: number) => new Date(Date.now() - days * DAY);
    await prisma.notification.createMany({
      data: [
        {
          userId: annId,
          type: 'ADMIN_NOTICE',
          payload: { message: 'old read' },
          readAt: ago(100),
          createdAt: ago(101),
        },
        {
          userId: annId,
          type: 'ADMIN_NOTICE',
          payload: { message: 'recent read' },
          readAt: ago(10),
          createdAt: ago(11),
        },
        {
          userId: annId,
          type: 'ADMIN_NOTICE',
          payload: { message: 'old unread' },
          createdAt: ago(400),
        },
        {
          userId: annId,
          type: 'ADMIN_NOTICE',
          payload: { message: 'unread' },
          createdAt: ago(200),
        },
      ],
    });
    await prisma.auditLog.createMany({
      data: [
        {
          actorId: adminId,
          action: 'user.notice',
          targetType: 'user',
          createdAt: ago(800),
        },
        {
          actorId: adminId,
          action: 'user.notice',
          targetType: 'user',
          createdAt: ago(100),
        },
      ],
    });
    await prisma.downloadEvent.createMany({
      data: [
        {
          userId: bobId,
          videoId: v.id,
          tier: 'BASIC',
          counted: true,
          startedAt: ago(400),
        },
        {
          userId: bobId,
          videoId: v.id,
          tier: 'BASIC',
          counted: true,
          startedAt: ago(20),
        },
      ],
    });
    await prisma.session.create({
      data: {
        userId: bobId,
        refreshTokenHash: 'old-revoked',
        expiresAt: ago(-300),
        revokedAt: ago(40),
      },
    });
    const sessionsBefore = await prisma.session.count();

    const counts = await app.get(RetentionService).sweep();
    expect(counts).toMatchObject({
      notifications: 2,
      auditLog: 1,
      downloads: 1,
      sessions: 1,
    });
    expect(
      (
        await prisma.notification.findMany({ orderBy: { createdAt: 'asc' } })
      ).map((n) => (n.payload as { message: string }).message),
    ).toEqual(['unread', 'recent read']);
    expect(await prisma.auditLog.count()).toBe(1);
    expect(await prisma.downloadEvent.count()).toBe(1);
    expect(await prisma.session.count()).toBe(sessionsBefore - 1);
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
interface Note {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * reports, the admin
 * API behind the ADMIN role, bans, account deletion (self and admin), the trash with a real purge
 * in S3, restore, reprocessing, live site settings, the audit log and the read-only "view as".
 */
describe('reports and admin (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let storage: StorageService;
  let queues: QueueService;
  let admin: C, ann: C, bob: C, guest: C;
  let adminId: string, annId: string, bobId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    storage = app.get(StorageService);
    queues = app.get(QueueService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = client(app);
    ann = client(app);
    bob = client(app);
    guest = client(app);
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

  async function seedVideo(
    authorId: string,
    title: string,
    opts: { status?: 'READY' | 'FAILED'; size?: bigint } = {},
  ) {
    const size = opts.size ?? 100n;
    const v = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PRIVATE',
        status: opts.status ?? 'READY',
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: size,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    await prisma.user.update({
      where: { id: authorId },
      data: { storageUsedBytes: { increment: size } },
    });
    return v.id;
  }
  const notes = async (c: C): Promise<Note[]> =>
    (await c.get('/api/notifications').expect(200)).body.items as Note[];
  const audit = async (action: string) =>
    prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  describe('access', () => {
    const routes: [string, string][] = [
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/i18n/en'],
      ['get', '/api/admin/settings'],
      ['put', '/api/admin/settings'],
      ['get', '/api/admin/audit'],
      ['get', '/api/admin/requests'],
      ['get', '/api/admin/users'],
      ['get', '/api/admin/users/00000000-0000-7000-8000-000000000000'],
      ['post', '/api/admin/users/00000000-0000-7000-8000-000000000000/ban'],
      ['post', '/api/admin/users/00000000-0000-7000-8000-000000000000/delete'],
      ['post', '/api/admin/users/00000000-0000-7000-8000-000000000000/view-as'],
      ['get', '/api/admin/videos'],
      ['post', '/api/admin/videos/00000000-0000-7000-8000-000000000000/delete'],
      [
        'post',
        '/api/admin/videos/00000000-0000-7000-8000-000000000000/reprocess',
      ],
      ['get', '/api/admin/trash'],
      ['post', '/api/admin/trash/purge'],
      ['post', '/api/admin/trash/restore'],
      ['get', '/api/admin/reports'],
      [
        'post',
        '/api/admin/reports/00000000-0000-7000-8000-000000000000/resolve',
      ],
      ['get', '/api/admin/support'],
      ['get', '/api/admin/support/00000000-0000-7000-8000-000000000000'],
      [
        'post',
        '/api/admin/support/00000000-0000-7000-8000-000000000000/messages',
      ],
      ['patch', '/api/admin/support/00000000-0000-7000-8000-000000000000'],
    ];

    it('every admin route: 401 for guests, 403 for users, open for admins', async () => {
      for (const [method, path] of routes) {
        const call = (c: C) =>
          (
            c as unknown as Record<
              string,
              (p: string) => import('supertest').Test
            >
          )[method]!(path).send({});
        expect((await call(guest)).status, `${method} ${path}`).toBe(401);
        expect((await call(ann)).status, `${method} ${path}`).toBe(403);
      }
      await admin.get('/api/admin/dashboard').expect(200);
    });

    it('the admin panel texts come from the API, to admins only', async () => {
      for (const lang of ['en', 'ru']) {
        const res = await admin.get(`/api/admin/i18n/${lang}`).expect(200);
        expect(res.headers['cache-control']).toBe('private, no-cache');
        expect(res.body).toHaveProperty('nav.users');
        expect(res.body).toHaveProperty('takedown.rule');
      }
      // Another language of the app gets the English panel; anything else is unknown.
      expect(
        (await admin.get('/api/admin/i18n/de').expect(200)).body,
      ).toHaveProperty('nav.users');
      await admin.get('/api/admin/i18n/ar').expect(404);
      await admin.get('/api/admin/i18n/toString').expect(404);
    });

    it('dashboard counts users, videos, trash and open work', async () => {
      await seedVideo(annId, 'a', { size: 1000n });
      const failed = await seedVideo(bobId, 'b', { status: 'FAILED' });
      void failed;
      await prisma.user.update({
        where: { id: bobId },
        data: { status: 'BANNED' },
      });
      const d = (await admin.get('/api/admin/dashboard').expect(200)).body;
      expect(d).toMatchObject({
        usersTotal: 3,
        usersActive: 2,
        usersBanned: 1,
        usersNew: 3,
        videosTotal: 2,
        videosReady: 1,
        videosFailed: 1,
        originalsBytes: 1100,
        trashCount: 0,
        openReports: 0,
      });
      expect(d.queues.map((q: { name: string }) => q.name)).toEqual(
        expect.arrayContaining(['remux', 'transcode', 'mail']),
      );
    });
  });

  describe('reports', () => {
    it('one open report per person and target; resolving deletes the video and tells every reporter', async () => {
      const v = await seedVideo(annId, 'Spam reel');
      await bob.post('/api/users/ann/follow').expect(200); // unrelated noise
      const first = (
        await bob
          .post('/api/reports')
          .send({
            targetType: 'VIDEO',
            targetId: v,
            reason: 'SPAM',
            comment: ' junk ',
          })
          .expect(200)
      ).body;
      expect(first.created).toBe(true);
      const again = (
        await bob
          .post('/api/reports')
          .send({ targetType: 'VIDEO', targetId: v, reason: 'OTHER' })
          .expect(200)
      ).body;
      expect(again).toEqual({ id: first.id, created: false });
      await ann
        .post('/api/reports')
        .send({ targetType: 'VIDEO', targetId: v, reason: 'SPAM' })
        .expect(400); // own video
      await admin
        .post('/api/reports')
        .send({ targetType: 'VIDEO', targetId: v, reason: 'ILLEGAL' })
        .expect(200);
      await bob
        .post('/api/reports')
        .send({ targetType: 'USER', targetId: annId, reason: 'ABUSE' })
        .expect(200);

      const queue = (
        await admin.get('/api/admin/reports?status=OPEN').expect(200)
      ).body;
      expect(queue.total).toBe(3);
      const videoReport = queue.items.find(
        (r: { id: string }) => r.id === first.id,
      );
      expect(videoReport).toMatchObject({
        targetType: 'VIDEO',
        comment: 'junk',
        openOnTarget: 2,
        reporter: { username: 'bob' },
        targetUser: { username: 'ann' },
        video: { id: v, title: 'Spam reel' },
      });

      const resolved = (
        await admin
          .post(`/api/admin/reports/${first.id}/resolve`)
          .send({ action: 'DELETE_VIDEO', note: 'clear spam' })
          .expect(200)
      ).body;
      expect(resolved).toMatchObject({
        status: 'RESOLVED',
        action: 'DELETE_VIDEO',
      });
      const video = await prisma.video.findUniqueOrThrow({ where: { id: v } });
      expect(video.deleteReason).toBe('ADMIN');
      expect(video.deletedById).toBe(adminId);
      // Both reports on the video closed; the profile report stays open.
      expect(
        (await prisma.report.findMany({ where: { status: 'OPEN' } })).map(
          (r) => r.targetType,
        ),
      ).toEqual(['USER']);
      await admin
        .post(`/api/admin/reports/${first.id}/resolve`)
        .send({ action: 'NONE' })
        .expect(409);
      await relay.drain();
      const bobNote = (await notes(bob)).find(
        (n) => n.type === 'REPORT_RESOLVED',
      );
      expect(bobNote?.payload).toMatchObject({
        outcome: 'actionTaken',
        targetType: 'VIDEO',
        title: 'Spam reel',
      });
      expect((await notes(admin)).map((n) => n.type)).toContain(
        'REPORT_RESOLVED',
      );
      // The author gets the reasons instead of the plain "removed"; the file is blocked.
      const annNotes = await notes(ann);
      expect(annNotes.map((n) => n.type)).not.toContain('VIDEO_REMOVED');
      expect(
        annNotes.find((n) => n.type === 'VIDEO_TAKEN_DOWN')?.payload,
      ).toEqual({
        videoId: v,
        title: 'Spam reel',
        rule: 'SPAM',
        message: null,
      });
      expect(video).toMatchObject({ takedownRule: 'SPAM', takedownNote: null });
      expect(await prisma.blockedFile.count({ where: { videoId: v } })).toBe(1);
      expect((await audit('report.resolve'))[0]!.meta).toMatchObject({
        decision: 'DELETE_VIDEO',
        reports: 2,
      });
    });

    it('dismissing tells the reporter nothing was wrong; DELETE_VIDEO does not fit a profile report', async () => {
      const r = (
        await bob
          .post('/api/reports')
          .send({ targetType: 'USER', targetId: annId, reason: 'ABUSE' })
          .expect(200)
      ).body;
      await bob
        .post('/api/reports')
        .send({ targetType: 'USER', targetId: bobId, reason: 'ABUSE' })
        .expect(400);
      await admin
        .post(`/api/admin/reports/${r.id}/resolve`)
        .send({ action: 'DELETE_VIDEO' })
        .expect(400);
      await admin
        .post(`/api/admin/reports/${r.id}/dismiss`)
        .send({})
        .expect(200);
      await relay.drain();
      expect((await notes(bob))[0]).toMatchObject({
        type: 'REPORT_RESOLVED',
        payload: { outcome: 'noViolation', targetType: 'USER' },
      });
      // A closed report does not block a new one.
      expect(
        (
          await bob
            .post('/api/reports')
            .send({ targetType: 'USER', targetId: annId, reason: 'SPAM' })
            .expect(200)
        ).body.created,
      ).toBe(true);
    });
  });

  describe('users', () => {
    it('search, role and tier changes are audited; an admin cannot demote themself', async () => {
      const list = (await admin.get('/api/admin/users?q=ANN').expect(200)).body;
      expect(list.items.map((u: { username: string }) => u.username)).toEqual([
        'ann',
      ]);
      await admin
        .patch(`/api/admin/users/${annId}`)
        .send({ tier: 'PREMIUM' })
        .expect(200);
      const card = (
        await admin
          .patch(`/api/admin/users/${annId}`)
          .send({ role: 'ADMIN' })
          .expect(200)
      ).body;
      expect(card).toMatchObject({
        role: 'ADMIN',
        tier: 'PREMIUM',
        hasPassword: true,
      });
      await admin
        .patch(`/api/admin/users/${adminId}`)
        .send({ role: 'USER' })
        .expect(400);
      expect((await audit('user.tier'))[0]!.meta).toMatchObject({
        from: 'BASIC',
        to: 'PREMIUM',
      });
      expect((await audit('user.role')).length).toBe(1);
      // Ann is an admin now (her role is read per request), but the panel waits for her
      // two-step sign-in.
      await ann
        .get('/api/admin/dashboard')
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('twoFactorRequired'));
      await makeAdmin(prisma, annId);
      await ann.get('/api/admin/dashboard').expect(200);
    });

    it('ban: sessions die, the page is gone, open requests close; unban brings the account back', async () => {
      const v = await seedVideo(annId, 'Lake');
      const req = (
        await bob
          .post('/api/exchange')
          .send({ holderUsername: 'ann', videoIds: [v] })
          .expect(201)
      ).body.request;
      await admin
        .post(`/api/admin/users/${adminId}/ban`)
        .send({ reason: 'x' })
        .expect(400);
      const card = (
        await admin
          .post(`/api/admin/users/${annId}/ban`)
          .send({ reason: 'spam' })
          .expect(200)
      ).body;
      expect(card).toMatchObject({
        status: 'BANNED',
        banReason: 'spam',
        sessions: [],
      });
      await ann.get('/api/auth/me').expect(401); // sessions revoked
      await guest.get('/api/users/ann').expect(404);
      await guest
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: 'ann@example.com', password: 'secret123' })
        .expect(403);
      expect(
        (await prisma.videoRequest.findUniqueOrThrow({ where: { id: req.id } }))
          .status,
      ).toBe('INVALIDATED');
      await relay.drain();
      expect((await notes(bob))[0]).toMatchObject({
        type: 'REQUEST_INVALIDATED',
        payload: { reason: 'accountClosed', title: 'Lake' },
      });

      await admin.post(`/api/admin/users/${annId}/unban`).expect(200);
      const again = client(app);
      await again
        .post('/api/auth/login')
        .send({ email: 'ann@example.com', password: 'secret123' })
        .expect(200);
      await guest.get('/api/users/ann').expect(200);
      expect((await audit('user.ban'))[0]!.meta).toMatchObject({
        reason: 'spam',
        closedRequests: 1,
      });
      expect((await audit('user.unban')).length).toBe(1);
    });

    it('another admin cannot be banned; a notice reaches the user', async () => {
      await makeAdmin(prisma, annId);
      await admin
        .post(`/api/admin/users/${annId}/ban`)
        .send({ reason: 'x' })
        .expect(409);
      await admin
        .post(`/api/admin/users/${bobId}/notice`)
        .send({ message: 'Please add descriptions.' })
        .expect(200);
      await relay.drain();
      expect((await notes(bob))[0]).toMatchObject({
        type: 'ADMIN_NOTICE',
        payload: { message: 'Please add descriptions.' },
      });
      await admin.post(`/api/admin/users/${bobId}/password-reset`).expect(200);
      expect(
        await prisma.emailToken.count({
          where: { userId: bobId, type: 'RESET_PASSWORD' },
        }),
      ).toBe(1);
    });
  });

  describe('account deletion', () => {
    it('self-service: tombstone, videos to the trash, holders told, chats keep a deleted partner', async () => {
      const lake = await seedVideo(annId, 'Lake', { size: 500n });
      await prisma.videoAccess.create({
        data: { videoId: lake, holderId: bobId, source: 'SHARE' },
      });
      const bobs = await seedVideo(bobId, 'Bob clip');
      await prisma.videoAccess.create({
        data: { videoId: bobs, holderId: annId, source: 'EXCHANGE' },
      });
      await ann.post('/api/users/bob/follow').expect(200);
      await bob.post('/api/users/ann/follow').expect(200);
      await ann
        .post('/api/conversations/with/bob/messages')
        .send({ body: 'hi' })
        .expect(201);
      const wanted = await seedVideo(bobId, 'Wanted');
      const open = (
        await ann
          .post('/api/exchange')
          .send({ holderUsername: 'bob', videoIds: [wanted] })
          .expect(201)
      ).body.request;

      await ann.delete('/api/me').send({ password: 'wrong123' }).expect(400);
      const res = await ann
        .delete('/api/me')
        .send({ password: 'secret123' })
        .expect(200);
      expect(String(res.headers['set-cookie'])).toContain('vs_access=;');
      await ann.get('/api/auth/me').expect(401);

      const tomb = await prisma.user.findUniqueOrThrow({
        where: { id: annId },
      });
      expect(tomb).toMatchObject({
        status: 'DELETED',
        email: null,
        passwordHash: null,
        displayName: '',
        username: 'ann',
        storageUsedBytes: 0n,
      });
      expect(await prisma.session.count({ where: { userId: annId } })).toBe(0);
      expect(await prisma.follow.count()).toBe(0);
      const trashed = await prisma.video.findUniqueOrThrow({
        where: { id: lake },
      });
      expect(trashed.deleteReason).toBe('ACCOUNT_DELETED');
      expect(
        await prisma.videoAccess.count({
          where: { holderId: annId, videoId: bobs },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.videoRequest.findUniqueOrThrow({
            where: { id: open.id },
          })
        ).status,
      ).toBe('INVALIDATED');
      await guest.get('/api/users/ann').expect(404);
      // The username stays reserved for good.
      await client(app)
        .post('/api/auth/register')
        .send({
          email: 'new@example.com',
          username: 'ann',
          password: 'secret123',
        })
        .expect(409);
      await relay.drain();
      expect((await notes(bob)).map((n) => n.type)).toEqual(
        expect.arrayContaining(['VIDEO_REMOVED', 'REQUEST_INVALIDATED']),
      );
      const convs = (await bob.get('/api/conversations').expect(200)).body;
      expect(convs.items[0].other).toMatchObject({
        deleted: true,
        displayName: '',
      });
      expect((await audit('user.delete'))[0]!.meta).toMatchObject({
        username: 'ann',
        self: true,
        videos: 1,
      });
      // The admin trash shows it, but it cannot come back: the author is gone.
      const restore = (
        await admin
          .post('/api/admin/trash/restore')
          .send({ videoIds: [lake] })
          .expect(200)
      ).body;
      expect(restore).toEqual({ done: 0, bytes: 0, skipped: [lake] });
    });

    it('by an admin, with a reason; never another admin or oneself', async () => {
      await seedVideo(bobId, 'Clip');
      await admin
        .post(`/api/admin/users/${adminId}/delete`)
        .send({})
        .expect(400);
      const card = (
        await admin
          .post(`/api/admin/users/${bobId}/delete`)
          .send({ reason: 'requested by email' })
          .expect(200)
      ).body;
      expect(card).toMatchObject({
        status: 'DELETED',
        email: null,
        videoCount: 0,
      });
      expect((await audit('user.delete'))[0]).toMatchObject({
        actorId: adminId,
        meta: expect.objectContaining({
          self: false,
          reason: 'requested by email',
        }),
      });
      const v = await prisma.video.findFirstOrThrow({
        where: { authorId: bobId },
      });
      expect(v).toMatchObject({
        deleteReason: 'ACCOUNT_DELETED',
        deletedById: adminId,
      });
    });
  });

  describe('videos and trash', () => {
    it('purge measures and erases every object of the video in S3; restore brings a video back', async () => {
      const gone = await seedVideo(annId, 'Gone', { size: 300n });
      const back = await seedVideo(annId, 'Back', { size: 200n });
      const keys = {
        private: [
          `videos/${gone}/original.mp4`,
          `videos/${gone}/hls/v1/seg-0.ts`,
        ],
        public: [`v/${gone}/abc/frame-0.jpg`, `v/${gone}/abc/sheet-1.jpg`],
      };
      await storage.put('private', {
        key: keys.private[0]!,
        body: Buffer.alloc(1000),
        contentType: 'application/octet-stream',
      });
      await storage.put('private', {
        key: keys.private[1]!,
        body: Buffer.alloc(200),
        contentType: 'application/octet-stream',
      });
      await storage.put('public', {
        key: keys.public[0]!,
        body: Buffer.alloc(30),
        contentType: 'application/octet-stream',
      });
      await storage.put('public', {
        key: keys.public[1]!,
        body: Buffer.alloc(20),
        contentType: 'application/octet-stream',
      });

      await admin
        .post(`/api/admin/videos/${gone}/delete`)
        .send({ rule: 'OTHER' })
        .expect(200);
      await ann.delete(`/api/videos/${back}`).expect(200);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
          .storageUsedBytes,
      ).toBe(0n);

      const trash = (await admin.get('/api/admin/trash').expect(200)).body;
      expect(trash.total).toBe(2);
      const g = trash.items.find((i: { id: string }) => i.id === gone);
      expect(g).toMatchObject({
        storedBytes: 1250,
        deleteReason: 'ADMIN',
        deletedBy: { username: 'boss' },
      });
      expect(
        trash.items.find((i: { id: string }) => i.id === back),
      ).toMatchObject({ deleteReason: 'USER', storedBytes: 0 });
      expect(trash.totalBytes).toBe(1250);

      // The admin can still play a trashed video to judge it; for its author it is gone.
      expect(
        (await admin.post(`/api/videos/${gone}/playback`).expect(200)).body
          .playlistUrl,
      ).toContain(`/api/stream/${gone}/master.m3u8`);
      await ann.post(`/api/videos/${gone}/playback`).expect(404);

      const purged = (
        await admin
          .post('/api/admin/trash/purge')
          .send({ videoIds: [gone, annId] })
          .expect(200)
      ).body;
      expect(purged).toEqual({ done: 1, bytes: 1250, skipped: [annId] });
      expect(await storage.listKeys('private', `videos/${gone}/`)).toEqual([]);
      expect(await storage.listKeys('public', `v/${gone}/`)).toEqual([]);
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: gone } }))
          .purgedAt,
      ).not.toBeNull();
      // Erased files leave nothing to play, for the admin too.
      await admin.post(`/api/videos/${gone}/playback`).expect(404);
      // Purged videos cannot come back; the other one can.
      const restored = (
        await admin
          .post('/api/admin/trash/restore')
          .send({ videoIds: [gone, back] })
          .expect(200)
      ).body;
      expect(restored).toEqual({ done: 1, bytes: 0, skipped: [gone] });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
          .storageUsedBytes,
      ).toBe(200n);
      await ann.get(`/api/videos/${back}`).expect(200);
      expect((await audit('video.purge'))[0]!.meta).toMatchObject({
        bytes: 1250,
      });
      expect((await audit('video.restore')).length).toBe(1);
      const list = (
        await admin.get('/api/admin/videos?scope=purged').expect(200)
      ).body;
      expect(list.items.map((i: { id: string }) => i.id)).toEqual([gone]);
    });

    it('detail shows everything; visibility change is audited; reprocess only failed videos', async () => {
      const ok = await seedVideo(annId, 'Fine');
      const bad = await seedVideo(annId, 'Broken', { status: 'FAILED' });
      await prisma.videoAccess.create({
        data: { videoId: ok, holderId: bobId, source: 'SHARE' },
      });
      const d = (await admin.get(`/api/admin/videos/${ok}`).expect(200)).body;
      expect(d).toMatchObject({
        title: 'Fine',
        holders: 1,
        author: { username: 'ann' },
        openReports: 0,
      });
      // The uploaded file's own metadata, kept before it was cleaned of it; older: null.
      expect(d.sourceMetadata).toBeNull();
      const kept = {
        entries: [
          { scope: 'format', key: 'location', value: '+55.7558+037.6173/' },
        ],
        removedStreams: [{ index: 2, type: 'data', codec: 'bin_data' }],
      };
      await prisma.video.update({
        where: { id: ok },
        data: { sourceMetadata: kept },
      });
      expect(
        (await admin.get(`/api/admin/videos/${ok}`).expect(200)).body
          .sourceMetadata,
      ).toEqual(kept);
      const marked = (
        await admin
          .patch(`/api/admin/videos/${ok}`)
          .send({ visibility: 'PUBLIC', sensitive: true })
          .expect(200)
      ).body;
      expect(marked.sensitive).toBe(true);
      expect((await audit('video.update'))[0]!.meta).toMatchObject({
        visibility: { from: 'PRIVATE', to: 'PUBLIC' },
        sensitive: { from: false, to: true },
      });
      await admin.post(`/api/admin/videos/${ok}/reprocess`).expect(409);
      const re = (
        await admin.post(`/api/admin/videos/${bad}/reprocess`).expect(200)
      ).body;
      expect(re.status).toBe('QUEUED');
      expect(await queues.remux.getJob(bad)).toBeTruthy();
      const search = (
        await admin.get('/api/admin/videos?q=brok&status=QUEUED').expect(200)
      ).body;
      expect(search.items.map((i: { id: string }) => i.id)).toEqual([bad]);
    });
  });

  describe('settings and audit', () => {
    it('settings validate, apply at once (cooldown) and are audited', async () => {
      const s = (await admin.get('/api/admin/settings').expect(200)).body;
      expect(s).toMatchObject({
        requestCooldownDays: 7,
        tiers: { BASIC: { requestsPerDay: 30 } },
      });
      await admin
        .put('/api/admin/settings')
        .send({ ...s, requestCooldownDays: -1 })
        .expect(400);
      await admin
        .put('/api/admin/settings')
        .send({ ...s, requestCooldownDays: 2, extra: 1 })
        .expect(400);
      const saved = (
        await admin
          .put('/api/admin/settings')
          .send({ ...s, requestCooldownDays: 2 })
          .expect(200)
      ).body;
      expect(saved.requestCooldownDays).toBe(2);

      const v = await seedVideo(annId, 'Lake');
      const req = (
        await bob
          .post('/api/exchange')
          .send({ holderUsername: 'ann', videoIds: [v] })
          .expect(201)
      ).body.request;
      await ann.post(`/api/exchange/${req.id}/decline`).send({}).expect(200);
      const cd = await prisma.requestCooldown.findFirstOrThrow({
        where: { requesterId: bobId },
      });
      const days = (cd.until.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(1.9);
      expect(days).toBeLessThan(2.1);

      const log = (
        await admin.get('/api/admin/audit?action=settings.update').expect(200)
      ).body;
      expect(log.items[0]).toMatchObject({
        actor: { username: 'boss' },
        meta: { requestCooldownDays: { from: 7, to: 2 } },
      });
      expect(
        (await admin.get('/api/admin/audit?actor=boss').expect(200)).body.total,
      ).toBe(1);
    });

    it('requests are listed and readable with their real status', async () => {
      const v = await seedVideo(annId, 'Lake');
      const req = (
        await bob
          .post('/api/exchange')
          .send({ holderUsername: 'ann', videoIds: [v] })
          .expect(201)
      ).body.request;
      const list = (await admin.get('/api/admin/requests?q=bob').expect(200))
        .body;
      expect(list.total).toBe(1);
      const detail = (
        await admin.get(`/api/admin/requests/${req.id}`).expect(200)
      ).body;
      expect(detail).toMatchObject({
        status: 'OPEN',
        awaitingUserId: annId,
        actions: [],
        holder: { username: 'ann' },
        requester: { username: 'bob' },
      });
    });
  });

  describe('view as', () => {
    it('admins read the site as the user but cannot change anything; others cannot switch', async () => {
      const asBob = { 'X-View-As': bobId };
      await admin.post(`/api/admin/users/${bobId}/view-as`).expect(200);
      const me = (await admin.get('/api/auth/me').set(asBob).expect(200)).body;
      expect(me).toMatchObject({ username: 'bob', role: 'USER' });
      const err = (
        await admin.post('/api/users/ann/follow').set(asBob).expect(403)
      ).body;
      expect(err.code).toBe('viewAsReadOnly');
      // The admin API never switches; a normal user's header is ignored.
      await admin.get('/api/admin/dashboard').set(asBob).expect(200);
      expect(
        (await ann.get('/api/auth/me').set({ 'X-View-As': bobId }).expect(200))
          .body.username,
      ).toBe('ann');
      expect((await audit('user.viewAs'))[0]!.meta).toMatchObject({
        username: 'bob',
      });
    });
  });
});

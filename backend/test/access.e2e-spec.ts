import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { deriveHlsKey } from '../src/modules/processing/hls-crypto.js';
import { PlaybackTokenService } from '../src/modules/streaming/playback-token.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const KEK = Buffer.from(process.env['KEK']!, 'hex');

/**
 * The access matrix: viewers × videos × actions. Videos are seeded directly
 * (the processing pipeline has its own suite); HLS objects are tiny stand-ins in the test bucket.
 */
describe('access and streaming (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let tokens: PlaybackTokenService;
  let guest: C, author: C, holder: C, stranger: C, admin: C;
  let authorId: string, holderId: string, strangerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    tokens = app.get(PlaybackTokenService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    guest = client(app);
    author = client(app);
    holder = client(app);
    stranger = client(app);
    admin = client(app);
    authorId = await signUp(app, author, {
      email: 'author@example.com',
      username: 'author',
      password: 'secret123',
    });
    holderId = await signUp(app, holder, {
      email: 'holder@example.com',
      username: 'holder',
      password: 'secret123',
    });
    strangerId = await signUp(app, stranger, {
      email: 'stranger@example.com',
      username: 'stranger',
      password: 'secret123',
    });
    const adminId = await signUp(app, admin, {
      email: 'admin@example.com',
      username: 'theadmin',
      password: 'secret123',
    });
    await makeAdmin(prisma, adminId);
  });

  afterAll(async () => {
    await app.close();
  });

  interface SeedOptions {
    visibility?: 'PUBLIC' | 'PRIVATE';
    status?: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
    title?: string;
  }

  /** A video with its AUTHOR holding, a stand-in original and (when READY) a two-segment HLS package. */
  async function seed(owner: string, opts: SeedOptions = {}) {
    const status = opts.status ?? 'READY';
    const video = await prisma.video.create({
      data: {
        authorId: owner,
        title: opts.title ?? 'Clip',
        visibility: opts.visibility ?? 'PRIVATE',
        status,
        originalKey: 'pending',
        originalFilename: 'clip.mp4',
        sizeBytes: 1000n,
        durationSec: status === 'READY' ? 10 : null,
        width: 1280,
        height: 720,
        progress: status === 'READY' ? 100 : 0,
        holdings: { create: { holderId: owner, source: 'AUTHOR' } },
      },
    });
    const originalKey = `videos/${video.id}/original.mp4`;
    const hlsPrefix = `videos/${video.id}/hls/v1`;
    const segments = [randomBytes(1024), randomBytes(512)];
    await storage.putMany('private', [
      {
        key: originalKey,
        body: Buffer.from('original-bytes'),
        contentType: 'video/mp4',
      },
      ...(status === 'READY'
        ? [
            {
              key: `${hlsPrefix}/index.m3u8`,
              body: [
                '#EXTM3U',
                '#EXT-X-VERSION:6',
                '#EXT-X-TARGETDURATION:6',
                '#EXT-X-MEDIA-SEQUENCE:0',
                '#EXT-X-PLAYLIST-TYPE:VOD',
                '#EXT-X-KEY:METHOD=AES-128,URI="key"',
                '#EXTINF:6.000000,',
                'seg_00000.ts',
                '#EXTINF:4.000000,',
                'seg_00001.ts',
                '#EXT-X-ENDLIST',
                '',
              ].join('\n'),
              contentType: 'application/vnd.apple.mpegurl',
            },
            {
              key: `${hlsPrefix}/master.m3u8`,
              body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nindex.m3u8\n',
              contentType: 'application/vnd.apple.mpegurl',
            },
            {
              key: `${hlsPrefix}/seg_00000.ts`,
              body: segments[0]!,
              contentType: 'video/mp2t',
            },
            {
              key: `${hlsPrefix}/seg_00001.ts`,
              body: segments[1]!,
              contentType: 'video/mp2t',
            },
          ]
        : []),
    ]);
    await prisma.video.update({
      where: { id: video.id },
      data: {
        originalKey,
        hlsPrefix: status === 'READY' ? hlsPrefix : null,
        segmentCount: status === 'READY' ? 2 : null,
      },
    });
    return { id: video.id, segments };
  }

  function hold(
    videoId: string,
    userId: string,
    source: 'EXCHANGE' | 'SHARE' | 'PUBLIC_ADD',
    hidden = false,
  ) {
    return prisma.videoAccess.create({
      data: { videoId, holderId: userId, source, hidden },
    });
  }

  const page = (c: C, username: string, videoId: string) =>
    c.get(`/api/users/${username}/videos/${videoId}`);
  const playback = (c: C, videoId: string) =>
    c.post(`/api/videos/${videoId}/playback`);

  describe('video page capabilities', () => {
    it('public video: everyone sees it, only registered viewers may download or bookmark', async () => {
      const { id } = await seed(authorId, { visibility: 'PUBLIC' });
      const g = (await page(guest, 'author', id).expect(200)).body;
      expect(g.viewer).toMatchObject({
        canView: true,
        canStream: true,
        canDownload: false,
        canAddToCollection: false,
        canManage: false,
        inCollection: false,
        requestBlocker: 'guest',
      });
      expect(g.author).toMatchObject({ username: 'author', videoCount: 1 });
      expect(JSON.stringify(g)).not.toMatch(/hls|m3u8|X-Amz/);
      const s = (await page(stranger, 'author', id).expect(200)).body;
      expect(s.viewer).toMatchObject({
        canView: true,
        canDownload: true,
        canAddToCollection: true,
        canManage: false,
        requestBlocker: 'alreadyWatchable',
      });
      const a = (await page(author, 'author', id).expect(200)).body;
      expect(a.viewer).toMatchObject({
        canView: true,
        canManage: true,
        canHide: true,
        isHolder: true,
        inCollection: true,
        canAddToCollection: false,
        requestBlocker: 'ownPage',
      });
    });

    it('private video: contact-sheet page for others, player for author, holders and admins', async () => {
      const { id } = await seed(authorId);
      await hold(id, holderId, 'EXCHANGE');
      expect(
        (await page(guest, 'author', id).expect(200)).body.viewer,
      ).toMatchObject({
        canView: false,
        canStream: false,
        requestBlocker: 'guest',
      });
      expect(
        (await page(stranger, 'author', id).expect(200)).body.viewer,
      ).toMatchObject({
        canView: false,
        canDownload: false,
        canAddToCollection: false,
        requestBlocker: null,
      });
      expect(
        (await page(holder, 'author', id).expect(200)).body.viewer,
      ).toMatchObject({
        canView: true,
        canStream: true,
        canDownload: true,
        inCollection: true,
        isHolder: false,
        canHide: false,
        requestBlocker: 'alreadyWatchable',
      });
      expect(
        (await page(holder, 'holder', id).expect(200)).body.viewer,
      ).toMatchObject({
        canView: true,
        isHolder: true,
        canHide: true,
        canManage: false,
      });
      expect(
        (await page(admin, 'author', id).expect(200)).body.viewer,
      ).toMatchObject({
        canView: true,
        canStream: true,
        canDownload: true,
        canManage: true,
      });
    });

    it('unfinished and hidden items exist only for their holder; bookmarks only while public', async () => {
      const processing = await seed(authorId, {
        status: 'PROCESSING',
        visibility: 'PUBLIC',
      });
      await page(stranger, 'author', processing.id).expect(404);
      await page(guest, 'author', processing.id).expect(404);
      expect(
        (await page(author, 'author', processing.id).expect(200)).body.video
          .status,
      ).toBe('PROCESSING');

      const { id } = await seed(authorId);
      await hold(id, holderId, 'SHARE', true);
      await page(stranger, 'holder', id).expect(404);
      expect(
        (await page(holder, 'holder', id).expect(200)).body.holding.hidden,
      ).toBe(true);
      await page(admin, 'holder', id).expect(200);

      const pub = await seed(authorId, { visibility: 'PUBLIC' });
      await hold(pub.id, holderId, 'PUBLIC_ADD');
      expect(
        (await page(stranger, 'holder', pub.id).expect(200)).body.viewer
          .requestBlocker,
      ).toBe('alreadyWatchable');
      await prisma.video.update({
        where: { id: pub.id },
        data: { visibility: 'PRIVATE' },
      });
      await page(stranger, 'holder', pub.id).expect(404);
      expect(
        (await page(holder, 'holder', pub.id).expect(200)).body.viewer
          .canStream,
      ).toBe(true);
      expect(
        (await page(stranger, 'author', pub.id).expect(200)).body.viewer
          .requestBlocker,
      ).toBeNull();
    });

    it('closed pages: banned or deleted owners are 404, their videos stay with holders', async () => {
      const { id } = await seed(authorId, { visibility: 'PUBLIC' });
      await hold(id, holderId, 'EXCHANGE');
      await prisma.user.update({
        where: { id: authorId },
        data: { status: 'BANNED' },
      });
      await page(stranger, 'author', id).expect(404);
      await stranger.get('/api/users/author/collection').expect(404);
      expect(
        (await page(stranger, 'holder', id).expect(200)).body.viewer.canStream,
      ).toBe(true);
      await playback(stranger, id).expect(200);
      await stranger.get('/api/users/nobody/videos/' + id).expect(404);
    });
  });

  describe('collection listing', () => {
    it('visitors see public → private → others, owners see everything including hidden', async () => {
      const pub = await seed(authorId, { visibility: 'PUBLIC', title: 'pub' });
      const priv = await seed(authorId, { title: 'priv' });
      await seed(authorId, { status: 'QUEUED', title: 'queued' });
      const fromHolder = await seed(holderId, { title: 'from holder' });
      await hold(fromHolder.id, authorId, 'EXCHANGE');
      const hiddenOne = await seed(holderId, { title: 'hidden' });
      await hold(hiddenOne.id, authorId, 'SHARE', true);
      const bookmark = await seed(holderId, {
        visibility: 'PUBLIC',
        title: 'bookmark',
      });
      await hold(bookmark.id, authorId, 'PUBLIC_ADD');

      const visitor = (
        await guest.get('/api/users/author/collection').expect(200)
      ).body;
      expect(visitor.mode).toBe('VISITOR');
      expect(visitor.total).toBe(4);
      expect(
        visitor.items.map(
          (i: { section: string; video: { title: string } }) =>
            `${i.section}:${i.video.title}`,
        ),
      ).toEqual([
        'PUBLIC:pub',
        'PRIVATE:priv',
        'OTHERS:bookmark',
        'OTHERS:from holder',
      ]);
      expect(visitor.items[2].source).toBe('PUBLIC_ADD');
      expect(visitor.items[3].video.author.username).toBe('holder');

      const owner = (
        await author.get('/api/users/author/collection').expect(200)
      ).body;
      expect(owner.mode).toBe('OWNER');
      // Hidden holdings live in their own folder, so "all" shows 5 of the 6.
      expect(owner.total).toBe(5);
      const hidden = (
        await author
          .get('/api/users/author/collection?section=HIDDEN')
          .expect(200)
      ).body;
      expect(hidden.total).toBe(1);
      expect(hidden.items[0].video.title).toBe('hidden');
      expect(hidden.items[0].hidden).toBe(true);
      expect(
        owner.items.some(
          (i: { video: { title: string } }) => i.video.title === 'queued',
        ),
      ).toBe(true);

      const others = (
        await guest
          .get('/api/users/author/collection?section=OTHERS&limit=1')
          .expect(200)
      ).body;
      expect(others.total).toBe(2);
      expect(others.items).toHaveLength(1);
      const next = (
        await guest
          .get('/api/users/author/collection?section=OTHERS&limit=1&offset=1')
          .expect(200)
      ).body;
      expect(next.items[0].video.id).not.toBe(others.items[0].video.id);

      await prisma.video.update({
        where: { id: bookmark.id },
        data: { visibility: 'PRIVATE' },
      });
      expect(
        (await guest.get('/api/users/author/collection').expect(200)).body
          .total,
      ).toBe(3);
      expect(
        (await author.get('/api/users/author/collection').expect(200)).body
          .total,
      ).toBe(5);
      void pub;
      void priv;
    });

    it('resolves former usernames and the admin sees pages as the owner', async () => {
      await seed(authorId, { title: 'x' });
      await author
        .patch('/api/me/username')
        .send({ username: 'author2' })
        .expect(200);
      expect(
        (await guest.get('/api/users/author/collection').expect(200)).body
          .total,
      ).toBe(1);
      expect(
        (await admin.get('/api/users/author2/collection').expect(200)).body
          .mode,
      ).toBe('OWNER');
    });
  });

  describe('streaming', () => {
    it('rewrites playlists with presigned segments and serves the key only with a valid token', async () => {
      const { id, segments } = await seed(authorId, { visibility: 'PUBLIC' });
      const { playlistUrl, expiresAt } = (await playback(guest, id).expect(200))
        .body;
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
      const masterPath = playlistUrl.replace(/^http:\/\/[^/]+/, '');
      const token = new URL(playlistUrl).searchParams.get('t')!;

      const master = await guest.get(masterPath).expect(200);
      expect(master.headers['content-type']).toContain(
        'application/vnd.apple.mpegurl',
      );
      expect(master.headers['cache-control']).toBe('private, no-store');
      expect(master.text).toContain(`/api/stream/${id}/index.m3u8?t=${token}`);

      const index = await guest
        .get(`/api/stream/${id}/index.m3u8?t=${token}`)
        .expect(200);
      const lines = index.text.split('\n');
      const segmentUrls = lines.filter((l) => l.startsWith('http'));
      expect(segmentUrls).toHaveLength(2);
      expect(segmentUrls[0]).toMatch(
        /^http:\/\/localhost:9100\/tapeshelf-test-private\/videos\/.+seg_00000\.ts\?.*X-Amz-Signature=/,
      );
      expect(index.text).toContain(
        `#EXT-X-KEY:METHOD=AES-128,URI="http://localhost:4200/api/stream/${id}/key?t=${token}"`,
      );
      expect(index.text).not.toContain('URI="key"');
      const fetched = await fetch(segmentUrls[0]!);
      expect(fetched.status).toBe(200);
      expect(
        Buffer.from(await fetched.arrayBuffer()).equals(segments[0]!),
      ).toBe(true);

      const key = await guest
        .get(`/api/stream/${id}/key?t=${token}`)
        .expect(200);
      expect(key.headers['cache-control']).toBe('private, max-age=60');
      expect(
        Buffer.from(key.body as Buffer).equals(deriveHlsKey(KEK, id, 1)),
      ).toBe(true);

      await guest.get(`/api/stream/${id}/key`).expect(401);
      await guest.get(`/api/stream/${id}/key?t=${token}x`).expect(401);
      const other = await seed(authorId, { visibility: 'PUBLIC' });
      await guest.get(`/api/stream/${other.id}/key?t=${token}`).expect(401);
      const expired = tokens.sign(id, null, 1);
      await new Promise((r) => setTimeout(r, 1100));
      expect(
        (await guest.get(`/api/stream/${id}/key?t=${expired}`).expect(401)).body
          .code,
      ).toBe('playbackTokenInvalid');
    });

    it('private videos: tokens only for those who may watch, and only with their own session', async () => {
      const { id } = await seed(authorId);
      await hold(id, holderId, 'EXCHANGE');
      expect((await playback(guest, id).expect(403)).body.code).toBe(
        'videoNotWatchable',
      );
      await playback(stranger, id).expect(403);
      await playback(author, id).expect(200);
      await playback(admin, id).expect(200);
      const { playlistUrl } = (await playback(holder, id).expect(200)).body;
      const token = new URL(playlistUrl).searchParams.get('t')!;
      await holder.get(`/api/stream/${id}/key?t=${token}`).expect(200);
      // Same token, somebody else's (or no) cookies: the key is not served.
      await guest.get(`/api/stream/${id}/key?t=${token}`).expect(401);
      await stranger.get(`/api/stream/${id}/index.m3u8?t=${token}`).expect(401);

      const queued = await seed(authorId, { status: 'QUEUED' });
      await playback(author, queued.id).expect(403);
      await playback(author, '0199d1c0-1111-7000-8000-000000000001').expect(
        404,
      );
    });

    it('downloads: whoever may watch, never guests; Free via the wait page, Pro and admins straight to storage', async () => {
      const pub = await seed(authorId, { visibility: 'PUBLIC' });
      await guest.get(`/api/videos/${pub.id}/download`).expect(401);
      const wait = await stranger
        .get(`/api/videos/${pub.id}/download`)
        .expect(302);
      const { code } = await prisma.video.findUniqueOrThrow({
        where: { id: pub.id },
      });
      expect(wait.headers['location']).toBe(
        `http://localhost:4200/download/${code}`,
      );

      const priv = await seed(authorId);
      expect(
        (await stranger.get(`/api/videos/${priv.id}/download`).expect(403)).body
          .code,
      ).toBe('downloadNotAllowed');
      await hold(priv.id, holderId, 'SHARE');
      await holder.get(`/api/videos/${priv.id}/download`).expect(302);
      await author.get(`/api/videos/${priv.id}/download`).expect(302);

      // Admins and Pro: a presigned link to the original at once.
      const direct = await admin
        .get(`/api/videos/${priv.id}/download`)
        .expect(302);
      expect(direct.headers['location']).toMatch(/X-Amz-Signature=/);
      expect(direct.headers['location']).toMatch(
        /response-content-disposition=attachment/,
      );
      const file = await fetch(direct.headers['location']!);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-disposition')).toContain('attachment');
      expect(await file.text()).toBe('original-bytes');
      await prisma.user.update({
        where: { id: strangerId },
        data: { tier: 'PREMIUM' },
      });
      expect(
        (await stranger.get(`/api/videos/${pub.id}/download`).expect(302))
          .headers['location'],
      ).toMatch(/X-Amz-Signature=/);
    });
  });

  describe('collection actions and deletion', () => {
    it('bookmarks public videos, hides received ones, refuses the rest', async () => {
      const pub = await seed(authorId, { visibility: 'PUBLIC' });
      await stranger.post(`/api/videos/${pub.id}/collection`).expect(200);
      expect(
        (await stranger.post(`/api/videos/${pub.id}/collection`).expect(409))
          .body.code,
      ).toBe('alreadyInCollection');
      expect(
        (await author.post(`/api/videos/${pub.id}/collection`).expect(400)).body
          .code,
      ).toBe('cannotAddToCollection');
      const priv = await seed(authorId);
      expect(
        (await stranger.post(`/api/videos/${priv.id}/collection`).expect(400))
          .body.code,
      ).toBe('cannotAddToCollection');
      const unverified = client(app);
      await signUp(app, unverified, {
        email: 'u@example.com',
        username: 'unverified',
        password: 'secret123',
        verified: false,
      });
      expect(
        (await unverified.post(`/api/videos/${pub.id}/collection`).expect(403))
          .body.code,
      ).toBe('emailNotVerified');

      expect(
        (await page(guest, 'stranger', pub.id).expect(200)).body.holding.source,
      ).toBe('PUBLIC_ADD');
      await stranger
        .patch(`/api/videos/${pub.id}/holding`)
        .send({ hidden: true })
        .expect(200);
      await page(guest, 'stranger', pub.id).expect(404);
      expect(
        (await page(stranger, 'stranger', pub.id).expect(200)).body.holding
          .hidden,
      ).toBe(true);
      await stranger
        .patch(`/api/videos/${pub.id}/holding`)
        .send({ hidden: false })
        .expect(200);
      await page(guest, 'stranger', pub.id).expect(200);
      // The author hides their own video from their page ("only for me"); the stranger's
      // bookmark of it is theirs and stays.
      await author
        .patch(`/api/videos/${pub.id}/holding`)
        .send({ hidden: true })
        .expect(200);
      await page(guest, 'author', pub.id).expect(404);
      await page(guest, 'stranger', pub.id).expect(200);
      await author
        .patch(`/api/videos/${pub.id}/holding`)
        .send({ hidden: false })
        .expect(200);
      await holder
        .patch(`/api/videos/${pub.id}/holding`)
        .send({ hidden: true })
        .expect(404);

      // Bookmarks keep playing for the holder after the author goes private.
      await author
        .patch(`/api/videos/${pub.id}`)
        .send({ visibility: 'PRIVATE' })
        .expect(200);
      await playback(stranger, pub.id).expect(200);
      await playback(guest, pub.id).expect(403);
    });

    it('soft delete: author or admin only, frees the quota, hides the video everywhere at once', async () => {
      const { id } = await seed(authorId, { visibility: 'PUBLIC' });
      await prisma.user.update({
        where: { id: authorId },
        data: { storageUsedBytes: 1000n },
      });
      await hold(id, holderId, 'EXCHANGE');
      const { playlistUrl } = (await playback(holder, id).expect(200)).body;
      await stranger.delete(`/api/videos/${id}`).expect(404);
      await holder.delete(`/api/videos/${id}`).expect(404);
      await author.delete(`/api/videos/${id}`).expect(200);
      expect(
        Number(
          (await prisma.user.findUniqueOrThrow({ where: { id: authorId } }))
            .storageUsedBytes,
        ),
      ).toBe(0);
      await page(guest, 'author', id).expect(404);
      await page(holder, 'holder', id).expect(404);
      await page(admin, 'author', id).expect(404);
      await holder.get(playlistUrl.replace(/^http:\/\/[^/]+/, '')).expect(404);
      await playback(author, id).expect(404);
      expect(
        (await author.get('/api/videos/mine').expect(200)).body.items,
      ).toHaveLength(0);
      expect(
        (await guest.get('/api/users/holder/collection').expect(200)).body
          .total,
      ).toBe(0);
      expect(
        await prisma.video.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ deleteReason: 'USER', deletedById: authorId });

      // Someone else's video goes through the admin panel, with the rule and the audit.
      const other = await seed(authorId);
      const refused = await admin.delete(`/api/videos/${other.id}`).expect(403);
      expect(refused.body.code).toBe('deleteInAdminPanel');
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: other.id } }))
          .deletedAt,
      ).toBeNull();
    });

    it('/v/:id context: the viewer’s own page when they hold the video, else the author’s', async () => {
      const { id } = await seed(authorId, { visibility: 'PUBLIC' });
      await hold(id, holderId, 'EXCHANGE');
      expect(
        (await guest.get(`/api/videos/${id}/context`).expect(200)).body
          .username,
      ).toBe('author');
      expect(
        (await stranger.get(`/api/videos/${id}/context`).expect(200)).body
          .username,
      ).toBe('author');
      expect(
        (await holder.get(`/api/videos/${id}/context`).expect(200)).body
          .username,
      ).toBe('holder');
      await prisma.user.update({
        where: { id: authorId },
        data: { status: 'BANNED' },
      });
      await stranger.get(`/api/videos/${id}/context`).expect(404);
      expect(
        (await holder.get(`/api/videos/${id}/context`).expect(200)).body
          .username,
      ).toBe('holder');
      void strangerId;
    });

    it('/<code> links: the short code finds the video in any case, with the same context', async () => {
      const { id } = await seed(authorId, { visibility: 'PUBLIC' });
      await hold(id, holderId, 'EXCHANGE');
      const { code } = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(code).toMatch(/^(?=[^\d]*\d)[2-9a-hjkmnp-z]{7}$/);
      expect(
        (await guest.get(`/api/videos/code/${code}`).expect(200)).body,
      ).toEqual({ id, code, username: 'author' });
      expect(
        (await holder.get(`/api/videos/code/${code.toUpperCase()}`).expect(200))
          .body.username,
      ).toBe('holder');
      await guest.get('/api/videos/code/about').expect(404);
      await guest.get('/api/videos/code/zzzzzz9').expect(404);
    });
  });
});

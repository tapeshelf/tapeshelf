import type { NestExpressApplication } from '@nestjs/platform-express';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import {
  LinksService,
  ZIP_RECHECK_MS,
} from '../src/modules/links/links.service.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';
import { PlaybackTokenService } from '../src/modules/streaming/playback-token.service.js';
import { clearMailbox, waitForMail } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const DAY = 24 * 3600 * 1000;

const binary = (
  res: unknown,
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  const stream = res as IncomingMessage;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
};

/** Python's zipfile checks the archive and gives back each file's bytes (hex). */
function unzip(zip: Buffer): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'links-'));
  try {
    const file = join(dir, 'a.zip');
    writeFileSync(file, zip);
    const out = execFileSync(
      'python3',
      [
        '-c',
        'import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename: z.read(i).hex() for i in z.infolist()}))',
        file,
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(out) as Record<string, string>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Temporary links: who may make them and of what, the
 * page for whoever has one, its password and its emailed code, playing, downloading and the ZIP
 * without limits, putting the videos on one's shelf for good, and the 404 once it is over.
 */
describe('temporary links (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let relay: OutboxRelayService;
  let pro: C, free: C, guest: C, other: C;
  let proId: string, freeId: string, otherId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    relay = app.get(OutboxRelayService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    pro = client(app);
    free = client(app);
    guest = client(app);
    other = client(app);
    proId = await signUp(app, pro, {
      email: 'pro@example.com',
      username: 'pro',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: proId },
      data: { tier: 'PREMIUM', displayName: 'Pro Sender' },
    });
    freeId = await signUp(app, free, {
      email: 'free@example.com',
      username: 'free',
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

  /** A ready video of `authorId` with its original and a one-segment HLS package. */
  async function seed(
    authorId: string,
    title: string,
    opts: { status?: 'READY' | 'QUEUED'; filename?: string } = {},
  ) {
    const status = opts.status ?? 'READY';
    const video = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PRIVATE',
        status,
        originalKey: 'pending',
        originalFilename: opts.filename ?? `${title}.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 0n,
        durationSec: 10,
        width: 1280,
        height: 720,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    const bytes = randomBytes(2048 + title.length);
    const originalKey = `videos/${video.id}/original.mp4`;
    const hlsPrefix = `videos/${video.id}/hls/v1`;
    await storage.putMany('private', [
      { key: originalKey, body: bytes, contentType: 'video/mp4' },
      {
        key: `${hlsPrefix}/master.m3u8`,
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nindex.m3u8\n',
        contentType: 'application/vnd.apple.mpegurl',
      },
      {
        key: `${hlsPrefix}/index.m3u8`,
        body: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:10,\nseg_00000.ts\n#EXT-X-ENDLIST\n',
        contentType: 'application/vnd.apple.mpegurl',
      },
      {
        key: `${hlsPrefix}/seg_00000.ts`,
        body: randomBytes(256),
        contentType: 'video/mp2t',
      },
    ]);
    await prisma.video.update({
      where: { id: video.id },
      data: {
        originalKey,
        sizeBytes: BigInt(bytes.length),
        hlsPrefix: status === 'READY' ? hlsPrefix : null,
      },
    });
    return { id: video.id, bytes };
  }

  const create = (c: C, body: Record<string, unknown>) =>
    c.post('/api/me/links').send({ ttl: '1d', ...body });
  const page = (c: C, code: string) => c.get(`/api/links/${code}`);
  const notifications = async (c: C) => {
    await relay.drain();
    return (
      (await c.get('/api/notifications').expect(200)).body.items as {
        type: string;
        payload: Record<string, unknown>;
      }[]
    ).filter((n) => n.type.startsWith('LINK_'));
  };

  it('everyone makes them, a password only Pro; of videos it may pass on; my links; taken back is a 404', async () => {
    const own = await seed(proId, 'own');
    const theirs = await seed(otherId, 'theirs');
    const shared = await seed(otherId, 'shared');
    const bookmark = await seed(otherId, 'bookmark');
    const queued = await seed(proId, 'queued', { status: 'QUEUED' });
    await prisma.videoAccess.createMany({
      data: [
        { videoId: shared.id, holderId: proId, source: 'EXCHANGE' },
        { videoId: bookmark.id, holderId: proId, source: 'PUBLIC_ADD' },
      ],
    });
    const freeOwn = await seed(freeId, 'free own');

    expect(
      (
        await create(free, {
          videoIds: [freeOwn.id],
          password: 'open sesame',
        }).expect(403)
      ).body.code,
    ).toBe('linkPasswordPro');
    expect(
      (await create(free, { videoIds: [freeOwn.id] }).expect(200)).body,
    ).toMatchObject({ count: 1, hasPassword: false });
    expect(
      (await free.get('/api/auth/me').expect(200)).body.canProtectLinks,
    ).toBe(false);
    expect(
      (await pro.get('/api/auth/me').expect(200)).body.canProtectLinks,
    ).toBe(true);
    for (const id of [theirs.id, bookmark.id, queued.id])
      expect(
        (await create(pro, { videoIds: [own.id, id] }).expect(400)).body.code,
      ).toBe('linkVideoNotAllowed');
    await create(pro, { videoIds: [own.id], ttl: '5d' }).expect(400);

    const link = (
      await create(pro, { videoIds: [shared.id, own.id], ttl: '1h' }).expect(
        200,
      )
    ).body;
    expect(link).toMatchObject({
      count: 2,
      hasPassword: false,
      email: null,
      opened: false,
    });
    expect(link.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const left = new Date(link.expiresAt).getTime() - Date.now();
    expect(left).toBeGreaterThan(59 * 60_000);
    expect(left).toBeLessThanOrEqual(3600_000);
    expect(
      (await pro.get('/api/me/links').expect(200)).body.map(
        (l: { id: string }) => l.id,
      ),
    ).toEqual([link.id]);
    // The video page tells who may send it: a holder of a copy, not a bookmark.
    // Free's own link is theirs alone.
    expect((await free.get('/api/me/links').expect(200)).body).toHaveLength(1);

    await guest.get(`/api/links/${link.code}`).expect(200);
    await other.delete(`/api/me/links/${link.id}`).expect(404);
    await pro.delete(`/api/me/links/${link.id}`).expect(204);
    expect((await page(guest, link.code).expect(404)).body.code).toBe(
      'linkNotFound',
    );
    expect((await pro.get('/api/me/links').expect(200)).body).toEqual([]);
    await page(guest, 'not-a-link').expect(404);
  });

  it('a guest watches, downloads one by one and all as a ZIP; the sender hears once', async () => {
    const a = await seed(proId, 'Lake', { filename: 'lake.mp4' });
    const b = await seed(proId, 'Same name', { filename: 'lake.mp4' });
    const { code } = (await create(pro, { videoIds: [a.id, b.id] }).expect(200))
      .body;

    const body = (await page(guest, code).expect(200)).body;
    expect(body).toMatchObject({
      sender: { username: 'pro', displayName: 'Pro Sender', pageHidden: false },
      count: 2,
      access: 'open',
      needsPassword: false,
      needsCode: false,
      own: false,
      totalBytes: a.bytes.length + b.bytes.length,
    });
    expect(
      body.videos.map((v: { video: { title: string } }) => v.video.title),
    ).toEqual(['Lake', 'Same name']);
    expect(body.videos[0]).toMatchObject({
      onShelf: false,
      fileBytes: a.bytes.length,
    });

    // The player's token is the link's: no session needed for a private video.
    const { playlistUrl } = (
      await guest.post(`/api/links/${code}/videos/${a.id}/playback`).expect(200)
    ).body;
    const token = new URL(playlistUrl).searchParams.get('t')!;
    await guest.get(playlistUrl.replace(/^http:\/\/[^/]+/, '')).expect(200);
    await guest.get(`/api/stream/${a.id}/key?t=${token}`).expect(200);
    // …and only for the videos of the link.
    const stranger = await seed(proId, 'Not in it');
    await guest
      .post(`/api/links/${code}/videos/${stranger.id}/playback`)
      .expect(404);

    const download = await guest
      .get(`/api/links/${code}/videos/${a.id}/download`)
      .expect(302);
    const file = await fetch(download.headers['location']!);
    expect(Buffer.from(await file.arrayBuffer()).equals(a.bytes)).toBe(true);

    const zip = await guest.agent
      .get(`/api/links/${code}/zip`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.headers['content-disposition']).toContain('-pro.zip');
    expect(Number(zip.headers['content-length'])).toBe(zip.body.length);
    expect(unzip(zip.body as Buffer)).toEqual({
      'lake.mp4': a.bytes.toString('hex'),
      'lake (2).mp4': b.bytes.toString('hex'),
    });
    expect(body.zipBytes).toBe(zip.body.length);

    // The sender opening it tells nobody; the first other opening tells them once.
    await page(pro, code).expect(200);
    await page(other, code).expect(200);
    await page(guest, code).expect(200);
    const news = await notifications(pro);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({
      type: 'LINK_OPENED',
      payload: { count: 2, title: 'Lake', fromUsername: null },
    });
    expect((await pro.get('/api/me/links').expect(200)).body[0].opened).toBe(
      true,
    );
  });

  it('a password locks the page and everything behind it until it is given', async () => {
    const a = await seed(proId, 'Secret');
    const { code, hasPassword } = (
      await create(pro, { videoIds: [a.id], password: 'kx7q-m2pz' }).expect(200)
    ).body;
    expect(hasPassword).toBe(true);

    const locked = (await page(guest, code).expect(200)).body;
    expect(locked).toMatchObject({
      access: 'locked',
      needsPassword: true,
      needsCode: false,
      videos: [],
      count: 1,
      zipBytes: 0,
    });
    await guest.post(`/api/links/${code}/videos/${a.id}/playback`).expect(403);
    await guest.get(`/api/links/${code}/videos/${a.id}/download`).expect(403);
    await guest.get(`/api/links/${code}/zip`).expect(403);
    expect(
      (
        await guest
          .post(`/api/links/${code}/unlock`)
          .send({ password: 'wrong' })
          .expect(403)
      ).body.code,
    ).toBe('linkWrongPassword');

    const open = (
      await guest
        .post(`/api/links/${code}/unlock`)
        .send({ password: 'kx7q-m2pz' })
        .expect(200)
    ).body;
    expect(open).toMatchObject({ access: 'open', needsPassword: false });
    expect(open.videos).toHaveLength(1);
    // This browser remembers it; another one does not.
    expect((await page(guest, code).expect(200)).body.access).toBe('open');
    await guest.get(`/api/links/${code}/videos/${a.id}/download`).expect(302);
    expect((await page(other, code).expect(200)).body.access).toBe('locked');
    // The sender never needs it.
    expect((await page(pro, code).expect(200)).body).toMatchObject({
      access: 'open',
      own: true,
    });
  });

  it('a link for one address mails it, opens with the code sent there or to that account', async () => {
    await clearMailbox();
    const a = await seed(proId, 'For you');
    const { code } = (
      await create(pro, {
        videoIds: [a.id],
        email: 'Friend@Example.com',
      }).expect(200)
    ).body;
    const invite = await waitForMail('friend@example.com', 'shares videos');
    expect(invite.text).toContain(`http://localhost:4200/t/${code}`);
    expect(invite.text).toContain('For you');

    const locked = (await page(guest, code).expect(200)).body;
    expect(locked).toMatchObject({
      access: 'locked',
      needsCode: true,
      emailHint: 'f•••@example.com',
    });
    await guest.post(`/api/links/${code}/code`).expect(204);
    expect(
      (await guest.post(`/api/links/${code}/code`).expect(429)).body.code,
    ).toBe('linkCodeTooSoon');
    const mail = await waitForMail('friend@example.com', 'Code');
    const digits = /\b(\d{6})\b/.exec(mail.subject)![1]!;
    const wrong = digits === '000000' ? '111111' : '000000';
    expect(
      (
        await guest
          .post(`/api/links/${code}/unlock`)
          .send({ code: wrong })
          .expect(403)
      ).body.code,
    ).toBe('linkWrongCode');
    expect(
      (
        await guest
          .post(`/api/links/${code}/unlock`)
          .send({ code: digits })
          .expect(200)
      ).body.access,
    ).toBe('open');
    // The code is spent.
    await other
      .post(`/api/links/${code}/unlock`)
      .send({ code: digits })
      .expect(403);

    // Signed in with that very address (confirmed): open without a code.
    const friend = client(app);
    await signUp(app, friend, {
      email: 'friend@example.com',
      username: 'friend',
      password: 'secret123',
    });
    expect((await page(friend, code).expect(200)).body.access).toBe('open');
    const unconfirmed = client(app);
    await signUp(app, unconfirmed, {
      email: 'friend2@example.com',
      username: 'friend2',
      password: 'secret123',
      verified: false,
    });
    expect((await page(unconfirmed, code).expect(200)).body.access).toBe(
      'locked',
    );
  });

  it('code tries sent at once each count; HEAD reads no archive; the player never outlives the link', async () => {
    await clearMailbox();
    const a = await seed(proId, 'Kept');
    const { code } = (
      await create(pro, {
        videoIds: [a.id],
        email: 'quick@example.com',
      }).expect(200)
    ).body;
    await guest.post(`/api/links/${code}/code`).expect(204);
    const digits = /\b(\d{6})\b/.exec(
      (await waitForMail('quick@example.com', 'Code')).subject,
    )![1]!;
    const wrong = digits === '000000' ? '111111' : '000000';
    // Five wrong tries at once spend the code, as five one after another do.
    await Promise.all(
      Array.from({ length: 5 }, () =>
        guest.post(`/api/links/${code}/unlock`).send({ code: wrong }),
      ),
    );
    await guest
      .post(`/api/links/${code}/unlock`)
      .send({ code: digits })
      .expect(403);

    // Open, the link's archive answers HEAD without reading a byte of the videos.
    const open = (await create(pro, { videoIds: [a.id] }).expect(200)).body
      .code;
    const reads = vi.spyOn(app.get(StorageService), 'getStream');
    const head = await guest.agent.head(`/api/links/${open}/zip`).expect(200);
    expect(Number(head.headers['content-length'])).toBeGreaterThan(
      a.bytes.length,
    );
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();

    // A link with seconds left gives the player those seconds, not a minute more.
    await prisma.shareLink.updateMany({
      where: { code: open },
      data: { expiresAt: new Date(Date.now() + 20_000) },
    });
    const { playlistUrl } = (
      await guest.post(`/api/links/${open}/videos/${a.id}/playback`).expect(200)
    ).body;
    const token = app
      .get(PlaybackTokenService)
      .verify(new URL(playlistUrl).searchParams.get('t')!);
    expect(token!.exp).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 20);

    // A hundred links whose videos have all gone are not in the list, and do not use up the limit.
    await prisma.shareLink.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        code: `emptylink${String(i).padStart(3, '0')}`,
        senderId: proId,
        expiresAt: new Date(Date.now() + DAY),
      })),
    });
    await create(pro, { videoIds: [a.id] }).expect(200);
  });

  it('puts them on one’s shelf for good, as a copy the sender shared', async () => {
    const a = await seed(proId, 'Keep');
    const b = await seed(proId, 'Bookmarked');
    const theirs = await seed(otherId, 'Their own');
    await prisma.videoAccess.createMany({
      data: [
        { videoId: theirs.id, holderId: proId, source: 'SHARE' },
        { videoId: b.id, holderId: freeId, source: 'PUBLIC_ADD' },
      ],
    });
    const { code } = (
      await create(pro, { videoIds: [a.id, b.id, theirs.id] }).expect(200)
    ).body;

    await guest.post(`/api/links/${code}/save`).send({}).expect(401);
    // Adding to a shelf waits for a confirmed email, here as everywhere.
    const unconfirmed = client(app);
    await signUp(app, unconfirmed, {
      email: 'saver@example.com',
      username: 'saver',
      password: 'secret123',
      verified: false,
    });
    expect(
      (await unconfirmed.post(`/api/links/${code}/save`).send({}).expect(403))
        .body.code,
    ).toBe('emailNotVerified');
    const saved = (
      await free.post(`/api/links/${code}/save`).send({}).expect(200)
    ).body;
    expect(saved).toEqual({ added: 3, onShelf: [a.id, b.id, theirs.id] });
    const held = await prisma.videoAccess.findMany({
      where: { holderId: freeId },
      orderBy: { videoId: 'asc' },
    });
    expect(
      held.map((h) => [h.videoId, h.source, h.grantedById, h.unseen]),
    ).toEqual(
      [a.id, b.id, theirs.id].sort().map((id) => [id, 'SHARE', proId, true]),
    );
    expect(
      (await page(free, code).expect(200)).body.videos.every(
        (v: { onShelf: boolean }) => v.onShelf,
      ),
    ).toBe(true);
    // Saving again adds nothing and tells nobody.
    expect(
      (await free.post(`/api/links/${code}/save`).send({}).expect(200)).body
        .added,
    ).toBe(0);
    // The author of one of them already has it.
    expect(
      (
        await other
          .post(`/api/links/${code}/save`)
          .send({ videoIds: [theirs.id, a.id] })
          .expect(200)
      ).body,
    ).toEqual({ added: 1, onShelf: [a.id, theirs.id] });
    const saves = (await notifications(pro)).filter(
      (n) => n.type === 'LINK_SAVED',
    );
    expect(
      saves.map((n) => [n.payload['fromUsername'], n.payload['count']]),
    ).toEqual([
      ['other', 1],
      ['free', 3],
    ]);

    // It stays when the link is over.
    await prisma.shareLink.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await page(free, code).expect(404);
    expect(
      await prisma.videoAccess.count({ where: { holderId: freeId } }),
    ).toBe(3);

    // A block either way refuses it.
    const second = await seed(proId, 'Second');
    const link2 = (await create(pro, { videoIds: [second.id] }).expect(200))
      .body;
    await prisma.block.create({
      data: { blockerId: proId, blockedId: freeId },
    });
    expect(
      (await free.post(`/api/links/${link2.code}/save`).send({}).expect(403))
        .body.code,
    ).toBe('linkBlocked');
  });

  it('videos drop out when gone; nothing left, time up or the sender banned is a 404', async () => {
    const a = await seed(proId, 'Stays');
    const b = await seed(otherId, 'Received');
    await prisma.videoAccess.create({
      data: { videoId: b.id, holderId: proId, source: 'EXCHANGE' },
    });
    const { code, id } = (
      await create(pro, { videoIds: [a.id, b.id] }).expect(200)
    ).body;

    // The sender removed the received copy from their shelf.
    await prisma.videoAccess.delete({
      where: { videoId_holderId: { videoId: b.id, holderId: proId } },
    });
    expect((await page(guest, code).expect(200)).body.count).toBe(1);
    // Its playback stops once the cached decision is gone.
    await guest.post(`/api/links/${code}/videos/${b.id}/playback`).expect(404);

    await prisma.video.update({
      where: { id: a.id },
      data: { deletedAt: new Date() },
    });
    await page(guest, code).expect(404);
    await prisma.video.update({
      where: { id: a.id },
      data: { deletedAt: null },
    });
    await page(guest, code).expect(200);

    await prisma.user.update({
      where: { id: proId },
      data: { status: 'BANNED' },
    });
    await page(guest, code).expect(404);
    await prisma.user.update({
      where: { id: proId },
      data: { status: 'ACTIVE' },
    });

    // Pro ending does not stop it.
    await prisma.user.update({ where: { id: proId }, data: { tier: 'BASIC' } });
    await page(guest, code).expect(200);

    await prisma.shareLink.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await page(guest, code).expect(404);
    // Erased a month after.
    const retention = app.get(RetentionService);
    expect(
      (await retention.sweep(new Date(Date.now() + 29 * DAY))).shareLinks,
    ).toBe(0);
    expect(
      (await retention.sweep(new Date(Date.now() + 31 * DAY))).shareLinks,
    ).toBe(1);
  });

  it('taking a link back cuts its archive being sent; a banned sender too, time running out not', async () => {
    const a = await seed(proId, 'Long');
    const links = app.get(LinksService);
    const open = async () => {
      const { id, code } = (await create(pro, { videoIds: [a.id] }).expect(200))
        .body;
      return { id, body: (await links.zip(code, undefined, null)).body };
    };

    // Taken back: the archive stops at once.
    const revoked = await open();
    await pro.delete(`/api/me/links/${revoked.id}`).expect(204);
    expect(revoked.body.destroyed).toBe(true);

    // Time runs out while it is sent: what began in time is finished.
    const late = await open();
    await prisma.shareLink.update({
      where: { id: late.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    // The sender banned meanwhile: the next look stops both of their archives still sent.
    const banned = await open();
    await new Promise((r) => setTimeout(r, ZIP_RECHECK_MS + 1000));
    expect(late.body.destroyed).toBe(false);
    expect(banned.body.destroyed).toBe(false);
    await prisma.user.update({
      where: { id: proId },
      data: { status: 'BANNED' },
    });
    await vi.waitFor(() => expect(banned.body.destroyed).toBe(true), {
      timeout: ZIP_RECHECK_MS + 2000,
    });
    late.body.destroy();
  });
});

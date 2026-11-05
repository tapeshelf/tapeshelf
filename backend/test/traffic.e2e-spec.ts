import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import type { MailJob } from '../src/infra/queue/queue.types.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { monthWindow } from '../src/modules/downloads/download-rules.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { TrafficService } from '../src/modules/traffic/traffic.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const KEY = 'traffic-test/original.mp4';
const FILE = randomBytes(4096);
/** What the player streams is smaller than the file, as after a transcode. */
const PLAYBACK = 1000;

/**
 * The monthly traffic of an account: a view or a download takes the file's size off it when
 * it starts. Own uploads and repeats cost nothing; a guest spends the traffic of whoever shared the
 * video, a signed-in viewer their own; with nothing left the video neither plays nor downloads.
 */
describe('traffic (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let settings: SettingsService;
  let relay: OutboxRelayService;
  let traffic: TrafficService;
  let queues: QueueService;
  let author: C, viewer: C, pro: C, guest: C;
  let authorId: string, viewerId: string, proId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);
    relay = app.get(OutboxRelayService);
    traffic = app.get(TrafficService);
    queues = app.get(QueueService);
    await app.get(StorageService).put('private', {
      key: KEY,
      body: FILE,
      contentType: 'video/mp4',
    });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    author = client(app);
    viewer = client(app);
    pro = client(app);
    guest = client(app);
    authorId = await signUp(app, author, {
      email: 'author@example.com',
      username: 'author',
      password: 'secret123',
    });
    viewerId = await signUp(app, viewer, {
      email: 'viewer@example.com',
      username: 'viewer',
      password: 'secret123',
    });
    proId = await signUp(app, pro, {
      email: 'pro@example.com',
      username: 'pro',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: proId },
      data: { tier: 'PREMIUM' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function seed(
    authorOf = authorId,
    visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
    playbackBytes: bigint | null = BigInt(PLAYBACK),
  ) {
    return prisma.video.create({
      data: {
        authorId: authorOf,
        title: 'Holiday',
        visibility,
        status: 'READY',
        originalKey: KEY,
        originalFilename: 'holiday.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(FILE.length),
        playbackBytes,
        holdings: { create: { holderId: authorOf, source: 'AUTHOR' } },
      },
    });
  }

  /** Whose traffic is how big, for this test. */
  const limits = (free: number, premium = free) =>
    settings.set('tiers', {
      BASIC: {
        ...SETTING_DEFAULTS.tiers.BASIC,
        downloadSpeedBytesPerSec: 64 * 1024 * 1024,
        trafficBytesPerMonth: free,
      },
      PREMIUM: {
        ...SETTING_DEFAULTS.tiers.PREMIUM,
        trafficBytesPerMonth: premium,
      },
    });

  const play = (c: C, id: string, ip?: string) => {
    const req = c.post(`/api/videos/${id}/playback`);
    return ip ? req.set('X-Forwarded-For', ip) : req;
  };
  const used = async (id: string) =>
    Number(
      (
        await prisma.trafficUsage.findUnique({
          where: {
            userId_month: {
              userId: id,
              month: monthWindow(new Date()).start,
            },
          },
        })
      )?.bytes ?? 0n,
    );
  /** All of this month's traffic spent. */
  const exhaust = (id: string, bytes: number) =>
    prisma.trafficUsage.create({
      data: {
        userId: id,
        month: monthWindow(new Date()).start,
        bytes: BigInt(bytes),
      },
    });

  it('a view costs what the player streams, once a day for one person; the plan shows it', async () => {
    const v = await seed();
    await play(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);
    await play(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);
    expect(await used(authorId)).toBe(0);

    const me = (await viewer.get('/api/auth/me').expect(200)).body;
    expect(me.plan.usage.trafficBytesThisMonth).toBe(PLAYBACK);
    expect(me.plan.limits.trafficBytesPerMonth).toBe(
      SETTING_DEFAULTS.tiers.BASIC.trafficBytesPerMonth,
    );
  });

  it('never twice for one person: not reloads at once, nor after the token ran out', async () => {
    const v = await seed();
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => play(viewer, v.id)),
    );
    expect(answers.map((a) => a.status)).toEqual(Array(8).fill(200));
    expect(await used(viewerId)).toBe(PLAYBACK);

    await play(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);
  });

  it('a guest is the same guest on a new address or without the cookie', async () => {
    const v = await seed();
    // One browser moving from Wi-Fi to mobile data.
    await play(guest, v.id, '203.0.113.1').expect(200);
    await play(guest, v.id, '198.51.100.7').expect(200);
    expect(await used(authorId)).toBe(PLAYBACK);

    // A fresh browser on an address already counted.
    await play(client(app), v.id, '198.51.100.7').expect(200);
    expect(await used(authorId)).toBe(PLAYBACK);

    // Several at once from one guest count once too.
    const third = await seed();
    await Promise.all(
      Array.from({ length: 5 }, () => play(guest, third.id, '203.0.113.9')),
    );
    expect(await used(authorId)).toBe(2 * PLAYBACK);
  });

  it('a different person or another video is counted again', async () => {
    const v = await seed();
    await play(guest, v.id, '203.0.113.1').expect(200);
    await play(client(app), v.id, '203.0.113.2').expect(200);
    expect(await used(authorId)).toBe(2 * PLAYBACK);
  });

  it('a video never measured counts by its file', async () => {
    const v = await seed(authorId, 'PUBLIC', null);
    await play(viewer, v.id).expect(200);
    expect(await used(viewerId)).toBe(FILE.length);
  });

  it('own uploads and an editor’s source cost nothing', async () => {
    const v = await seed();
    await play(author, v.id).expect(200);
    await author.post(`/api/videos/${v.id}/playback?source=true`).expect(200);
    expect(await used(authorId)).toBe(0);
  });

  it('a guest spends the author’s traffic, once a day, and then cannot watch', async () => {
    await limits(2 * PLAYBACK);
    const v = await seed();
    await play(guest, v.id, '203.0.113.1').expect(200);
    await play(guest, v.id, '203.0.113.1').expect(200);
    expect(await used(authorId)).toBe(PLAYBACK);

    // Another guest spends again, up to the limit; with nothing left a new one cannot watch.
    await play(client(app), v.id, '203.0.113.2').expect(200);
    expect(await used(authorId)).toBe(2 * PLAYBACK);
    const refused = await play(client(app), v.id, '203.0.113.3').expect(429);
    expect(refused.body.code).toBe('sharerTrafficLimitReached');
    expect(refused.body.details.resetAt).toBe(
      monthWindow(new Date()).resetAt.toISOString(),
    );
    expect(await used(authorId)).toBe(2 * PLAYBACK);

    // Someone already counted today keeps watching; and so does the author, whatever is left.
    await play(guest, v.id, '203.0.113.1').expect(200);
    await play(author, v.id).expect(200);
  });

  it('with nothing left the viewer’s own traffic stops them, and a refusal costs no later view', async () => {
    await limits(PLAYBACK);
    const a = await seed();
    const b = await seed();
    await play(viewer, a.id).expect(200);
    const refused = await play(viewer, b.id).expect(429);
    expect(refused.body.code).toBe('trafficLimitReached');

    // The next file may start while anything is left, even one bigger than what is left.
    await limits(PLAYBACK + 1);
    await play(viewer, b.id).expect(200);
    expect(await used(viewerId)).toBe(2 * PLAYBACK);
  });

  it('a past month does not count; Pro has its own limit and an admin none', async () => {
    await limits(PLAYBACK, 5 * PLAYBACK);
    const v = await seed();
    await prisma.trafficUsage.create({
      data: {
        userId: viewerId,
        month: new Date(Date.UTC(2020, 0, 1)),
        bytes: BigInt(100 * PLAYBACK),
      },
    });
    await play(viewer, v.id).expect(200);

    await exhaust(proId, 4 * PLAYBACK);
    await play(pro, v.id).expect(200);
    expect(await used(proId)).toBe(5 * PLAYBACK);

    await prisma.user.update({
      where: { id: viewerId },
      data: { role: 'ADMIN' },
    });
    const other = await seed();
    await play(viewer, other.id).expect(200);
    expect(await used(viewerId)).toBe(PLAYBACK);
  });

  it('Pro’s direct download spends the file’s size, a retry nothing; with none left the page says so', async () => {
    await limits(0, FILE.length);
    const v = await seed();
    const first = await pro.post(`/api/videos/${v.id}/download`).expect(200);
    expect(first.body.direct).toBe(true);
    expect(await used(proId)).toBe(FILE.length);

    // Within the hour: a retry, however it comes.
    await pro.post(`/api/videos/${v.id}/download`).expect(200);
    expect(await used(proId)).toBe(FILE.length);
    expect(
      (await pro.get(`/api/downloads/${v.code}`).expect(200)).body,
    ).toMatchObject({ repeat: true, trafficReached: false });

    const other = await seed();
    const page = (await pro.get(`/api/downloads/${other.code}`).expect(200))
      .body;
    expect(page).toMatchObject({
      direct: true,
      trafficReached: true,
    });
    const refused = await pro
      .post(`/api/videos/${other.id}/download`)
      .expect(429);
    expect(refused.body.code).toBe('trafficLimitReached');
    const link = await pro.get(`/api/videos/${other.id}/download`).expect(302);
    expect(link.headers.location).toContain(`/download/${other.code}`);
    expect(await used(proId)).toBe(FILE.length);

    // Their own upload still downloads.
    const mine = await seed(proId);
    await pro.post(`/api/videos/${mine.id}/download`).expect(200);
    expect(await used(proId)).toBe(FILE.length);
  });

  it('Free spends it when the file starts; out of it, the ticket is refused and the count untouched', async () => {
    await limits(FILE.length);
    const v = await seed();
    const t = (await viewer.post(`/api/videos/${v.id}/download`).expect(200))
      .body;
    expect(await used(viewerId)).toBe(0); // a ticket alone counts nothing
    await viewer.get(t.url).expect(200);
    expect(await used(viewerId)).toBe(FILE.length);

    const other = await seed();
    expect(
      (await viewer.get(`/api/downloads/${other.code}`).expect(200)).body,
    ).toMatchObject({ trafficReached: true, limitReached: false });
    const refused = await viewer
      .post(`/api/videos/${other.id}/download`)
      .expect(429);
    expect(refused.body.code).toBe('trafficLimitReached');
    const me = (await viewer.get('/api/auth/me').expect(200)).body;
    expect(me.plan.usage.downloadsThisMonth).toBe(1);
  });

  describe('a temporary link', () => {
    /** A link of the author's with one video, its file and playlists in place. */
    async function link() {
      const video = await seed(authorId, 'PRIVATE');
      const hlsPrefix = `videos/${video.id}/hls/v1`;
      await app.get(StorageService).putMany('private', [
        {
          key: `${hlsPrefix}/master.m3u8`,
          body: '#EXTM3U\n',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ]);
      await prisma.video.update({
        where: { id: video.id },
        data: { hlsPrefix },
      });
      const made = await author
        .post('/api/me/links')
        .send({ ttl: '1d', videoIds: [video.id] })
        .expect(200);
      return { video, code: made.body.code as string };
    }

    it('spends the sender’s traffic for anyone who opens it, not theirs, and not the sender’s own views', async () => {
      const { video, code } = await link();
      const playLink = (c: C) =>
        c.post(`/api/links/${code}/videos/${video.id}/playback`);
      await playLink(guest).set('X-Forwarded-For', '203.0.113.1').expect(200);
      expect(await used(authorId)).toBe(PLAYBACK);
      await playLink(viewer).expect(200);
      expect(await used(authorId)).toBe(2 * PLAYBACK);
      expect(await used(viewerId)).toBe(0);
      await playLink(author).expect(200);
      expect(await used(authorId)).toBe(2 * PLAYBACK);

      // A download costs the file, a retry nothing, a HEAD nothing.
      const download = `/api/links/${code}/videos/${video.id}/download`;
      await viewer.agent.head(download).expect(302);
      expect(await used(authorId)).toBe(2 * PLAYBACK);
      await viewer.get(download).expect(302);
      expect(await used(authorId)).toBe(2 * PLAYBACK + FILE.length);
      await viewer.get(download).expect(302);
      expect(await used(authorId)).toBe(2 * PLAYBACK + FILE.length);
    });

    it('counts the ZIP’s files once; a HEAD spends nothing', async () => {
      const { code } = await link();
      await viewer.agent.head(`/api/links/${code}/zip`).expect(200);
      expect(await used(authorId)).toBe(0);
      await viewer.get(`/api/links/${code}/zip`).expect(200);
      expect(await used(authorId)).toBe(FILE.length);
    });

    it('with the sender’s traffic spent the page says so and nothing plays or downloads; the sender is not stopped', async () => {
      await limits(PLAYBACK);
      const { video, code } = await link();
      await exhaust(authorId, PLAYBACK);
      expect(
        (await viewer.get(`/api/links/${code}`).expect(200)).body
          .senderTrafficReached,
      ).toBe(true);
      expect(
        (await author.get(`/api/links/${code}`).expect(200)).body
          .senderTrafficReached,
      ).toBe(false);

      const refused = await viewer
        .post(`/api/links/${code}/videos/${video.id}/playback`)
        .expect(429);
      expect(refused.body.code).toBe('sharerTrafficLimitReached');
      await viewer
        .get(`/api/links/${code}/videos/${video.id}/download`)
        .expect(429);
      await viewer.get(`/api/links/${code}/zip`).expect(429);

      await author
        .post(`/api/links/${code}/videos/${video.id}/playback`)
        .expect(200);
      await author
        .get(`/api/links/${code}/videos/${video.id}/download`)
        .expect(302);
    });
  });

  describe('the account is told', () => {
    const notes = async (c: C) => {
      await relay.drain();
      return (await c.get('/api/notifications').expect(200)).body.items as {
        type: string;
        payload: Record<string, unknown>;
      }[];
    };
    const row = (id: string) =>
      prisma.trafficUsage.findUniqueOrThrow({
        where: {
          userId_month: { userId: id, month: monthWindow(new Date()).start },
        },
      });
    /** Another guest each time: each view spends the author's traffic again. */
    let address = 1;
    const guestView = (id: string) =>
      play(client(app), id, `203.0.113.${address++}`);

    it('once when four fifths are spent, by the bell; once when all is, by the bell and by mail', async () => {
      await limits(5 * PLAYBACK);
      const v = await seed();
      for (let i = 0; i < 3; i++) await guestView(v.id).expect(200);
      expect(await notes(author)).toEqual([]);

      // The fourth view makes 4000 of 5000: running out.
      await guestView(v.id).expect(200);
      const warned = await notes(author);
      expect(warned.map((n) => n.type)).toEqual(['TRAFFIC_RUNNING_OUT']);
      expect(warned[0]!.payload).toEqual({
        usedBytes: 4 * PLAYBACK,
        limitBytes: 5 * PLAYBACK,
        resetAt: monthWindow(new Date()).resetAt.toISOString(),
      });
      expect((await row(authorId)).warnedAt).not.toBeNull();

      // The fifth spends the rest: used up, and the refusals after it add nothing.
      await guestView(v.id).expect(200);
      await guestView(v.id).expect(429);
      await guestView(v.id).expect(429);
      const all = await notes(author);
      expect(all.map((n) => n.type)).toEqual([
        'TRAFFIC_USED_UP',
        'TRAFFIC_RUNNING_OUT',
      ]);
      expect(all[0]!.payload).toEqual({
        limitBytes: 5 * PLAYBACK,
        resetAt: monthWindow(new Date()).resetAt.toISOString(),
      });
      expect((await row(authorId)).usedUpAt).not.toBeNull();
      // Four fifths went by the bell alone (the default); the end of it also goes by mail.
      const mails = await queues.mail.getJobs([
        'waiting',
        'delayed',
        'prioritized',
      ]);
      expect(mails.map((job) => (job.data as MailJob).type)).toEqual([
        'TRAFFIC_USED_UP',
      ]);
      expect((mails[0]!.data as MailJob).to).toBe('author@example.com');
    });

    it('a limit that shrank under the sum is told on the first refusal, once; a viewer hears of their own', async () => {
      await limits(PLAYBACK);
      // More than the limit already, as after the end of Pro.
      await exhaust(viewerId, 3 * PLAYBACK);
      const v = await seed();
      await play(viewer, v.id).expect(429);
      await play(viewer, v.id).expect(429);
      const told = await notes(viewer);
      expect(told.map((n) => n.type)).toEqual(['TRAFFIC_USED_UP']);
      expect(told[0]!.payload).toMatchObject({ limitBytes: PLAYBACK });
      expect(await notes(author)).toEqual([]);
    });

    it('one charge from under four fifths to the limit says only that it is used up', async () => {
      await limits(PLAYBACK);
      const v = await seed();
      await play(viewer, v.id).expect(200);
      expect((await notes(viewer)).map((n) => n.type)).toEqual([
        'TRAFFIC_USED_UP',
      ]);
    });

    it('an admin and a self-hosted-like account without a limit hear nothing', async () => {
      await limits(PLAYBACK);
      await prisma.user.update({
        where: { id: viewerId },
        data: { role: 'ADMIN' },
      });
      const v = await seed();
      await play(viewer, v.id).expect(200);
      await play(viewer, (await seed()).id).expect(200);
      expect(await notes(viewer)).toEqual([]);
    });
  });

  describe('old months', () => {
    it('the sweep keeps this month and the two before it', async () => {
      const now = new Date(Date.UTC(2026, 10, 4));
      const month = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
      for (const m of [
        month(2026, 10),
        month(2026, 9),
        month(2026, 8),
        month(2026, 7),
        month(2025, 10),
      ])
        await prisma.trafficUsage.create({
          data: { userId: viewerId, month: m, bytes: 1n },
        });
      expect(await traffic.sweep(now)).toBe(2);
      const kept = await prisma.trafficUsage.findMany({
        where: { userId: viewerId },
        orderBy: { month: 'asc' },
      });
      expect(kept.map((r) => r.month.toISOString().slice(0, 7))).toEqual([
        '2026-09',
        '2026-10',
        '2026-11',
      ]);
      expect(await traffic.sweep(now)).toBe(0);
    });
  });
});

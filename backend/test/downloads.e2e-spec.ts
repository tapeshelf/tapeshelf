import type { NestExpressApplication } from '@nestjs/platform-express';
import { type IncomingMessage, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { monthWindow } from '../src/modules/downloads/download-rules.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import {
  CSRF_HEADER,
  client,
  createTestApp,
  resetDatabase,
} from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const KiB = 1024;
const MiB = 1024 * KiB;
const KEY = 'downloads-test/original.mp4';
const BYTES = randomBytes(3 * MiB);
const FILENAME = 'Отпуск 2026.mp4';

/** Collects a binary response body (supertest leaves unknown types unparsed). */
const binary = (
  res: unknown,
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  const stream = res as IncomingMessage;
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * Downloads: the wait page data, one-time
 * tickets, the file streamed through the API byte for byte with resume, the monthly limit with its
 * repeats, one download at a time on Free, the speed limit, and Pro going straight to storage.
 */
describe('downloads (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let settings: SettingsService;
  let port: number;
  let author: C, free: C, pro: C, guest: C;
  let authorId: string, freeId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    await app.get(StorageService).put('private', {
      key: KEY,
      body: BYTES,
      contentType: 'video/mp4',
    });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    author = client(app);
    free = client(app);
    pro = client(app);
    guest = client(app);
    authorId = await signUp(app, author, {
      email: 'author@example.com',
      username: 'author',
      password: 'secret123',
    });
    freeId = await signUp(app, free, {
      email: 'free@example.com',
      username: 'free',
      password: 'secret123',
    });
    const proId = await signUp(app, pro, {
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

  /** Free limits with a speed that keeps the test quick unless a test wants it slow. */
  const freeLimits = (
    over: Partial<(typeof SETTING_DEFAULTS.tiers)['BASIC']> = {},
  ) =>
    settings.set('tiers', {
      ...SETTING_DEFAULTS.tiers,
      BASIC: {
        ...SETTING_DEFAULTS.tiers.BASIC,
        downloadSpeedBytesPerSec: 64 * MiB,
        ...over,
      },
    });

  async function seed(visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC') {
    return prisma.video.create({
      data: {
        authorId,
        title: 'Holiday',
        visibility,
        status: 'READY',
        originalKey: KEY,
        originalFilename: FILENAME,
        mimeType: 'video/mp4',
        sizeBytes: BigInt(BYTES.length),
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
  }

  const info = (c: C, code: string) => c.get(`/api/downloads/${code}`);
  const ticket = (c: C, videoId: string) =>
    c.post(`/api/videos/${videoId}/download`);
  const fetchFile = (c: C, url: string, range?: string) => {
    const req = c.agent.get(url).buffer(true).parse(binary);
    return range ? req.set('Range', range) : req;
  };
  const usage = async (c: C) =>
    (await c.get('/api/auth/me').expect(200)).body.plan.usage as {
      downloadsThisMonth: number;
      downloadsResetAt: string;
    };

  it('the wait page knows the limits; guests and those who may not watch are refused', async () => {
    const pub = await seed();
    const priv = await seed('PRIVATE');
    await info(guest, pub.code).expect(401);
    expect((await info(free, priv.code).expect(403)).body.code).toBe(
      'downloadNotAllowed',
    );
    await info(free, 'zzzzzz9').expect(404);
    await info(free, 'not-a-code').expect(404);

    expect((await info(free, pub.code).expect(200)).body).toEqual({
      videoId: pub.id,
      code: pub.code,
      title: 'Holiday',
      sizeBytes: BYTES.length,
      thumbnailUrl: null,
      sensitive: false,
      direct: false,
      limit: 10,
      used: 0,
      resetAt: monthWindow(new Date()).resetAt.toISOString(),
      speedBytesPerSec: 1 * MiB,
      concurrency: 1,
      repeat: false,
      own: false,
      busy: false,
      limitReached: false,
      trafficReached: false,
      waitSec: 5,
    });
    expect((await info(pro, pub.code).expect(200)).body).toMatchObject({
      direct: true,
      limit: 0,
      speedBytesPerSec: 0,
      waitSec: 0,
    });
  });

  it('a ticket streams the original byte for byte, counts once, and resumes with Range', async () => {
    await freeLimits();
    const v = await seed();
    const t = (await ticket(free, v.id).expect(200)).body;
    // The name it is saved under, for an app that saves it itself (M10).
    expect(t).toMatchObject({ direct: false, filename: FILENAME });
    expect(t.url).toMatch(
      new RegExp(`^/api/videos/${v.id}/download/file\\?t=`),
    );

    const res = await fetchFile(free, t.url).expect(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-length']).toBe(String(BYTES.length));
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="_ 2026.mp4"; filename*=UTF-8''${encodeURIComponent(FILENAME)}`,
    );
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
    expect(await usage(free)).toMatchObject({ downloadsThisMonth: 1 });

    // The same ticket again: only to resume, from where the file broke off.
    expect((await free.get(t.url).expect(409)).body.code).toBe(
      'downloadTicketUsed',
    );
    const part = await fetchFile(free, t.url, 'bytes=1000-').expect(206);
    expect(part.headers['content-range']).toBe(
      `bytes 1000-${BYTES.length - 1}/${BYTES.length}`,
    );
    expect((part.body as Buffer).equals(BYTES.subarray(1000))).toBe(true);

    // Someone else's session, a forged ticket.
    expect((await pro.get(t.url).expect(403)).body.code).toBe(
      'downloadTicketInvalid',
    );
    expect(
      (await free.get(`/api/videos/${v.id}/download/file?t=x.y`).expect(403))
        .body.code,
    ).toBe('downloadTicketInvalid');
    await guest.get(t.url).expect(401);

    // Again within the hour: a retry, not another download.
    expect((await info(free, v.code).expect(200)).body).toMatchObject({
      repeat: true,
      used: 1,
    });
    const again = (await ticket(free, v.id).expect(200)).body;
    await fetchFile(free, again.url).expect(200);
    expect(await usage(free)).toMatchObject({ downloadsThisMonth: 1 });
    expect(
      (
        await prisma.downloadEvent.findMany({ orderBy: { startedAt: 'asc' } })
      ).map((e) => [e.userId, e.tier, e.counted]),
    ).toEqual([
      [freeId, 'BASIC', true],
      [freeId, 'BASIC', false],
    ]);
  });

  it('ten counted downloads a month, then 429 with the reset date; repeats and last month do not count', async () => {
    await freeLimits();
    const [a, b, c] = [await seed(), await seed(), await seed()];
    const now = Date.now();
    const lastMonth = new Date(
      monthWindow(new Date()).start.getTime() - 3600 * 1000,
    );
    await prisma.downloadEvent.createMany({
      data: [
        ...Array.from({ length: 9 }, () => ({
          userId: freeId,
          videoId: a.id,
          tier: 'BASIC' as const,
          counted: true,
          startedAt: new Date(
            Math.max(
              now - 2 * 3600 * 1000,
              monthWindow(new Date()).start.getTime(),
            ),
          ),
        })),
        {
          userId: freeId,
          videoId: b.id,
          tier: 'BASIC',
          counted: true,
          startedAt: new Date(now - 10 * 60 * 1000),
        },
        {
          userId: freeId,
          videoId: c.id,
          tier: 'BASIC',
          counted: true,
          startedAt: lastMonth,
        },
      ],
    });
    expect(await usage(free)).toMatchObject({ downloadsThisMonth: 10 });
    expect((await info(free, c.code).expect(200)).body).toMatchObject({
      used: 10,
      limitReached: true,
      repeat: false,
    });
    const refused = (await ticket(free, c.id).expect(429)).body;
    expect(refused.code).toBe('downloadLimitReached');
    expect(refused.details).toEqual({
      limit: 10,
      used: 10,
      resetAt: monthWindow(new Date()).resetAt.toISOString(),
    });

    // b was downloaded ten minutes ago: a repeat still works and does not count.
    expect((await info(free, b.code).expect(200)).body).toMatchObject({
      repeat: true,
      limitReached: false,
    });
    const t = (await ticket(free, b.id).expect(200)).body;
    await fetchFile(free, t.url).expect(200);
    expect(await usage(free)).toMatchObject({ downloadsThisMonth: 10 });

    // Pro has no monthly limit at all.
    expect((await ticket(pro, c.id).expect(200)).body.direct).toBe(true);
  });

  it('the author’s own uploads never count, even at the limit; videos received from others do', async () => {
    await freeLimits();
    const own = await seed();
    const theirs = await prisma.video.create({
      data: {
        authorId: freeId,
        title: 'Shared with the author',
        visibility: 'PRIVATE',
        status: 'READY',
        originalKey: KEY,
        originalFilename: 'shared.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(BYTES.length),
        holdings: {
          create: [
            { holderId: freeId, source: 'AUTHOR' },
            { holderId: authorId, source: 'SHARE' },
          ],
        },
      },
    });
    await prisma.downloadEvent.createMany({
      data: Array.from({ length: 10 }, () => ({
        userId: authorId,
        videoId: theirs.id,
        tier: 'BASIC' as const,
        counted: true,
        startedAt: new Date(
          Math.max(
            Date.now() - 2 * 3600 * 1000,
            monthWindow(new Date()).start.getTime(),
          ),
        ),
      })),
    });
    expect((await info(author, own.code).expect(200)).body).toMatchObject({
      own: true,
      used: 10,
      limitReached: false,
    });
    const t = (await ticket(author, own.id).expect(200)).body;
    await fetchFile(author, t.url).expect(200);
    expect(
      await prisma.downloadEvent.count({
        where: { userId: authorId, videoId: own.id, counted: false },
      }),
    ).toBe(1);
    expect(await usage(author)).toMatchObject({ downloadsThisMonth: 10 });

    // Received from someone else: counted, so over the limit.
    expect((await info(author, theirs.code).expect(200)).body).toMatchObject({
      own: false,
      limitReached: true,
    });
    expect((await ticket(author, theirs.id).expect(429)).body.code).toBe(
      'downloadLimitReached',
    );
  });

  it('one download at a time on Free: a second waits until the first ends', async () => {
    await freeLimits({ downloadSpeedBytesPerSec: 64 * KiB }); // 3 MiB takes ~48 s
    const [a, b] = [await seed(), await seed()];
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ email: 'free@example.com', password: 'secret123' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const first = (await ticket(free, a.id).expect(200)).body.url as string;

    const running = await new Promise<{
      res: IncomingMessage;
      abort: () => void;
    }>((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path: first, headers: { cookie } },
        (res) => {
          res.once('data', () => resolve({ res, abort: () => req.destroy() }));
        },
      );
      req.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
      });
      req.end();
    });
    expect(running.res.statusCode).toBe(200);
    expect((await info(free, b.code).expect(200)).body.busy).toBe(true);
    expect((await ticket(free, b.id).expect(429)).body.code).toBe(
      'downloadBusy',
    );
    // Pro has no such limit and another user has a slot of their own.
    await ticket(pro, b.id).expect(200);

    running.abort();
    await expect
      .poll(async () => (await ticket(free, b.id)).status, { timeout: 5000 })
      .toBe(200);
  });

  it('Free is throttled to its speed; Pro and admins get the original from storage at once', async () => {
    await freeLimits({ downloadSpeedBytesPerSec: 2 * MiB }); // 3 MiB: about 1.5 s
    const v = await seed();
    const t = (await ticket(free, v.id).expect(200)).body;
    const started = Date.now();
    const res = await fetchFile(free, t.url).expect(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1300);
    expect((res.body as Buffer).equals(BYTES)).toBe(true);

    const direct = (await ticket(pro, v.id).expect(200)).body;
    expect(direct.url).toMatch(/X-Amz-Signature=/);
    const file = await fetch(direct.url);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).equals(BYTES)).toBe(true);
    // Logged, never counted.
    expect(
      await prisma.downloadEvent.count({
        where: { tier: 'PREMIUM', counted: false },
      }),
    ).toBe(1);
  });
});

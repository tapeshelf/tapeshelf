import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { DEMO_ACCOUNT, DemoService } from '../src/modules/demo/demo.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { clearMailbox, waitForMail } from './utils/mailpit.js';
import { signUp } from './utils/users.js';

// The other suites run as the cloud without the demo. The environment is validated when the app
// module is imported, so the switch has to happen before the imports above run.
vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
  process.env.EDITION = 'community';
});

/**
 * The public demo: its account in the banner, sign-up without the confirmation email and
 * no email at all, and the daily reset — everything erased, the admin and the demo account with
 * its videos and small limits seeded again.
 */
describe('demo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
    process.env.DEMO_MODE = 'false';
    process.env.EDITION = 'cloud';
  });

  it('shows its account; a sign-up is confirmed at once and nothing is mailed', async () => {
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body.demo).toEqual({
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
    });

    await clearMailbox();
    const c = client(app);
    await c
      .post('/api/auth/register')
      .send({
        email: 'visitor@example.com',
        username: 'visitor',
        password: 'secret123',
      })
      .expect(200);
    expect((await c.get('/api/auth/me').expect(200)).body.emailVerified).toBe(
      true,
    );
    await expect(waitForMail('visitor@example.com', '', 1500)).rejects.toThrow(
      /No mail/,
    );
  });

  it('has no support: its visitors write to the site’s address', async () => {
    const c = client(app);
    await signUp(app, c, {
      email: 'sup@example.com',
      username: 'sup',
      password: 'secret123',
    });
    await c.get('/api/support/tickets').expect(404);
    await c.get('/api/support/summary').expect(404);
  });

  it('the daily reset erases everything and seeds the demo shelf again', async () => {
    const storage = app.get(StorageService);
    const queues = app.get(QueueService);
    await storage.put('public', {
      key: 'avatars/old.webp',
      body: Buffer.from('x'),
      contentType: 'image/webp',
    });
    expect(await prisma.user.count({ where: { username: 'visitor' } })).toBe(1);

    const result = await app.get(DemoService).reset();
    expect(result.videos).toBe(3);

    const users = await prisma.user.findMany({
      select: { username: true, role: true },
    });
    expect(users.map((u) => u.username).sort()).toEqual(['admin', 'demo']);
    expect(await storage.head('public', 'avatars/old.webp')).toBeNull();

    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_ACCOUNT.email },
      include: { videos: true },
    });
    expect(demo.emailVerifiedAt).not.toBeNull();
    expect(demo.videos.map((v) => v.status)).toEqual([
      'QUEUED',
      'QUEUED',
      'QUEUED',
    ]);
    expect(demo.videos.filter((v) => v.visibility === 'PUBLIC')).toHaveLength(
      2,
    );
    for (const v of demo.videos) {
      expect(await storage.head('private', v.originalKey)).not.toBeNull();
      // The seed is not held to the limits of what visitors upload.
      expect((await queues.remux.getJob(v.id))?.data.seed).toBe(true);
    }
    expect(Number(demo.storageUsedBytes)).toBe(
      demo.videos.reduce((n, v) => n + Number(v.sizeBytes), 0),
    );
    expect(await app.get(SettingsService).get('limits')).toMatchObject({
      storageQuotaBytes: 1024 ** 3,
    });

    // The demo account signs in with the password from the banner.
    await client(app)
      .post('/api/auth/login')
      .send({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
      .expect(200);
  }, 60_000); // ffmpeg draws the three demo clips: most of the default 20 s on a busy machine
});

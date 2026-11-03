import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { clearMailbox } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

// The environment is validated when the app's module is imported, so the switch has to happen
// before the imports above run.
vi.hoisted(() => {
  process.env.EMAIL_DISABLED = 'true';
});

/** An instance without an email account: a link for one person cannot work by mail there. */
describe('temporary links where no mail goes out (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
    await clearMailbox();
  });

  afterAll(async () => {
    await app.close();
    process.env.EMAIL_DISABLED = 'false';
  });

  it('none is made for one person, an old one has no code to send and no address to claim', async () => {
    const sender = client(app);
    const senderId = await signUp(app, sender, {
      email: 'sender@example.com',
      username: 'sender',
      password: 'secret123',
    });
    const video = await prisma.video.create({
      data: {
        authorId: senderId,
        title: 'Clip',
        visibility: 'PRIVATE',
        status: 'READY',
        originalKey: 'pending',
        originalFilename: 'Clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 0n,
        durationSec: 10,
        width: 1280,
        height: 720,
        hlsPrefix: 'pending',
        holdings: { create: { holderId: senderId, source: 'AUTHOR' } },
      },
    });

    const refused = await sender
      .post('/api/me/links')
      .send({ ttl: '1d', videoIds: [video.id], email: 'friend@example.com' })
      .expect(409);
    expect(refused.body.code).toBe('linkEmailOff');
    expect(await prisma.shareLink.count()).toBe(0);

    // Without an address it is made as anywhere.
    await sender
      .post('/api/me/links')
      .send({ ttl: '1d', videoIds: [video.id] })
      .expect(200);

    // One made before the mail was turned off: it stays closed.
    const old = await prisma.shareLink.create({
      data: {
        code: 'mademail0001',
        senderId,
        expiresAt: new Date(Date.now() + 3_600_000),
        email: 'friend@example.com',
        items: { create: { videoId: video.id, position: 0 } },
      },
    });
    const guest = client(app);
    const page = await guest.get(`/api/links/${old.code}`).expect(200);
    expect(page.body).toMatchObject({ access: 'locked', needsCode: true });
    const code = await guest.post(`/api/links/${old.code}/code`).expect(409);
    expect(code.body.code).toBe('linkEmailOff');

    // A sign-up is confirmed at once here: taking that address opens nothing.
    const claimant = client(app);
    await signUp(app, claimant, {
      email: 'friend@example.com',
      username: 'friend',
      password: 'secret123',
    });
    expect(
      (await claimant.get(`/api/links/${old.code}`).expect(200)).body.access,
    ).toBe('locked');

    // The sender still sees their own.
    expect(
      (await sender.get(`/api/links/${old.code}`).expect(200)).body.access,
    ).toBe('open');
  });
});

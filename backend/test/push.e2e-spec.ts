import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Server, createServer } from 'node:http';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { PushService } from '../src/modules/notifications/push.service.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

const FCM_PORT = 3397;

// The other suites run without push (no key in .env.test). The environment is validated when the
// app module is imported, so the key is made before the imports run: a fresh RSA key, a stand-in
// for Google's token endpoint and FCM on this port.
vi.hoisted(() => {
  const { generateKeyPairSync } = process.getBuiltinModule('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const account = {
    type: 'service_account',
    project_id: 'shelf-test',
    client_email: 'sender@example.com',
    private_key: privateKey,
    token_uri: 'http://127.0.0.1:3397/token',
  };
  // In base64, as one line in a deployment's settings.
  process.env.FCM_SERVICE_ACCOUNT = Buffer.from(
    JSON.stringify(account),
  ).toString('base64');
  process.env.FCM_API_URL = 'http://127.0.0.1:3397';
});

type C = ReturnType<typeof client>;
interface Sent {
  auth: string | undefined;
  token: string;
  data: Record<string, string>;
  priority: string;
}

/**
 * Push to the phone app (S3): devices belong to sessions, news is written down for them and
 * only its id goes to Google; the phone reads it with its device key.
 */
describe('push (e2e)', () => {
  let app: NestExpressApplication;
  let fcm: Server;
  let prisma: PrismaService;
  let queues: QueueService;
  let notifications: NotificationsService;
  let push: PushService;
  const sent: Sent[] = [];
  let tokenRequests = 0;
  let ann: C, bob: C;
  let annId: string, bobId: string;

  beforeAll(async () => {
    fcm = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/token') {
          tokenRequests++;
          const form = new URLSearchParams(body);
          const ok =
            form.get('grant_type') ===
              'urn:ietf:params:oauth:grant-type:jwt-bearer' &&
            (form.get('assertion') ?? '').split('.').length === 3;
          res.writeHead(ok ? 200 : 400);
          res.end(
            JSON.stringify(
              ok ? { access_token: 'access-1', expires_in: 3600 } : {},
            ),
          );
          return;
        }
        const message = (
          JSON.parse(body) as {
            message: {
              token: string;
              data: Record<string, string>;
              android: { priority: string };
            };
          }
        ).message;
        sent.push({
          auth: req.headers.authorization,
          token: message.token,
          data: message.data,
          priority: message.android.priority,
        });
        if (message.token.startsWith('gone')) {
          res.writeHead(404);
          res.end(
            JSON.stringify({
              error: {
                code: 404,
                status: 'NOT_FOUND',
                details: [{ errorCode: 'UNREGISTERED' }],
              },
            }),
          );
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ name: 'projects/shelf-test/messages/1' }));
      });
    });
    await new Promise<void>((r) => fcm.listen(FCM_PORT, '127.0.0.1', r));
    app = await createTestApp();
    prisma = app.get(PrismaService);
    queues = app.get(QueueService);
    notifications = app.get(NotificationsService);
    push = app.get(PushService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await queues.push.drain(true);
    await queues.mail.drain(true);
    sent.length = 0;
    ann = client(app);
    bob = client(app);
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
    await new Promise<void>((r) => fcm.close(() => r()));
    delete process.env.FCM_SERVICE_ACCOUNT;
    delete process.env.FCM_API_URL;
  });

  const register = (c: C, token: string | null = 'tok-ann') =>
    c
      .put('/api/me/device')
      .send({ platform: 'android', token })
      .expect(200)
      .then((r) => r.body.key as string);
  const pushJobs = async () =>
    (await queues.push.getJobs(['waiting', 'delayed', 'prioritized'])).map(
      (j) => j.data.pushId,
    );
  /** What the worker does with each waiting signal. */
  const drain = async () => {
    for (const id of await pushJobs()) await push.deliver(id);
    await queues.push.drain(true);
  };
  const readPush = (key: string | null, path = '') => {
    const r = request(app.getHttpServer()).get(`/api/device/pushes${path}`);
    return key ? r.set('X-Tapeshelf-Device', key) : r;
  };

  it('the server says it pushes', async () => {
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body.push).toBe(true);
  });

  it('a phone registers for its session and is listed; the web sees it', async () => {
    const key = await register(ann);
    expect(key).toMatch(/^[\w-]{43}$/);
    const devices = await ann.get('/api/me/devices').expect(200);
    expect(devices.body).toEqual([
      expect.objectContaining({
        platform: 'android',
        push: true,
        current: true,
        client: null,
      }),
    ]);
    // Registering again (the next start) keeps one device, with a new key.
    const again = await register(ann);
    expect(again).not.toBe(key);
    expect((await ann.get('/api/me/devices').expect(200)).body).toHaveLength(1);
    await readPush(key).expect(401);
    await readPush(again).expect(200);
    // Nobody else's.
    expect((await bob.get('/api/me/devices').expect(200)).body).toEqual([]);
    // The extension's token, or a guest, cannot register a phone.
    await request(app.getHttpServer())
      .put('/api/me/device')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ platform: 'android' })
      .expect(401);
    await ann.put('/api/me/device').send({ platform: 'web' }).expect(400);
  });

  it('news goes to the phone as an id; the phone reads the rest with its key, in order, only its own', async () => {
    const key = await register(ann);
    await notifications.deliver(annId, 'ADMIN_NOTICE', {
      message: 'Maintenance tonight',
    });
    const [pushId] = await pushJobs();
    expect(pushId).toBeDefined();
    await drain();
    expect(sent).toEqual([
      {
        auth: 'Bearer access-1',
        token: 'tok-ann',
        data: { push: pushId },
        priority: 'HIGH',
      },
    ]);

    const read = await readPush(key, `/${pushId}`).expect(200);
    expect(read.body).toEqual({
      id: pushId,
      type: 'ADMIN_NOTICE',
      payload: { message: 'Maintenance tonight' },
      // The bell has it too.
      notificationId: expect.any(String),
      createdAt: expect.any(String),
    });
    const bell = await ann.get('/api/notifications').expect(200);
    expect(read.body.notificationId).toBe(bell.body.items[0].id);

    await notifications.deliver(annId, 'VIDEO_PROCESSED', {
      videoId: '01a1ac35-0000-7000-8000-000000000001',
      videoCode: 'abc2def',
      title: 'Harbour',
    });
    const all = await readPush(key).expect(200);
    expect(all.body.map((p: { type: string }) => p.type)).toEqual([
      'ADMIN_NOTICE',
      'VIDEO_PROCESSED',
    ]);
    const after = await readPush(key, `?after=${pushId}`).expect(200);
    expect(after.body.map((p: { type: string }) => p.type)).toEqual([
      'VIDEO_PROCESSED',
    ]);

    // Without a key, with a wrong one, or someone else's push.
    await readPush(null, `/${pushId}`).expect(401);
    await readPush('not-a-key', `/${pushId}`).expect(401);
    const bobKey = await register(bob, 'tok-bob');
    await readPush(bobKey, `/${pushId}`).expect(404);
    // One access token for many signals.
    expect(tokenRequests).toBe(1);
  });

  it('only the types switched on for push, and nothing for someone without a phone', async () => {
    await notifications.deliver(bobId, 'ADMIN_NOTICE', { message: 'Hi' });
    expect(await prisma.pushMessage.count()).toBe(0);

    await register(ann);
    // A new follower only rings the bell by default.
    await notifications.deliver(annId, 'NEW_FOLLOWER', {
      userId: bobId,
      fromName: 'bob',
      fromUsername: 'bob',
    });
    expect(await prisma.pushMessage.count()).toBe(0);

    const prefs = await ann.get('/api/me/notification-preferences').expect(200);
    const follower = prefs.body.find(
      (p: { type: string }) => p.type === 'NEW_FOLLOWER',
    );
    expect(follower).toEqual({
      type: 'NEW_FOLLOWER',
      inApp: true,
      email: false,
      push: false,
    });
    await ann
      .put('/api/me/notification-preferences')
      .send({
        items: [
          { type: 'NEW_FOLLOWER', inApp: false, email: false, push: true },
        ],
      })
      .expect(200);
    await notifications.deliver(annId, 'NEW_FOLLOWER', {
      userId: bobId,
      fromName: 'bob',
      fromUsername: 'bob',
    });
    // Pushed, though the bell has nothing of it (only the follower from before the change).
    const [message] = await prisma.pushMessage.findMany();
    expect(message).toMatchObject({
      type: 'NEW_FOLLOWER',
      notificationId: null,
    });
    expect(
      (await ann.get('/api/notifications').expect(200)).body.items,
    ).toHaveLength(1);

    // The web, which does not know push, leaves it as it is.
    await ann
      .put('/api/me/notification-preferences')
      .send({ items: [{ type: 'NEW_FOLLOWER', inApp: true, email: false }] })
      .expect(200);
    const kept = (
      await ann.get('/api/me/notification-preferences').expect(200)
    ).body.find((p: { type: string }) => p.type === 'NEW_FOLLOWER');
    expect(kept.push).toBe(true);
  });

  it('a phone the app was removed from stops getting signals', async () => {
    await register(ann, 'gone-1');
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'Hi' });
    await drain();
    expect(sent).toHaveLength(1);
    const device = await prisma.device.findFirstOrThrow();
    expect(device.token).toBeNull();
    // Still a phone of the account (it may ask for news itself), with no signal to send.
    expect((await ann.get('/api/me/devices').expect(200)).body[0].push).toBe(
      false,
    );
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'Again' });
    expect(await pushJobs()).toEqual([]);
  });

  it('a phone signed in again is one phone: the new session’s', async () => {
    await register(ann, 'tok-phone');
    const again = client(app);
    await again
      .post('/api/auth/login')
      .send({ email: 'ann@example.com', password: 'secret123' })
      .expect(200);
    await register(again, 'tok-phone');
    const devices = await again.get('/api/me/devices').expect(200);
    expect(devices.body).toEqual([
      expect.objectContaining({ current: true, push: true }),
    ]);
  });

  it('a signed-out phone is skipped and its key refused', async () => {
    const key = await register(ann);
    await ann.post('/api/auth/logout').expect(200);
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'Hi' });
    expect(await prisma.pushMessage.count()).toBe(0);
    await readPush(key).expect(401);
  });

  it('a phone without push signals asks for news itself; it gets what came after it registered', async () => {
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'Before' });
    const key = await register(ann, null);
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'After' });
    expect(await pushJobs()).toEqual([]);
    const news = await readPush(key).expect(200);
    expect(
      news.body.map((p: { payload: { message: string } }) => p.payload.message),
    ).toEqual(['After']);
  });

  describe('the email of a chat message', () => {
    const message = () =>
      notifications.deliver(annId, 'NEW_MESSAGE', {
        conversationId: '01a1ac35-0000-7000-8000-00000000000c',
        fromUserId: bobId,
        fromName: 'bob',
        fromUsername: 'bob',
        preview: 'Hello there',
        hasVideo: false,
        count: 1,
      });
    const mails = async () =>
      (await queues.mail.getJobs(['waiting', 'delayed'])).filter(
        (j) => 'type' in j.data && j.data.type === 'NEW_MESSAGE',
      ).length;

    it('is not sent when a push of messages reaches a phone', async () => {
      await register(ann);
      await message();
      expect(await mails()).toBe(0);
      expect(await pushJobs()).toHaveLength(1);
    });

    it('is sent as before without a phone, with push of messages off, or to a phone without signals', async () => {
      await message();
      expect(await mails()).toBe(1);

      await resetDatabase(app);
      await queues.mail.drain(true);
      ann = client(app);
      annId = await signUp(app, ann, {
        email: 'ann@example.com',
        username: 'ann',
        password: 'secret123',
      });
      await register(ann, null);
      await message();
      expect(await mails()).toBe(1);
    });
  });

  it('pushes are kept a week', async () => {
    await register(ann);
    await notifications.deliver(annId, 'ADMIN_NOTICE', { message: 'Hi' });
    await prisma.pushMessage.updateMany({
      data: { createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
    });
    const swept = await app.get(RetentionService).sweep();
    expect(swept.pushMessages).toBe(1);
  });
});

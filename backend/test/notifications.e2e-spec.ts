import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { QueueService } from '../src/infra/queue/queue.service.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module.js';
import {
  WS_CHANNEL,
  type UserEventMessage,
} from '../src/infra/ws/ws-events.js';
import { NotificationMailer } from '../src/modules/notifications/notification-mailer.js';
import {
  EXCHANGE_CHANGED_WS_EVENT,
  NotificationsService,
} from '../src/modules/notifications/notifications.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { clearMailbox, waitForMail } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

/**
 * the transactional outbox and notification delivery:
 * rollback leaves no trace, committed events become rows + websocket pushes + emails per preference.
 */
describe('notifications and outbox (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let queues: QueueService;
  let relay: OutboxRelayService;
  let mailer: NotificationMailer;
  let subscriber: Redis;
  let published: UserEventMessage[] = [];
  let author: C, holder: C, other: C;
  let authorId: string, holderId: string, otherId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    queues = app.get(QueueService);
    relay = app.get(OutboxRelayService);
    mailer = app.get(NotificationMailer);
    subscriber = app.get<Redis>(REDIS_CLIENT).duplicate();
    subscriber.on('message', (_c: string, raw: string) =>
      published.push(JSON.parse(raw) as UserEventMessage),
    );
    await subscriber.subscribe(WS_CHANNEL);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await queues.mail.drain(true);
    published = [];
    author = client(app);
    holder = client(app);
    other = client(app);
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
    otherId = await signUp(app, other, {
      email: 'other@example.com',
      username: 'other',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await subscriber.quit();
    await app.close();
  });

  async function seed(ownerId: string, title: string) {
    return prisma.video.create({
      data: {
        authorId: ownerId,
        title,
        status: 'READY',
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        holdings: { create: { holderId: ownerId, source: 'AUTHOR' } },
      },
    });
  }

  const settle = () => new Promise((r) => setTimeout(r, 100));

  /** Processes whatever the relay queued for email, the way the worker would. */
  async function sendQueuedMail(): Promise<number> {
    const jobs = await queues.mail.getJobs([
      'waiting',
      'delayed',
      'prioritized',
    ]);
    for (const job of jobs) {
      await mailer.sendJob(job.data);
      await job.remove();
    }
    return jobs.length;
  }

  it('a rolled-back transaction leaves no event; a committed one becomes a notification and a push', async () => {
    const video = await seed(authorId, 'clip');
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.outboxEvent.create({
          data: {
            type: 'video.processed',
            payload: { videoId: video.id, authorId, title: 'ghost' },
          },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await relay.drain()).toBe(0);

    await prisma.outboxEvent.create({
      data: {
        type: 'video.processed',
        payload: { videoId: video.id, authorId, title: 'clip' },
      },
    });
    expect(await relay.drain()).toBe(1);
    const event = await prisma.outboxEvent.findFirstOrThrow();
    expect(event.processedAt).not.toBeNull();
    expect(event.attempts).toBe(1);

    const list = (await author.get('/api/notifications').expect(200)).body;
    expect(list.unreadCount).toBe(1);
    expect(list.items[0]).toMatchObject({
      type: 'VIDEO_PROCESSED',
      payload: { videoId: video.id, title: 'clip' },
      readAt: null,
    });
    await settle();
    expect(published.map((m) => [m.userId, m.event])).toEqual([
      [authorId, 'notification.new'],
      [authorId, 'notification.unread'],
    ]);
    expect(published[1]!.payload).toEqual({ count: 1 });
    // Processed events are not delivered twice.
    expect(await relay.drain()).toBe(0);
    expect(await prisma.notification.count()).toBe(1);
    // VIDEO_PROCESSED is in-app only by default: no email queued.
    expect(await queues.mail.getJobCounts('waiting', 'delayed')).toMatchObject({
      waiting: 0,
    });
  });


  it('deleting a video notifies every other holder, not the deleter; bulk delete too', async () => {
    const shared = await seed(authorId, 'shared');
    const second = await seed(authorId, 'second');
    await prisma.videoAccess.createMany({
      data: [
        { videoId: shared.id, holderId, source: 'EXCHANGE' },
        { videoId: shared.id, holderId: otherId, source: 'SHARE' },
        { videoId: second.id, holderId, source: 'SHARE' },
      ],
    });
    await author.delete(`/api/videos/${shared.id}`).expect(200);
    const events = await prisma.outboxEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      videoId: shared.id,
      title: 'shared',
      authorName: 'author',
      deletedById: authorId,
    });
    expect(
      (events[0]!.payload as { holderIds: string[] }).holderIds.sort(),
    ).toEqual([holderId, otherId].sort());
    await relay.drain();
    expect(
      (await holder.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(1);
    expect(
      (await other.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(1);
    expect(
      (await author.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(0);
    const n = (await holder.get('/api/notifications').expect(200)).body
      .items[0];
    expect(n).toMatchObject({
      type: 'VIDEO_REMOVED',
      payload: { videoId: shared.id, title: 'shared', authorName: 'author' },
    });

    // Bulk delete of a video nobody else holds produces no event; one with a holder does.
    const lonely = await seed(authorId, 'lonely');
    await author
      .post('/api/me/collection/videos/delete')
      .send({ videoIds: [second.id, lonely.id] })
      .expect(200);
    const after = await prisma.outboxEvent.findMany({
      where: { processedAt: null },
    });
    expect(after).toHaveLength(1);
    expect(after[0]!.payload).toMatchObject({
      videoId: second.id,
      holderIds: [holderId],
    });
    await relay.drain();
    expect(
      (await holder.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(2);
  });

  it('preferences decide the channels; emails go out in the recipient’s locale', async () => {
    await clearMailbox();
    const defaults = (
      await author.get('/api/me/notification-preferences').expect(200)
    ).body;
    // No "new video of someone I follow" any more: "What's new" shows those; a moderator's
    // edit of one's video is told, and an edit that did not work out; support
    // answers — a new ticket is told only to admins; a temporary link opened or saved.
    expect(defaults).toHaveLength(24);
    expect(defaults.map((d: { type: string }) => d.type)).not.toContain(
      'SUPPORT_TICKET',
    );
    expect(defaults.map((d: { type: string }) => d.type)).not.toContain(
      'FOLLOWED_NEW_VIDEO',
    );
    expect(defaults).toEqual(
      expect.arrayContaining([
        { type: 'REQUEST_RECEIVED', inApp: true, email: true },
        { type: 'REQUEST_CANCELLED', inApp: true, email: false },
        { type: 'VIDEO_PROCESSED', inApp: true, email: false },
        { type: 'VIDEO_FAILED', inApp: true, email: true },
        { type: 'VIDEO_REMOVED', inApp: true, email: false },
      ]),
    );
    await author
      .put('/api/me/notification-preferences')
      .send({ items: [{ type: 'VIDEO_PROCESSED', inApp: false, email: true }] })
      .expect(200);
    await author
      .put('/api/me/notification-preferences')
      .send({ items: [{ type: 'NOPE', inApp: true, email: true }] })
      .expect(400);
    await author.patch('/api/me').send({ locale: 'ru' }).expect(200);
    const video = await seed(authorId, 'Отпуск');

    await prisma.outboxEvent.create({
      data: {
        type: 'video.processed',
        payload: { videoId: video.id, authorId, title: 'Отпуск' },
      },
    });
    await relay.drain();
    // in-app off → no row; email on → one job.
    expect(await prisma.notification.count()).toBe(0);
    expect(await sendQueuedMail()).toBe(1);
    const mail = await waitForMail('author@example.com', 'Отпуск');
    expect(mail.subject).toBe('«Отпуск» готово');
    expect(mail.text).toContain(`/v/${video.id}`);
    expect(mail.text).toContain('/settings/notifications');

    // VIDEO_FAILED: in-app row and (by default) an email, stamped once sent.
    await prisma.outboxEvent.create({
      data: {
        type: 'video.failed',
        payload: {
          videoId: video.id,
          authorId,
          title: 'Отпуск',
          reason: 'corrupted',
        },
      },
    });
    await relay.drain();
    expect(await sendQueuedMail()).toBe(1);
    const failed = await waitForMail('author@example.com', 'Не удалось');
    expect(failed.text).toContain('файл повреждён');
    const row = await prisma.notification.findFirstOrThrow({
      where: { type: 'VIDEO_FAILED' },
    });
    expect(row.emailedAt).not.toBeNull();

    // Unverified addresses never get email; in-app still works.
    await prisma.user.update({
      where: { id: authorId },
      data: { emailVerifiedAt: null },
    });
    await prisma.outboxEvent.create({
      data: {
        type: 'video.failed',
        payload: {
          videoId: video.id,
          authorId,
          title: 'Отпуск',
          reason: 'tooLong',
        },
      },
    });
    await relay.drain();
    expect(await sendQueuedMail()).toBe(0);
    expect(
      await prisma.notification.count({ where: { type: 'VIDEO_FAILED' } }),
    ).toBe(2);
  });

  it('lists with a cursor, marks read one by one or all at once, and keeps others’ items private', async () => {
    const video = await seed(authorId, 'v');
    for (let i = 0; i < 5; i++)
      await prisma.outboxEvent.create({
        data: {
          type: 'video.processed',
          payload: { videoId: video.id, authorId, title: `v${i}` },
        },
      });
    await relay.drain();
    const page1 = (await author.get('/api/notifications?limit=2').expect(200))
      .body;
    expect(
      page1.items.map((n: { payload: { title: string } }) => n.payload.title),
    ).toEqual(['v4', 'v3']);
    expect(page1.unreadCount).toBe(5);
    const page2 = (
      await author
        .get(`/api/notifications?limit=2&cursor=${page1.nextCursor}`)
        .expect(200)
    ).body;
    expect(
      page2.items.map((n: { payload: { title: string } }) => n.payload.title),
    ).toEqual(['v2', 'v1']);
    const page3 = (
      await author
        .get(`/api/notifications?limit=2&cursor=${page2.nextCursor}`)
        .expect(200)
    ).body;
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    await author
      .post(`/api/notifications/${page1.items[0].id}/read`)
      .expect(200);
    await author
      .post(`/api/notifications/${page1.items[0].id}/read`)
      .expect(200); // idempotent
    await holder
      .post(`/api/notifications/${page1.items[1].id}/read`)
      .expect(404);
    expect(
      (await author.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(4);
    await author.post('/api/notifications/read-all').expect(200);
    expect(
      (await author.get('/api/notifications/unread-count').expect(200)).body
        .count,
    ).toBe(0);
    await settle();
    expect(
      published.filter((m) => m.event === 'notification.unread').at(-1)!
        .payload,
    ).toEqual({
      count: 0,
    });
  });

  it('parks an event that keeps failing instead of blocking the queue', async () => {
    await prisma.outboxEvent.create({
      data: { type: 'video.processed', payload: { nonsense: true } },
    });
    await prisma.outboxEvent.create({
      data: {
        type: 'video.processed',
        payload: {
          videoId: '0199d1c0-0000-7000-8000-000000000009',
          authorId,
          title: 'ok',
        },
      },
    });
    expect(await relay.drain()).toBe(2);
    const [bad, good] = await prisma.outboxEvent.findMany({
      orderBy: { id: 'asc' },
    });
    expect(bad!.processedAt).toBeNull();
    expect(bad!.attempts).toBe(1);
    expect(bad!.lastError).toBeTruthy();
    expect(good!.processedAt).not.toBeNull();
    expect(await prisma.notification.count()).toBe(1);
  });

  it('two relays draining at once (two workers) deliver each event once', async () => {
    const video = await seed(authorId, 'gone');
    await prisma.outboxEvent.create({
      data: {
        type: 'video.removed',
        payload: {
          videoId: video.id,
          title: 'gone',
          authorId,
          authorName: 'Author',
          deletedById: otherId,
          holderIds: [holderId, authorId],
        },
      },
    });
    const counts = await Promise.all([
      relay.drain(),
      relay.drain(),
      relay.drain(),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(
      await prisma.notification.count({ where: { type: 'VIDEO_REMOVED' } }),
    ).toBe(2);
    const event = await prisma.outboxEvent.findFirstOrThrow();
    expect(event.attempts).toBe(1);
  });

  it('a change of a request reaches the app even with its bell notification switched off', async () => {
    await prisma.notificationPreference.create({
      data: {
        userId: holderId,
        type: 'REQUEST_RECEIVED',
        inApp: false,
        email: false,
      },
    });
    const delivered = await app
      .get(NotificationsService)
      .deliver(holderId, 'REQUEST_RECEIVED', {
        requestId: '00000000-0000-7000-8000-000000000001',
        fromName: 'Other',
        fromUsername: 'other',
        count: 1,
        title: 'clip',
      });
    await settle();
    expect(delivered).toBeNull();
    expect(
      await prisma.notification.count({ where: { userId: holderId } }),
    ).toBe(0);
    expect(published).toContainEqual({
      userId: holderId,
      event: EXCHANGE_CHANGED_WS_EVENT,
      payload: {
        requestId: '00000000-0000-7000-8000-000000000001',
        type: 'REQUEST_RECEIVED',
      },
    });
    expect(published.some((m) => m.event === 'notification.new')).toBe(false);
  });

  it('a failed event waits before its next attempt, and its retry skips who it already reached', async () => {
    const service = app.get(NotificationsService);
    const original = service.deliver.bind(service);
    let calls = 0;
    const spy = vi
      .spyOn(service, 'deliver')
      .mockImplementation(async (...args) => {
        calls++;
        if (calls === 2) throw new Error('mail queue down');
        return original(...args);
      });
    try {
      await prisma.outboxEvent.create({
        data: {
          type: 'notify',
          payload: {
            deliveries: [
              {
                userId: holderId,
                type: 'ADMIN_NOTICE',
                payload: { message: 'one' },
              },
              {
                userId: otherId,
                type: 'ADMIN_NOTICE',
                payload: { message: 'two' },
              },
            ],
          },
        },
      });
      await relay.drain();
      let event = await prisma.outboxEvent.findFirstOrThrow();
      expect(event).toMatchObject({ processedAt: null, attempts: 1 });
      expect(event.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      // Not retried before its time.
      await relay.drain();
      expect((await prisma.outboxEvent.findFirstOrThrow()).attempts).toBe(1);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
      await relay.drain();
      event = await prisma.outboxEvent.findFirstOrThrow();
      expect(event.processedAt).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
    // The first recipient got it once, not again on the retry; the second got it on the retry.
    expect(
      await prisma.notification.count({ where: { userId: holderId } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: otherId } }),
    ).toBe(1);
  });
});

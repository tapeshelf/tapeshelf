import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';

import { OutboxService } from '../src/infra/outbox/outbox.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module.js';
import { presenceKey } from '../src/infra/ws/presence.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
interface Note {
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
}

/**
 * follows and friends, public lists, blocks that
 * end friendships, chat between friends with video cards and read marks, chat notifications
 * folded per conversation; new videos reach followers through "What's new", not notifications.
 */
describe('friends, blocks and chat (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let relay: OutboxRelayService;
  let redis: Redis;
  let ann: C, bob: C, eve: C, guest: C;
  let annId: string, bobId: string, eveId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    relay = app.get(OutboxRelayService);
    redis = app.get(REDIS_CLIENT);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await redis.del(...(await redis.keys('vs:chat-mail:*')), 'vs:none');
    ann = client(app);
    bob = client(app);
    eve = client(app);
    guest = client(app);
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
    eveId = await signUp(app, eve, {
      email: 'eve@example.com',
      username: 'eve',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const notes = async (c: C): Promise<Note[]> =>
    (await c.get('/api/notifications').expect(200)).body.items as Note[];
  const types = async (c: C) => (await notes(c)).map((n) => n.type);
  const profile = async (c: C, username: string) =>
    (await c.get(`/api/users/${username}`).expect(200)).body as {
      counts: { followers: number; following: number; friends: number };
      relation: Record<string, boolean> | null;
    };
  const befriend = async () => {
    await ann.post('/api/users/bob/follow').expect(200);
    await bob.post('/api/users/ann/follow').expect(200);
    await relay.drain();
  };
  async function seedVideo(authorId: string, title: string) {
    const v = await prisma.video.create({
      data: {
        authorId,
        title,
        visibility: 'PRIVATE',
        status: 'READY',
        originalKey: 'x',
        originalFilename: 'x.mp4',
        sizeBytes: 100n,
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    return v.id;
  }

  describe('follows and friends', () => {
    it('the news about a follower goes once a day even with in-app news switched off', async () => {
      await prisma.notificationPreference.create({
        data: {
          userId: bobId,
          type: 'NEW_FOLLOWER',
          inApp: false,
          email: true,
        },
      });
      for (let i = 0; i < 3; i++) {
        await ann.post('/api/users/bob/follow').expect(200);
        await ann.delete('/api/users/bob/follow').expect(200);
      }
      const events = await prisma.outboxEvent.findMany({
        where: { type: 'notify' },
      });
      const news = events
        .flatMap(
          (e) =>
            (e.payload as { deliveries: { userId: string; type: string }[] })
              .deliveries,
        )
        .filter((d) => d.userId === bobId && d.type === 'NEW_FOLLOWER');
      expect(news).toHaveLength(1);
    });

    it('follow tells the other side; following back makes friends and tells both, once', async () => {
      const r1 = await ann.post('/api/users/bob/follow').expect(200);
      expect(r1.body).toMatchObject({
        following: true,
        friends: false,
        canMessage: false,
      });
      await ann.post('/api/users/bob/follow').expect(200); // idempotent
      await relay.drain();
      expect(await types(bob)).toEqual(['NEW_FOLLOWER']);
      expect((await notes(bob))[0]!.payload).toMatchObject({
        fromUsername: 'ann',
        userId: annId,
      });

      const r2 = await bob.post('/api/users/ann/follow').expect(200);
      expect(r2.body).toMatchObject({
        friends: true,
        canMessage: true,
        followsYou: true,
      });
      await relay.drain();
      expect(await types(ann)).toEqual(['FRIEND_ACCEPTED']);
      expect((await types(bob)).sort()).toEqual([
        'FRIEND_ACCEPTED',
        'NEW_FOLLOWER',
      ]);

      // Unfollow ends the friendship; re-adding within a day does not repeat the news.
      await ann.delete('/api/users/bob/follow').expect(200);
      expect((await profile(ann, 'bob')).relation).toMatchObject({
        friends: false,
        followsYou: true,
      });
      await ann.post('/api/users/bob/follow').expect(200);
      await relay.drain();
      expect(await types(ann)).toEqual(['FRIEND_ACCEPTED']);
    });

    it('counts and lists are public; guests see no relation', async () => {
      await befriend();
      await eve.post('/api/users/bob/follow').expect(200);
      const page = await profile(guest, 'bob');
      expect(page.counts).toEqual({ followers: 2, following: 1, friends: 1 });
      expect(page.relation).toBeNull();
      // Every card counts the person's videos; exchanges show to the list's owner only.
      await seedVideo(annId, 'Ann 1');
      const annPublic = await seedVideo(annId, 'Ann public');
      await prisma.video.update({
        where: { id: annPublic },
        data: { visibility: 'PUBLIC' },
      });
      await prisma.videoRequest.create({
        data: {
          requesterId: bobId,
          holderId: annId,
          status: 'ACCEPTED',
          round: 0,
        },
      });
      const friends = await guest
        .get('/api/users/bob/social?list=friends')
        .expect(200);
      expect(
        friends.body.items.map((u: { username: string }) => u.username),
      ).toEqual(['ann']);
      expect(friends.body.items[0]).toMatchObject({
        videos: { public: 1, private: 1, received: 0 },
        exchanges: null,
      });
      expect(
        (await bob.get('/api/users/bob/social?list=friends').expect(200)).body
          .items[0].exchanges,
      ).toBe(1);
      const followers = await guest
        .get('/api/users/bob/social?list=followers')
        .expect(200);
      expect(
        followers.body.items
          .map((u: { username: string }) => u.username)
          .sort(),
      ).toEqual(['ann', 'eve']);
      expect(followers.body.total).toBe(2);
      const following = await guest
        .get('/api/users/eve/social?list=following')
        .expect(200);
      expect(
        following.body.items.map((u: { username: string }) => u.username),
      ).toEqual(['bob']);
      // Banned accounts drop out of counts and lists.
      await prisma.user.update({
        where: { id: eveId },
        data: { status: 'BANNED' },
      });
      expect((await profile(guest, 'bob')).counts.followers).toBe(1);
      expect((await profile(ann, 'bob')).relation).toMatchObject({
        friends: true,
        canMessage: true,
      });
    });

    it('guards: no self-follow, guests and unverified accounts cannot follow', async () => {
      await ann.post('/api/users/ann/follow').expect(400);
      await guest.post('/api/users/ann/follow').expect(401);
      await prisma.user.update({
        where: { id: eveId },
        data: { emailVerifiedAt: null },
      });
      const r = await eve.post('/api/users/ann/follow').expect(403);
      expect(r.body.code).toBe('emailNotVerified');
      await ann.post('/api/users/nobody/follow').expect(404);
    });
  });

  describe('blocks', () => {
    it('a block removes follows both ways and stops following; the blocked side learns nothing', async () => {
      await befriend();
      await ann.post(`/api/me/blocks/${bobId}`).expect(200);
      expect(await prisma.follow.count()).toBe(0);
      expect((await profile(ann, 'bob')).relation).toMatchObject({
        blocked: true,
        canFollow: false,
        canMessage: false,
      });
      // Bob sees a page without follow/message actions and no hint of the block.
      const seen = (await profile(bob, 'ann')).relation;
      expect(seen).toMatchObject({
        blocked: false,
        canFollow: false,
        canMessage: false,
        friends: false,
      });
      const r = await bob.post('/api/users/ann/follow').expect(403);
      expect(r.body.code).toBe('followNotAllowed');
      // Unblocking does not restore the friendship.
      await ann.delete(`/api/me/blocks/${bobId}`).expect(200);
      expect((await profile(bob, 'ann')).relation).toMatchObject({
        canFollow: true,
        friends: false,
      });
    });
  });

  describe('chat', () => {
    it('only friends can write; messages, unread counts and read marks work both ways', async () => {
      const denied = await ann
        .post('/api/conversations/with/bob/messages')
        .send({ body: 'hi' })
        .expect(403);
      expect(denied.body.code).toBe('notFriends');
      expect(
        (await ann.get('/api/conversations/with/bob').expect(200)).body,
      ).toMatchObject({
        conversation: null,
        sendBlocker: 'notFriends',
      });

      await befriend();
      const m1 = (
        await ann
          .post('/api/conversations/with/bob/messages')
          .send({ body: '  Hello Bob  ' })
          .expect(201)
      ).body;
      expect(m1).toMatchObject({
        body: 'Hello Bob',
        senderId: annId,
        video: null,
        videoUnavailable: false,
      });
      await ann
        .post('/api/conversations/with/bob/messages')
        .send({ body: '' })
        .expect(400);
      const m2 = (
        await ann
          .post('/api/conversations/with/bob/messages')
          .send({ body: 'Are you there?' })
          .expect(201)
      ).body;

      expect(
        (await bob.get('/api/conversations/unread-count').expect(200)).body
          .count,
      ).toBe(2);
      expect(
        (await ann.get('/api/conversations/unread-count').expect(200)).body
          .count,
      ).toBe(0);
      const list = (await bob.get('/api/conversations').expect(200)).body;
      expect(list.unreadTotal).toBe(2);
      expect(list.items[0]).toMatchObject({
        id: m1.conversationId,
        unread: 2,
        sendBlocker: null,
        other: { username: 'ann', deleted: false },
        lastMessage: { id: m2.id, body: 'Are you there?' },
      });

      // One bell item per conversation that counts messages; email only once while offline.
      await relay.drain();
      const bell = (await notes(bob)).filter((n) => n.type === 'NEW_MESSAGE');
      expect(bell).toHaveLength(1);
      expect(bell[0]!.payload).toMatchObject({
        count: 2,
        fromUsername: 'ann',
        preview: 'Are you there?',
      });
      expect(
        await redis.exists(`vs:chat-mail:${bobId}:${m1.conversationId}`),
      ).toBe(1);

      // Bob reads: his counter drops, the bell item is read, Ann sees the read mark.
      await bob
        .post(`/api/conversations/${m1.conversationId}/read`)
        .send({ messageId: m2.id })
        .expect(200);
      await bob
        .post(`/api/conversations/${m1.conversationId}/read`)
        .send({ messageId: m1.id })
        .expect(200); // never moves back
      expect(
        (await bob.get('/api/conversations/unread-count').expect(200)).body
          .count,
      ).toBe(0);
      expect(
        (await notes(bob)).find((n) => n.type === 'NEW_MESSAGE')!.readAt,
      ).not.toBeNull();
      const annView = (await ann.get('/api/conversations/with/bob').expect(200))
        .body;
      expect(annView.conversation.otherLastReadMessageId).toBe(m2.id);

      // Paging backwards, oldest first.
      const page = (
        await bob
          .get(`/api/conversations/${m1.conversationId}/messages?limit=1`)
          .expect(200)
      ).body;
      expect(page).toMatchObject({ hasMore: true, items: [{ id: m2.id }] });
      const older = (
        await bob
          .get(
            `/api/conversations/${m1.conversationId}/messages?before=${m2.id}`,
          )
          .expect(200)
      ).body;
      expect(older).toMatchObject({ hasMore: false, items: [{ id: m1.id }] });

      // Strangers cannot read it.
      await eve
        .get(`/api/conversations/${m1.conversationId}/messages`)
        .expect(404);
      await eve
        .post(`/api/conversations/${m1.conversationId}/read`)
        .send({ messageId: m1.id })
        .expect(404);

      // After unfollowing, history stays but nobody can send.
      await bob.delete('/api/users/ann/follow').expect(200);
      const stopped = await ann
        .post('/api/conversations/with/bob/messages')
        .send({ body: 'still?' })
        .expect(403);
      expect(stopped.body.code).toBe('notFriends');
      expect(
        (
          await bob
            .get(`/api/conversations/${m1.conversationId}/messages`)
            .expect(200)
        ).body.items,
      ).toHaveLength(2);
    });

    it('a message read before the worker gets to it leaves no bell item and no email', async () => {
      await befriend();
      const m = (
        await ann
          .post('/api/conversations/with/bob/messages')
          .send({ body: 'Seen it?' })
          .expect(201)
      ).body;
      // Bob's thread is open: his app marks the message read on the live event.
      await bob
        .post(`/api/conversations/${m.conversationId}/read`)
        .send({ messageId: m.id })
        .expect(200);
      await relay.drain();
      expect(
        (await notes(bob)).filter((n) => n.type === 'NEW_MESSAGE'),
      ).toHaveLength(0);
      expect(
        await redis.exists(`vs:chat-mail:${bobId}:${m.conversationId}`),
      ).toBe(0);
    });

    it('a new message while online is not emailed; a second offline one within 30 min neither', async () => {
      await befriend();
      await redis.set(presenceKey(bobId), '1', 'EX', 60);
      const m = (
        await ann
          .post('/api/conversations/with/bob/messages')
          .send({ body: 'online?' })
          .expect(201)
      ).body;
      await relay.drain();
      expect(
        await redis.exists(`vs:chat-mail:${bobId}:${m.conversationId}`),
      ).toBe(0);
      await redis.del(presenceKey(bobId));
      await ann
        .post('/api/conversations/with/bob/messages')
        .send({ body: 'now offline' })
        .expect(201);
      await relay.drain();
      expect(
        await redis.exists(`vs:chat-mail:${bobId}:${m.conversationId}`),
      ).toBe(1);
    });

    it('attaches only videos visible on the sender’s page; a deleted one becomes unavailable', async () => {
      await befriend();
      const own = await seedVideo(annId, 'Lake');
      const foreign = await seedVideo(eveId, 'Not mine');
      const hiddenOne = await seedVideo(eveId, 'Hidden one');
      await prisma.videoAccess.create({
        data: {
          videoId: hiddenOne,
          holderId: annId,
          source: 'SHARE',
          hidden: true,
        },
      });

      const sent = (
        await ann
          .post('/api/conversations/with/bob/messages')
          .send({ videoId: own })
          .expect(201)
      ).body;
      expect(sent).toMatchObject({
        body: '',
        video: {
          id: own,
          title: 'Lake',
          holderUsername: 'ann',
          visibility: 'PRIVATE',
        },
      });
      for (const videoId of [foreign, hiddenOne]) {
        const r = await ann
          .post('/api/conversations/with/bob/messages')
          .send({ videoId })
          .expect(400);
        expect(r.body.code).toBe('videoNotAttachable');
      }
      await relay.drain();
      expect(
        (await notes(bob)).find((n) => n.type === 'NEW_MESSAGE')!.payload,
      ).toMatchObject({ hasVideo: true, preview: '' });

      await ann.delete(`/api/videos/${own}`).expect(200);
      const items = (
        await bob
          .get(`/api/conversations/${sent.conversationId}/messages`)
          .expect(200)
      ).body.items;
      expect(items[0]).toMatchObject({ video: null, videoUnavailable: true });
    });
  });

  describe('followers are not notified of each new video', () => {
    it('a first READY tells the author only: "What\u2019s new" shows it to followers instead', async () => {
      await bob.post('/api/users/ann/follow').expect(200);
      await relay.drain();
      const videoId = await seedVideo(annId, 'Fresh');
      const outbox = app.get(OutboxService);
      await prisma.$transaction((tx) =>
        outbox.emit(tx, 'video.processed', {
          videoId,
          authorId: annId,
          title: 'Fresh',
          notifyFollowers: true,
          private: true,
        }),
      );
      await relay.drain();
      expect(await types(bob)).not.toContain('FOLLOWED_NEW_VIDEO');
      expect(await types(ann)).toContain('VIDEO_PROCESSED');
    });
  });
});

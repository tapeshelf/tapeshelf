import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { OutboxRelayService } from '../src/modules/notifications/outbox-relay.service.js';
import { SupportService } from '../src/modules/support/support.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
interface Note {
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
}
const DAY = 24 * 60 * 60_000;

/** Support tickets. */
describe('support (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let relay: OutboxRelayService;
  let support: SupportService;
  let admin: C, ann: C, bob: C;
  let adminId: string, annId: string;
  let shot: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    relay = app.get(OutboxRelayService);
    support = app.get(SupportService);
    // A screenshot that carries where it was taken: the stored copy must not.
    shot = await sharp({
      create: { width: 3200, height: 1800, channels: 3, background: '#336699' },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Ann', Artist: 'Ann at home' } })
      .toBuffer();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = client(app);
    ann = client(app);
    bob = client(app);
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
    await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const notes = async (c: C) =>
    (await c.get('/api/notifications').expect(200)).body.items as Note[];
  const open = (c: C, fields: Record<string, string>, files: Buffer[] = []) => {
    let req = c.post('/api/support/tickets');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (const [i, f] of files.entries())
      req = req.attach('files', f, `shot${i}.jpg`);
    return req;
  };

  it('a bug report with a picture and the browser’s description reaches the admins; the picture loses its metadata', async () => {
    const created = (
      await open(
        ann,
        {
          topic: 'BUG',
          subject: '  Upload stops at 99 %  ',
          body: 'Every time, on the last part.',
          context: JSON.stringify({
            browser: 'Firefox 140',
            screen: '1920×1080',
            nested: { no: 1 },
          }),
        },
        [shot],
      ).expect(200)
    ).body;
    expect(created).toMatchObject({
      number: expect.any(Number),
      topic: 'BUG',
      subject: 'Upload stops at 99 %',
      status: 'OPEN',
      context: {
        browser: 'Firefox 140',
        screen: '1920×1080',
        version: expect.any(String),
      },
    });
    expect(created.messages).toHaveLength(1);
    const [picture] = created.messages[0].attachments;
    expect(picture).toMatchObject({ width: 2560, height: 1440 });
    const row = await prisma.supportAttachment.findFirstOrThrow();
    expect(row.key).toMatch(
      new RegExp(`^support/${annId}/[0-9a-f]{24}\\.jpg$`),
    );
    const meta = await sharp(
      await storage.getBuffer('private', row.key),
    ).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
    // The link is presigned for the private bucket.
    expect(picture.url).toContain('X-Amz-Signature');

    await relay.drain();
    const [told] = (await notes(admin)).filter(
      (n) => n.type === 'SUPPORT_TICKET',
    );
    expect(told!.payload).toMatchObject({
      ticketId: created.id,
      number: created.number,
      fromUsername: 'ann',
      topic: 'BUG',
      created: true,
    });
    // Nobody else hears of it; the author is not told of her own ticket.
    expect((await notes(bob)).length).toBe(0);
    expect((await notes(ann)).length).toBe(0);
    expect(
      (await admin.get('/api/admin/dashboard').expect(200)).body.openSupport,
    ).toBe(1);

    // A question keeps no browser description; nobody but the author reads the ticket.
    const question = (
      await open(ann, {
        topic: 'QUESTION',
        subject: 'How?',
        body: 'Hi',
        context: '{"a":"b"}',
      }).expect(200)
    ).body;
    expect(question.context).toBeNull();
    await bob.get(`/api/support/tickets/${created.id}`).expect(404);
    await bob
      .post(`/api/support/tickets/${created.id}/messages`)
      .field('body', 'me too')
      .expect(404);
    const mine = (await ann.get('/api/support/tickets').expect(200)).body;
    expect(mine.items.map((t: { id: string }) => t.id)).toEqual([
      question.id,
      created.id,
    ]);
    expect(
      (await bob.get('/api/support/tickets').expect(200)).body.items,
    ).toEqual([]);
  });

  it('refuses what does not belong: a sixth open ticket, someone else’s video, a non-picture, an empty message', async () => {
    const bobVideo = await prisma.video.create({
      data: {
        authorId: (
          await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })
        ).id,
        title: 'Bob’s',
        originalKey: 'pending',
        originalFilename: 'b.mp4',
        sizeBytes: 1n,
      },
    });
    const own = await prisma.video.create({
      data: {
        authorId: annId,
        title: 'Mine',
        originalKey: 'pending',
        originalFilename: 'a.mp4',
        sizeBytes: 1n,
      },
    });
    const fields = { topic: 'QUESTION', subject: 'Q', body: 'B' };
    expect(
      (await open(ann, { ...fields, videoId: bobVideo.id }).expect(400)).body
        .code,
    ).toBe('supportNotYourVideo');
    const withVideo = (
      await open(ann, { ...fields, videoId: own.id }).expect(200)
    ).body;
    expect(withVideo.video).toMatchObject({
      id: own.id,
      title: 'Mine',
      deleted: false,
    });
    expect(
      (await ann.get('/api/support/videos').expect(200)).body.map(
        (v: { id: string }) => v.id,
      ),
    ).toEqual([own.id]);
    expect(
      (
        await ann
          .post('/api/support/tickets')
          .field('topic', 'QUESTION')
          .field('subject', 'Q')
          .field('body', 'B')
          .attach('files', Buffer.from('hello'), {
            filename: 'x.png',
            contentType: 'image/png',
          })
          .expect(400)
      ).body.code,
    ).toBe('supportBadImage');
    expect(
      (
        await ann
          .post(`/api/support/tickets/${withVideo.id}/messages`)
          .field('body', '')
          .expect(400)
      ).body.code,
    ).toBe('supportEmpty');
    for (let i = 0; i < 3; i++) await open(ann, fields).expect(200);
    // The fifth and a sixth sent at once: one of them only.
    const both = await Promise.all([open(ann, fields), open(ann, fields)]);
    expect(both.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
    expect((await open(ann, fields).expect(409)).body.code).toBe(
      'supportTooMany',
    );
    // A solved one no longer counts.
    await ann.post(`/api/support/tickets/${withVideo.id}/resolve`).expect(200);
    await open(ann, fields).expect(200);
    // Nothing was left in storage by the refused picture.
    expect(await storage.listKeys('private', `support/${annId}/`)).toEqual([]);
  });

  it('answers, notes, statuses, rating and closing by itself', async () => {
    const ticket = (
      await open(ann, {
        topic: 'ACCOUNT',
        subject: 'Email',
        body: 'Change it?',
      }).expect(200)
    ).body;

    // An admin note: never shown to the author, nobody told, the status stays.
    await admin
      .post(`/api/admin/support/${ticket.id}/messages`)
      .field('body', 'Check her old address first')
      .field('note', 'true')
      .expect(200);
    // The answer: signed "Support" for the author, who is told. A "false" sent as text is false
    // (the implicit conversion made it true, and the answer a hidden note).
    const answered = (
      await admin
        .post(`/api/admin/support/${ticket.id}/messages`)
        .field('body', 'Yes — in Settings.')
        .field('note', 'false')
        .field('resolve', 'false')
        .expect(200)
    ).body;
    expect(answered.status).toBe('WAITING');
    expect(answered.messages.map((m: { kind: string }) => m.kind)).toEqual([
      'USER',
      'NOTE',
      'SUPPORT',
    ]);
    expect(answered.messages[2].author.username).toBe('boss');
    expect(
      (await ann.get('/api/support/summary').expect(200)).body.unread,
    ).toBe(1);
    await relay.drain();
    const [reply] = (await notes(ann)).filter(
      (n) => n.type === 'SUPPORT_REPLY',
    );
    expect(reply!.payload).toMatchObject({
      ticketId: ticket.id,
      resolved: false,
      preview: 'Yes — in Settings.',
    });

    const read = (
      await ann.get(`/api/support/tickets/${ticket.id}`).expect(200)
    ).body;
    expect(read.messages.map((m: { kind: string }) => m.kind)).toEqual([
      'USER',
      'SUPPORT',
    ]);
    expect(read.messages[1].author).toBeUndefined();
    expect(
      (await ann.get('/api/support/summary').expect(200)).body.unread,
    ).toBe(0);
    // Opening the ticket dealt with its bell item too.
    expect(
      (await notes(ann))
        .filter((n) => n.type === 'SUPPORT_REPLY')
        .every((n) => n.readAt),
    ).toBe(true);
    expect(
      (await ann.get('/api/support/tickets').expect(200)).body.items[0].unread,
    ).toBe(false);

    // Not yet solved: no rating.
    expect(
      (
        await ann
          .put(`/api/support/tickets/${ticket.id}/rating`)
          .send({ helped: true })
          .expect(409)
      ).body.code,
    ).toBe('supportNotRated');
    // The author writes again: back to support, admins hear of it.
    const again = (
      await ann
        .post(`/api/support/tickets/${ticket.id}/messages`)
        .field('body', 'Found it, thanks')
        .expect(200)
    ).body;
    expect(again.status).toBe('OPEN');
    await relay.drain();
    expect(
      (await notes(admin))
        .filter((n) => n.type === 'SUPPORT_TICKET')
        .map((n) => n.payload['created']),
    ).toEqual([false, true]);

    // Solved by an admin (the author is told), urgent, rated.
    const solved = (
      await admin
        .patch(`/api/admin/support/${ticket.id}`)
        .send({ status: 'RESOLVED', priority: 'HIGH' })
        .expect(200)
    ).body;
    expect(solved).toMatchObject({ status: 'RESOLVED', priority: 'HIGH' });
    await relay.drain();
    expect(
      (await notes(ann))
        .filter((n) => n.type === 'SUPPORT_REPLY')
        .map((n) => n.payload['resolved']),
    ).toEqual([true, false]);
    expect(
      (
        await ann
          .put(`/api/support/tickets/${ticket.id}/rating`)
          .send({ helped: true })
          .expect(200)
      ).body.helped,
    ).toBe(true);
    expect(
      (
        await prisma.auditLog.findMany({
          where: { targetId: ticket.id },
          orderBy: { id: 'asc' },
        })
      ).map((a) => a.action),
    ).toEqual([
      'support.note',
      'support.reply',
      'support.status',
      'support.priority',
    ]);

    // Solved is over: nothing more is written in it, a new ticket instead.
    const writeOn = () =>
      ann
        .post(`/api/support/tickets/${ticket.id}/messages`)
        .field('body', 'One more thing')
        .expect(409);
    expect((await writeOn()).body.code).toBe('supportClosed');
    // Seven days on: closed by itself, and still over.
    expect(await support.closeIdle(new Date(Date.now() + 6 * DAY))).toBe(0);
    expect(await support.closeIdle(new Date(Date.now() + 8 * DAY))).toBe(1);
    const closed = (
      await ann.get(`/api/support/tickets/${ticket.id}`).expect(200)
    ).body;
    expect(closed).toMatchObject({ status: 'CLOSED', helped: true });
    expect((await writeOn()).body.code).toBe('supportClosed');
    // An admin can still open it again; then its rating no longer stands.
    expect(
      (
        await admin
          .patch(`/api/admin/support/${ticket.id}`)
          .send({ status: 'OPEN' })
          .expect(200)
      ).body,
    ).toMatchObject({ status: 'OPEN', helped: null });
    // So does an answer in a solved one: it waits for the author again, unrated.
    await admin
      .patch(`/api/admin/support/${ticket.id}`)
      .send({ status: 'RESOLVED' })
      .expect(200);
    await ann
      .put(`/api/support/tickets/${ticket.id}/rating`)
      .send({ helped: false })
      .expect(200);
    expect(
      (
        await admin
          .post(`/api/admin/support/${ticket.id}/messages`)
          .field('body', 'Fixed in the new version.')
          .expect(200)
      ).body,
    ).toMatchObject({ status: 'WAITING', helped: null });
  });

  it('the admin list: waiting for support first, urgent first; search by number, user and subject; filters', async () => {
    const a = (
      await open(ann, {
        topic: 'IDEA',
        subject: 'Dark mode',
        body: 'Please',
      }).expect(200)
    ).body;
    const b = (
      await open(bob, { topic: 'BUG', subject: 'Crash', body: 'Boom' }).expect(
        200,
      )
    ).body;
    const c = (
      await open(bob, {
        topic: 'QUESTION',
        subject: 'Price',
        body: '?',
      }).expect(200)
    ).body;
    await admin
      .post(`/api/admin/support/${c.id}/messages`)
      .field('body', 'Free')
      .expect(200);
    await admin
      .patch(`/api/admin/support/${a.id}`)
      .send({ priority: 'HIGH' })
      .expect(200);
    const list = (await admin.get('/api/admin/support').expect(200)).body;
    expect(list.total).toBe(3);
    expect(list.items.map((t: { id: string }) => t.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
    expect(list.items[2]).toMatchObject({
      status: 'WAITING',
      messages: 2,
      user: { username: 'bob' },
    });
    const ids = async (q: string) =>
      (await admin.get(`/api/admin/support?${q}`).expect(200)).body.items.map(
        (t: { id: string }) => t.id,
      );
    expect(await ids(`q=%23${b.number}`)).toEqual([b.id]);
    expect(await ids('q=bob')).toEqual([b.id, c.id]);
    expect(await ids('q=dark')).toEqual([a.id]);
    expect(await ids('status=WAITING')).toEqual([c.id]);
    expect(await ids('topic=BUG')).toEqual([b.id]);
    expect(await ids('priority=HIGH')).toEqual([a.id]);
  });

  it('support tickets in the settings only for admins; a deleted account leaves its tickets without pictures', async () => {
    const types = async (c: C) =>
      (await c.get('/api/me/notification-preferences').expect(200)).body.map(
        (p: { type: string }) => p.type,
      );
    expect(await types(admin)).toContain('SUPPORT_TICKET');
    expect(await types(ann)).not.toContain('SUPPORT_TICKET');
    expect(await types(ann)).toContain('SUPPORT_REPLY');

    const ticket = (
      await open(ann, { topic: 'QUESTION', subject: 'Bye', body: 'Leaving' }, [
        shot,
      ]).expect(200)
    ).body;
    await admin
      .post(`/api/admin/support/${ticket.id}/messages`)
      .field('body', 'Sorry to see you go')
      .expect(200);
    await ann.delete('/api/me').send({ password: 'secret123' }).expect(200);
    const kept = (
      await admin.get(`/api/admin/support/${ticket.id}`).expect(200)
    ).body;
    expect(kept.user.status).toBe('DELETED');
    expect(
      kept.messages.flatMap((m: { attachments: unknown[] }) => m.attachments),
    ).toEqual([]);
    expect(await storage.listKeys('private', `support/${annId}/`)).toEqual([]);
  });
});

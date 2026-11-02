import type { NestExpressApplication } from '@nestjs/platform-express';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { INVITE_MAX_USES } from '../src/modules/social/invites.service.js';
import { clearMailbox, extractToken, waitForMail } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

type C = ReturnType<typeof client>;

/** A link that makes friends, with an end date and a number of uses. */
describe('invitations to be friends (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ann: C, bob: C, guest: C;
  let annId: string, bobId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ann = client(app);
    bob = client(app);
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
  });

  afterAll(async () => {
    await app.close();
  });

  const follows = async (a: string, b: string) =>
    prisma.follow.count({ where: { followerId: a, followeeId: b } });

  it('one click makes friends; the link keeps working until replaced, and is never one’s own', async () => {
    const first = (await ann.post('/api/me/invite').expect(200)).body;
    expect(first).toMatchObject({ uses: 0, maxUses: INVITE_MAX_USES });
    expect(new Date(first.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 6 * 86_400_000,
    );
    // The same link while it works.
    expect((await ann.post('/api/me/invite').expect(200)).body.code).toBe(
      first.code,
    );
    expect(
      (await guest.get(`/api/invites/${first.code}`).expect(200)).body,
    ).toMatchObject({ inviter: { username: 'ann' }, state: 'valid' });
    await guest.post(`/api/invites/${first.code}/accept`).expect(401);
    expect(
      (await ann.post(`/api/invites/${first.code}/accept`).expect(400)).body
        .code,
    ).toBe('ownInvite');

    expect(
      (await bob.post(`/api/invites/${first.code}/accept`).expect(200)).body,
    ).toMatchObject({ outcome: 'friends', inviter: { username: 'ann' } });
    expect([await follows(bobId, annId), await follows(annId, bobId)]).toEqual([
      1, 1,
    ]);
    // Friends already: it is not spent again.
    await bob.post(`/api/invites/${first.code}/accept`).expect(200);
    expect((await ann.post('/api/me/invite').expect(200)).body.uses).toBe(1);

    // A new link: the old one is gone.
    const second = (await ann.post('/api/me/invite/renew').expect(200)).body;
    expect(second.code).not.toBe(first.code);
    expect(
      (await guest.get(`/api/invites/${first.code}`).expect(200)).body.state,
    ).toBe('expired');
    await guest.get('/api/invites/nothing-like-it').expect(404);
  });

  it('a hidden page’s owner and whoever they invite become friends; one use spent, taken once', async () => {
    await prisma.user.update({
      where: { id: annId },
      data: { pageHidden: true },
    });
    const { code } = (await ann.post('/api/me/invite').expect(200)).body;
    expect(
      (await bob.post(`/api/invites/${code}/accept`).expect(200)).body.outcome,
    ).toBe('friends');
    expect([await follows(bobId, annId), await follows(annId, bobId)]).toEqual([
      1, 1,
    ]);
    expect(
      (await prisma.friendInvite.findFirstOrThrow({ where: { code } })).uses,
    ).toBe(1);

    // A newcomer not confirmed yet who takes it twice spends one use, not two.
    const carl = client(app);
    await signUp(app, carl, {
      email: 'carl@example.com',
      username: 'carl',
      password: 'secret123',
      verified: false,
    });
    for (let i = 0; i < 2; i++)
      expect(
        (await carl.post(`/api/invites/${code}/accept`).expect(200)).body
          .outcome,
      ).toBe('pending');
    expect(
      (await prisma.friendInvite.findFirstOrThrow({ where: { code } })).uses,
    ).toBe(2);
  });

  it('a newcomer becomes a friend once the email is confirmed', async () => {
    await clearMailbox();
    const { code } = (await ann.post('/api/me/invite').expect(200)).body;
    const carl = client(app);
    const carlId = await signUp(app, carl, {
      email: 'carl@example.com',
      username: 'carl',
      password: 'secret123',
      verified: false,
    });
    expect(
      (await carl.post(`/api/invites/${code}/accept`).expect(200)).body.outcome,
    ).toBe('pending');
    expect(await follows(carlId, annId)).toBe(0);
    const token = extractToken(
      (await waitForMail('carl@example.com', 'Confirm')).text,
      '/verify-email',
    );
    await carl.post('/api/auth/verify-email').send({ token }).expect(200);
    expect([
      await follows(carlId, annId),
      await follows(annId, carlId),
    ]).toEqual([1, 1]);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: carlId } }))
        .pendingInviteId,
    ).toBeNull();
  });

  it('an expired, used-up or blocked link makes no friends', async () => {
    const { code } = (await ann.post('/api/me/invite').expect(200)).body;
    await prisma.friendInvite.update({
      where: { code },
      data: { uses: INVITE_MAX_USES },
    });
    expect(
      (await bob.post(`/api/invites/${code}/accept`).expect(410)).body.code,
    ).toBe('inviteUsedUp');
    await prisma.friendInvite.update({
      where: { code },
      data: { uses: 0, expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await bob.post(`/api/invites/${code}/accept`).expect(410)).body.code,
    ).toBe('inviteExpired');
    // A fresh link since it ran out.
    const fresh = (await ann.post('/api/me/invite').expect(200)).body.code;
    expect(fresh).not.toBe(code);
    await prisma.block.create({ data: { blockerId: annId, blockedId: bobId } });
    expect(
      (await bob.post(`/api/invites/${fresh}/accept`).expect(403)).body.code,
    ).toBe('followNotAllowed');
    expect(
      (await prisma.friendInvite.findUniqueOrThrow({ where: { code: fresh } }))
        .uses,
    ).toBe(0);
    expect(await follows(bobId, annId)).toBe(0);
  });
});

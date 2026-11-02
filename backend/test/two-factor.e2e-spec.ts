import type { NestExpressApplication } from '@nestjs/platform-express';
import { Secret, TOTP } from 'otpauth';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { clearMailbox, waitForMail } from './utils/mailpit.js';
import { SoftPasskey } from './utils/soft-passkey.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { makeAdmin, signUp } from './utils/users.js';

type C = ReturnType<typeof client>;
const ORIGIN = 'http://localhost:4200'; // PUBLIC_URL of .env.test
const ANN = {
  email: 'ann@example.com',
  username: 'ann',
  password: 'secret123',
};

/** The code an authenticator app shows `steps` periods from now. */
function code(secret: string, steps = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate({
    timestamp: Date.now() + steps * 30_000,
  });
}

/** Two-step sign-in. */
describe('two-step sign-in (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Signs in with the password up to the second step; the client keeps the step's cookie. */
  async function password(c: C, email = ANN.email) {
    const res = await c
      .post('/api/auth/login')
      .send({ email, password: 'secret123' })
      .expect(401);
    expect(res.body).toMatchObject({ code: 'twoFactorLogin' });
    return res.body.details as { methods: string[] };
  }

  /** Turns the app on for a signed-in client; returns the secret and the recovery codes. */
  async function turnOnApp(c: C) {
    const setup = await c
      .post('/api/auth/2fa/app/setup')
      .send({ password: 'secret123' })
      .expect(200);
    const res = await c
      .post('/api/auth/2fa/app')
      .send({ code: code(setup.body.secret) })
      .expect(200);
    return {
      secret: setup.body.secret as string,
      codes: res.body.recoveryCodes as string[],
    };
  }

  it('the app: turned on with the password, then asked after it; codes are taken once', async () => {
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    const phone = client(app);
    await phone
      .post('/api/auth/login')
      .send({ email: ANN.email, password: 'secret123' })
      .expect(200);
    await clearMailbox();

    await ann
      .post('/api/auth/2fa/app/setup')
      .send({ password: 'wrong123' })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('wrongPassword'));
    const setup = await ann
      .post('/api/auth/2fa/app/setup')
      .send({ password: 'secret123' })
      .expect(200);
    expect(setup.body.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.qr).toMatch(/^data:image\/svg\+xml;base64,/);
    await ann
      .post('/api/auth/2fa/app')
      .send({ code: '000000' })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('twoFactorInvalidCode'));
    const on = await ann
      .post('/api/auth/2fa/app')
      .send({ code: code(setup.body.secret) })
      .expect(200);
    const codes = on.body.recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(codes[0]).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    await waitForMail(ANN.email, 'Two-step sign-in is on');

    // The secret is not kept readable, the other session is gone, this one stays.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: annId } });
    expect(row.totpSecret).not.toContain(setup.body.secret);
    await phone.get('/api/auth/me').expect(401);
    const me = await ann.get('/api/auth/me').expect(200);
    expect(me.body.twoFactor).toBe(true);
    expect((await ann.get('/api/auth/2fa').expect(200)).body).toMatchObject({
      enabled: true,
      app: true,
      passkeys: [],
      recoveryCodesLeft: 10,
      sessionConfirmed: true,
    });

    // The password alone opens nothing now.
    const laptop = client(app);
    expect(await password(laptop)).toEqual({ methods: ['app'] });
    await laptop.get('/api/auth/me').expect(401);
    await laptop
      .post('/api/auth/login/2fa')
      .send({ code: '123456' })
      .expect(400);
    const next = code(setup.body.secret, 1);
    const signedIn = await laptop
      .post('/api/auth/login/2fa')
      .send({ code: next })
      .expect(200);
    expect(signedIn.body.username).toBe('ann');
    await laptop.get('/api/auth/me').expect(200);
    // The ticket is spent with the sign-in.
    await laptop
      .post('/api/auth/login/2fa')
      .send({ code: next })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('twoFactorExpired'));

    // The same code again, in another sign-in: refused.
    const tablet = client(app);
    await password(tablet);
    await tablet.post('/api/auth/login/2fa').send({ code: next }).expect(400);
    // A recovery code, any case and spacing, works once; the owner hears of it.
    await tablet
      .post('/api/auth/login/2fa')
      .send({ code: ` ${codes[0]!.toLowerCase().replace('-', ' ')} ` })
      .expect(200);
    await waitForMail(ANN.email, 'A recovery code was used');
    const again = client(app);
    await password(again);
    await again
      .post('/api/auth/login/2fa')
      .send({ code: codes[0] })
      .expect(400);
    await again
      .post('/api/auth/login/2fa')
      .send({ code: codes[1] })
      .expect(200);
    expect(
      (await again.get('/api/auth/2fa').expect(200)).body.recoveryCodesLeft,
    ).toBe(8);

    // Without the step's cookie there is nothing to finish.
    await client(app)
      .post('/api/auth/login/2fa')
      .send({ code: codes[2] })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('twoFactorExpired'));
  });

  it('misses lock the step like a password', async () => {
    const ann = client(app);
    await signUp(app, ann, ANN);
    await turnOnApp(ann);
    const thief = client(app);
    await password(thief);
    for (let i = 0; i < 10; i++)
      await thief
        .post('/api/auth/login/2fa')
        .send({ code: String(100000 + i) })
        .expect(400);
    await thief
      .post('/api/auth/login/2fa')
      .send({ code: '999999' })
      .expect(429)
      .expect((r) => expect(r.body.code).toBe('tooManyAttempts'));
  });

  it('changes need the step from the last ten minutes; the owner may turn it off', async () => {
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    const { secret, codes } = await turnOnApp(ann);
    const stale = new Date(Date.now() - 11 * 60_000);
    await prisma.session.updateMany({
      where: { userId: annId },
      data: { secondFactorAt: stale },
    });
    await ann
      .post('/api/auth/2fa/recovery-codes')
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('twoFactorConfirm'));
    await ann.post('/api/auth/2fa/off').expect(403);
    await ann
      .post('/api/auth/2fa/confirm')
      .send({ code: '000000' })
      .expect(400);
    await ann
      .post('/api/auth/2fa/confirm')
      .send({ code: code(secret, 1) })
      .expect(200);
    const fresh = await ann.post('/api/auth/2fa/recovery-codes').expect(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);
    expect(fresh.body.recoveryCodes).not.toContain(codes[0]);

    await clearMailbox();
    await ann.post('/api/auth/2fa/off').expect(200);
    await waitForMail(ANN.email, 'Two-step sign-in is off');
    expect(await prisma.recoveryCode.count({ where: { userId: annId } })).toBe(
      0,
    );
    await client(app)
      .post('/api/auth/login')
      .send({ email: ANN.email, password: 'secret123' })
      .expect(200);
  });

  it('passkeys: added after the password, then the second step instead of the code', async () => {
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    const key = new SoftPasskey(ORIGIN);

    const options = await ann
      .post('/api/auth/2fa/passkeys/options')
      .send({ password: 'secret123' })
      .expect(200);
    expect(options.body.options).toMatchObject({
      rp: { id: 'localhost' },
      user: { name: 'ann' },
    });
    // An answer made for another site is refused.
    await ann
      .post('/api/auth/2fa/passkeys')
      .send({
        name: 'Phone',
        response: new SoftPasskey('https://evil.example').create(
          options.body.options,
        ),
      })
      .expect(400);
    const again = await ann
      .post('/api/auth/2fa/passkeys/options')
      .send({ password: 'secret123' })
      .expect(200);
    const added = await ann
      .post('/api/auth/2fa/passkeys')
      .send({ name: 'Phone', response: key.create(again.body.options) })
      .expect(200);
    expect(added.body.recoveryCodes).toHaveLength(10);

    const laptop = client(app);
    expect(await password(laptop)).toEqual({ methods: ['passkey'] });
    const request = await laptop
      .post('/api/auth/login/2fa/passkey-options')
      .expect(200);
    expect(request.body.options.allowCredentials).toEqual([
      expect.objectContaining({ id: key.id }),
    ]);
    // Someone else's key does not pass.
    await laptop
      .post('/api/auth/login/2fa/passkey')
      .send({ response: new SoftPasskey(ORIGIN).get(request.body.options) })
      .expect(400);
    const second = await laptop
      .post('/api/auth/login/2fa/passkey-options')
      .expect(200);
    await laptop
      .post('/api/auth/login/2fa/passkey')
      .send({ response: key.get(second.body.options) })
      .expect(200);
    const stored = await prisma.passkey.findFirstOrThrow({
      where: { userId: annId },
    });
    expect(stored.counter).toBe(1n);
    expect(stored.lastUsedAt).not.toBeNull();

    // The last way removed turns the step off.
    await ann.delete(`/api/auth/2fa/passkeys/${stored.id}`).expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: annId } }))
        .twoFactorAt,
    ).toBeNull();
  });

  it('an admin: the panel needs the step, it stays on, never Google', async () => {
    const boss = client(app);
    const bossId = await signUp(app, boss, {
      email: 'boss@example.com',
      username: 'boss',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { id: bossId },
      data: { role: 'ADMIN' },
    });
    await boss
      .get('/api/admin/dashboard')
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('twoFactorRequired'));
    // Till then the session sees what a user sees.
    expect((await boss.get('/api/auth/me').expect(200)).body.role).toBe(
      'ADMIN',
    );
    expect((await boss.get('/api/auth/2fa').expect(200)).body).toMatchObject({
      enabled: false,
      required: true,
    });

    const { secret } = await turnOnApp(boss);
    await boss.get('/api/admin/dashboard').expect(200);
    await boss
      .post('/api/auth/2fa/off')
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('twoFactorAdmin'));
    await boss
      .delete('/api/auth/2fa/app')
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('twoFactorAdmin'));

    // A new sign-in passes the step and the panel opens.
    const laptop = client(app);
    await password(laptop, 'boss@example.com');
    await laptop
      .post('/api/auth/login/2fa')
      .send({ code: code(secret, 1) })
      .expect(200);
    await laptop.get('/api/admin/dashboard').expect(200);

    // Google: an admin is refused, linked or found by the address.
    const auth = app.get(AuthService);
    await expect(
      auth.loginWithGoogle(
        {
          sub: 'g-boss',
          email: 'boss@example.com',
          emailVerified: true,
          name: 'Boss',
        },
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'adminGoogle' } });
    await prisma.oAuthAccount.create({
      data: { provider: 'GOOGLE', providerUserId: 'g-boss', userId: bossId },
    });
    await expect(
      auth.loginWithGoogle({ sub: 'g-boss', emailVerified: false }, {}),
    ).rejects.toMatchObject({ response: { code: 'adminGoogle' } });
  });

  it('Google: a linked account is trusted, a new one is not linked by the address', async () => {
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    await turnOnApp(ann);
    const auth = app.get(AuthService);
    await expect(
      auth.loginWithGoogle(
        {
          sub: 'g-mailbox-thief',
          email: ANN.email,
          emailVerified: true,
          name: 'Ann',
        },
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'googleLinkTwoFactor' } });
    expect(await prisma.oAuthAccount.count()).toBe(0);

    await prisma.oAuthAccount.create({
      data: { provider: 'GOOGLE', providerUserId: 'g-ann', userId: annId },
    });
    const tokens = await auth.loginWithGoogle(
      { sub: 'g-ann', email: ANN.email, emailVerified: true, name: 'Ann' },
      {},
    );
    expect(tokens?.userId).toBe(annId);
  });

  it('an admin resets the step for a lost phone; the owner hears of it', async () => {
    const boss = client(app);
    const bossId = await signUp(app, boss, {
      email: 'boss@example.com',
      username: 'boss',
      password: 'secret123',
    });
    await makeAdmin(prisma, bossId);
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    await turnOnApp(ann);
    expect(
      (await boss.get(`/api/admin/users/${annId}`).expect(200)).body.twoFactor,
    ).toBe(true);
    await boss
      .post(`/api/admin/users/${bossId}/two-factor/reset`)
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('selfAction'));

    await clearMailbox();
    await boss.post(`/api/admin/users/${annId}/two-factor/reset`).expect(200);
    await waitForMail(ANN.email, 'Two-step sign-in was reset');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.twoFactorReset' },
    });
    expect(audit).toMatchObject({ actorId: bossId, targetId: annId });
    await client(app)
      .post('/api/auth/login')
      .send({ email: ANN.email, password: 'secret123' })
      .expect(200);
    await boss.post(`/api/admin/users/${annId}/two-factor/reset`).expect(409);
  });

  it('only a password is protected: a Google-only account cannot turn it on', async () => {
    const ann = client(app);
    const annId = await signUp(app, ann, ANN);
    await prisma.user.update({
      where: { id: annId },
      data: { passwordHash: null },
    });
    expect((await ann.get('/api/auth/2fa').expect(200)).body.available).toBe(
      false,
    );
    await ann
      .post('/api/auth/2fa/app/setup')
      .send({})
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('twoFactorNeedsPassword'));
  });
});

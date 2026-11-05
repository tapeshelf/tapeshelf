import { createHash, createHmac, randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AppSignInService } from '../src/modules/auth/app-sign-in.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { GoogleService } from '../src/modules/auth/google.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { clearMailbox, extractToken, waitForMail } from './utils/mailpit.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';

const ANN = {
  email: 'Ann@Example.com',
  username: 'Ann_V',
  password: 'secret123',
  displayName: 'Ann',
};
const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

/** The `name=value` pairs a response sets, as a browser would send them back. */
function cookiesOf(res: request.Response, only?: string): string {
  return (res.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0]!)
    .filter((c) => !c.endsWith('=') && (!only || c.startsWith(`${only}=`)))
    .join('; ');
}

/** A cookie signed as cookie-parser does (cookie-signature: HMAC-SHA256, base64 without padding). */
function signedCookie(name: string, value: string, secret: string): string {
  const mac = createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');
  return `${name}=${encodeURIComponent(`s:${value}.${mac}`)}`;
}

describe('auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await clearMailbox();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registration', () => {
    it('creates the account, signs in, normalizes email/username and sends the verification mail', async () => {
      const c = client(app);
      const res = await c.post('/api/auth/register').send(ANN).expect(200);
      expect(res.body).toMatchObject({
        email: 'ann@example.com',
        username: 'ann_v',
        displayName: 'Ann',
        emailVerified: false,
        role: 'USER',
        tier: 'BASIC',
        hasPassword: true,
        hasGoogle: false,
      });
      const cookies = (res.headers['set-cookie'] as unknown as string[]).join(
        ';',
      );
      expect(cookies).toContain('vs_access=');
      expect(cookies).toContain('vs_refresh=');
      expect(cookies).toContain('HttpOnly');

      await c.get('/api/auth/me').expect(200);
      const mail = await waitForMail('ann@example.com', 'Confirm');
      expect(mail.text).toContain('/verify-email?token=');
    });

    it('rejects duplicates, reserved names and weak passwords with stable codes', async () => {
      const c = client(app);
      await c.post('/api/auth/register').send(ANN).expect(200);
      expect(
        (
          await c
            .post('/api/auth/register')
            .send({ ...ANN, username: 'other' })
            .expect(409)
        ).body.code,
      ).toBe('emailTaken');
      expect(
        (
          await c
            .post('/api/auth/register')
            .send({ ...ANN, email: 'b@example.com', username: 'ANN_v' })
            .expect(409)
        ).body.code,
      ).toBe('usernameTaken');
      expect(
        (
          await c
            .post('/api/auth/register')
            .send({ ...ANN, email: 'c@example.com', username: 'admin' })
            .expect(400)
        ).body.code,
      ).toBe('usernameReserved');
      const weak = await c
        .post('/api/auth/register')
        .send({
          ...ANN,
          email: 'd@example.com',
          username: 'dd_dd',
          password: 'onlyletters',
        })
        .expect(400);
      expect(weak.body.code).toBe('validation');
    });

    it('requires the CSRF header on state-changing requests', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(ANN)
        .expect(403);
      expect(res.body.code).toBe('csrf');
    });
  });

  describe('email verification', () => {
    it('verifies with the mailed token exactly once', async () => {
      const c = client(app);
      await c.post('/api/auth/register').send(ANN).expect(200);
      const token = extractToken(
        (await waitForMail('ann@example.com', 'Confirm')).text,
        '/verify-email',
      );
      await c.post('/api/auth/verify-email').send({ token }).expect(200);
      expect((await c.get('/api/auth/me').expect(200)).body.emailVerified).toBe(
        true,
      );
      expect(
        (await c.post('/api/auth/verify-email').send({ token }).expect(400))
          .body.code,
      ).toBe('tokenInvalid');
      expect(
        (await c.post('/api/auth/resend-verification').expect(400)).body.code,
      ).toBe('emailAlreadyVerified');
    });

    it('resend invalidates the previous token', async () => {
      const c = client(app);
      await c.post('/api/auth/register').send(ANN).expect(200);
      const first = extractToken(
        (await waitForMail('ann@example.com', 'Confirm')).text,
        '/verify-email',
      );
      await clearMailbox();
      await c.post('/api/auth/resend-verification').expect(200);
      const second = extractToken(
        (await waitForMail('ann@example.com', 'Confirm')).text,
        '/verify-email',
      );
      expect(second).not.toBe(first);
      expect(
        (
          await c
            .post('/api/auth/verify-email')
            .send({ token: first })
            .expect(400)
        ).body.code,
      ).toBe('tokenInvalid');
      await c
        .post('/api/auth/verify-email')
        .send({ token: second })
        .expect(200);
    });
  });

  describe('login, refresh, logout', () => {
    beforeEach(async () => {
      await client(app).post('/api/auth/register').send(ANN).expect(200);
    });

    it('signs in with the right password and rejects the wrong one', async () => {
      const c = client(app);
      expect(
        (
          await c
            .post('/api/auth/login')
            .send({ email: ANN.email, password: 'wrong1234' })
            .expect(401)
        ).body.code,
      ).toBe('invalidCredentials');
      expect(
        (
          await c
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'wrong1234' })
            .expect(401)
        ).body.code,
      ).toBe('invalidCredentials');
      await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      await c.get('/api/auth/me').expect(200);
    });

    it('locks the account for a while after 10 failed attempts', async () => {
      const c = client(app);
      for (let i = 0; i < 10; i++)
        await c
          .post('/api/auth/login')
          .send({ email: ANN.email, password: 'wrong1234' })
          .expect(401);
      const locked = await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(429);
      expect(locked.body.code).toBe('tooManyAttempts');
      expect(locked.body.message).toMatch(/minute/);
    });

    it('rotates the refresh token and rejects a reused one', async () => {
      const c = client(app);
      const login = await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const oldRefresh = (login.headers['set-cookie'] as unknown as string[])
        .find((x) => x.startsWith('vs_refresh='))!
        .split(';')[0]!;
      await c.post('/api/auth/refresh').expect(200); // agent now holds the rotated cookie
      await c.get('/api/auth/me').expect(200);
      const reused = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', oldRefresh)
        .expect(401);
      expect(reused.body.code).toBe('sessionExpired');
    });

    it('two refreshes with the same token at once: one gets the new token, the session lives on', async () => {
      const login = await client(app)
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const refresh = cookiesOf(login, 'vs_refresh');
      const once = () =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('X-Requested-With', 'XMLHttpRequest')
          .set('Cookie', refresh);
      // Many at once, so that some really overlap in the database.
      const answers = await Promise.all(Array.from({ length: 8 }, once));
      const won = answers.filter((a) => a.status === 200);
      expect(won).toHaveLength(1);
      for (const lost of answers.filter((a) => a.status !== 200)) {
        expect(lost.status).toBe(401);
        expect(lost.body.code).toBe('sessionExpired');
      }
      // The winner's token is the session's: it refreshes again and stays signed in.
      const next = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookiesOf(won[0]!, 'vs_refresh'))
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookiesOf(next))
        .expect(200);
    });

    it('a session started by an app is listed with what the app said about itself', async () => {
      const said = 'android/1.4.0 (Test phone; Android 15)';
      const fromApp = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-Tapeshelf-Client', said)
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const browser = client(app);
      await browser
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const list = (await browser.get('/api/auth/sessions').expect(200))
        .body as { client: string | null; current: boolean }[];
      // Registration signed Ann in too: three sessions, one of them the app's.
      expect(list).toHaveLength(3);
      expect(list.map((s) => s.client).filter(Boolean)).toEqual([said]);
      expect(list.find((s) => s.current)!.client).toBeNull();

      // The app updated: its next refresh says the new version.
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-Tapeshelf-Client', 'android/1.5.0 (Test phone; Android 15)')
        .set('Cookie', cookiesOf(fromApp, 'vs_refresh'))
        .expect(200);
      const after = (await browser.get('/api/auth/sessions').expect(200))
        .body as { client: string | null }[];
      expect(after.map((s) => s.client)).toContain(
        'android/1.5.0 (Test phone; Android 15)',
      );
    });

    it('a public page asked by an app that believes it is signed in, without a live access cookie, says 401 so the app renews the session', async () => {
      const c = client(app);
      const login = await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      // The browser has dropped the expired access cookie; only the refresh cookie is left.
      const server = request(app.getHttpServer());
      const refreshOnly = cookiesOf(login, 'vs_refresh');
      const expired = await server
        .get('/api/users/ann_v')
        .set('Cookie', refreshOnly)
        .set('X-Signed-In', '1')
        .expect(401);
      expect(expired.body.code).toBe('sessionExpired');
      // A guest (no such header) still gets the public page; so does a live session with it.
      await server.get('/api/users/ann_v').expect(200);
      await c.get('/api/users/ann_v').set('X-Signed-In', '1').expect(200);
      // The owner looking at their own page as a visitor: a public read forgets the
      // session for that one request, even with the signed-in header along.
      expect(
        (await c.get('/api/users/ann_v/collection').expect(200)).body.mode,
      ).toBe('OWNER');
      expect(
        (
          await c
            .get('/api/users/ann_v/collection')
            .set('X-As-Guest', '1')
            .set('X-Signed-In', '1')
            .expect(200)
        ).body.mode,
      ).toBe('VISITOR');
      await c.get('/api/auth/me').set('X-As-Guest', '1').expect(200); // not public: unaffected
    });

    it('logout clears cookies and invalidates the session', async () => {
      const c = client(app);
      await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      await c.post('/api/auth/logout').expect(200);
      await c.get('/api/auth/me').expect(401);
      await c.post('/api/auth/refresh').expect(401);
    });

    it('after logout even the cookies saved before it are dead, and the browser is told to drop them', async () => {
      const c = client(app);
      const login = await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const saved = cookiesOf(login);
      const out = await c.post('/api/auth/logout').expect(200);
      const cleared = out.headers['set-cookie'] as unknown as string[];
      for (const [name, path] of [
        ['vs_access', '/'],
        ['vs_refresh', '/api/auth'],
      ])
        expect(
          cleared.find(
            (x) =>
              x.startsWith(`${name}=;`) &&
              x.includes(`Path=${path}`) &&
              x.includes('Expires=Thu, 01 Jan 1970'),
          ),
        ).toBeDefined();
      const server = app.getHttpServer();
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', saved)
        .expect(401);
      await request(server)
        .post('/api/auth/refresh')
        .set(XHR)
        .set('Cookie', saved)
        .expect(401);
      expect(
        (await request(server).get('/api/auth/session').set('Cookie', saved))
          .body,
      ).toEqual({ username: null });
    });

    it('tells the site who is signed in, without rotating the session', async () => {
      const server = app.getHttpServer();
      expect(
        (await request(server).get('/api/auth/session').expect(200)).body,
      ).toEqual({ username: null });
      const login = await client(app)
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      // the short access cookie may have expired: the refresh cookie alone is enough
      const refreshOnly = cookiesOf(login, 'vs_refresh');
      expect(
        (
          await request(server)
            .get('/api/auth/session')
            .set('Cookie', refreshOnly)
            .expect(200)
        ).body,
      ).toEqual({ username: 'ann_v' });
      await request(server)
        .post('/api/auth/refresh')
        .set(XHR)
        .set('Cookie', refreshOnly)
        .expect(200); // still the same refresh token: not rotated by the check
    });

    it('refuses banned accounts everywhere', async () => {
      const c = client(app);
      await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      await prisma.user.update({
        where: { email: 'ann@example.com' },
        data: { status: 'BANNED', bannedAt: new Date() },
      });
      expect((await c.get('/api/auth/me').expect(403)).body.code).toBe(
        'accountBanned',
      );
      expect(
        (
          await client(app)
            .post('/api/auth/login')
            .send({ email: ANN.email, password: ANN.password })
            .expect(403)
        ).body.code,
      ).toBe('accountBanned');
      expect((await c.post('/api/auth/refresh').expect(401)).body.code).toBe(
        'sessionExpired',
      );
    });
  });

  describe('passwords', () => {
    beforeEach(async () => {
      await client(app).post('/api/auth/register').send(ANN).expect(200);
      await clearMailbox();
    });

    it('resets the password through the mailed link and signs out all sessions', async () => {
      const other = client(app);
      await other
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);

      await client(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200);
      await client(app)
        .post('/api/auth/forgot-password')
        .send({ email: ANN.email })
        .expect(200);
      const token = extractToken(
        (await waitForMail('ann@example.com', 'Reset')).text,
        '/reset-password',
      );
      await client(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'newpass456' })
        .expect(200);

      await other.get('/api/auth/me').expect(401); // old session revoked
      await client(app)
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(401);
      await client(app)
        .post('/api/auth/login')
        .send({ email: ANN.email, password: 'newpass456' })
        .expect(200);
      expect(
        (
          await client(app)
            .post('/api/auth/reset-password')
            .send({ token, password: 'again789x' })
            .expect(400)
        ).body.code,
      ).toBe('tokenInvalid');
    });

    it('changes the password with the current one and keeps only this session', async () => {
      const c = client(app);
      await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const other = client(app);
      await other
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      expect(
        (
          await c
            .post('/api/auth/change-password')
            .send({ currentPassword: 'nope12345', newPassword: 'newpass456' })
            .expect(400)
        ).body.code,
      ).toBe('wrongPassword');
      await c
        .post('/api/auth/change-password')
        .send({ currentPassword: ANN.password, newPassword: 'newpass456' })
        .expect(200);
      await c.get('/api/auth/me').expect(200);
      await other.get('/api/auth/me').expect(401);
    });

    it('lists sessions and revokes one', async () => {
      const c = client(app);
      await c
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const other = client(app);
      await other
        .post('/api/auth/login')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const list = (await c.get('/api/auth/sessions').expect(200)).body as {
        id: string;
        current: boolean;
      }[];
      expect(list.length).toBeGreaterThanOrEqual(2);
      const target = list.find((s) => !s.current)!;
      await c.delete(`/api/auth/sessions/${target.id}`).expect(200);
      await other.get('/api/auth/me').expect(401);
      await c.get('/api/auth/me').expect(200);
      // An id that is no uuid reaches the database: a 400 of the request, not a 500.
      expect(
        (await c.delete('/api/auth/sessions/not-a-uuid').expect(400)).body,
      ).toMatchObject({ statusCode: 400, code: 'badRequest' });
    });

    it('records the visitor’s address behind a chain of private proxies (a proxy → Caddy)', async () => {
      // The outer proxy sets the client address, Caddy appends that proxy's container address, and the
      // API sees Caddy as the peer. Rate limits and session lists need the first public address.
      const c = client(app);
      await c
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.7, 10.0.1.4')
        .send({ email: ANN.email, password: ANN.password })
        .expect(200);
      const list = (await c.get('/api/auth/sessions').expect(200)).body as {
        current: boolean;
        ip: string | null;
      }[];
      expect(list.find((s) => s.current)?.ip).toBe('203.0.113.7');
    });
  });

  it('closed sign-ups: nobody new gets in, those who have an account do', async () => {
    const server = app.getHttpServer();
    const settings = app.get(SettingsService);
    await request(server)
      .post('/api/auth/register')
      .set(XHR)
      .send({
        email: 'early@example.com',
        username: 'early',
        password: 'early-pass-1',
      })
      .expect(200);
    await settings.set('registrationOpen', false);
    const refused = await request(server)
      .post('/api/auth/register')
      .set(XHR)
      .send({
        email: 'late@example.com',
        username: 'latecomer',
        password: 'late-pass-1',
      })
      .expect(403);
    expect(refused.body.code).toBe('registrationClosed');
    await request(server)
      .post('/api/auth/login')
      .set(XHR)
      .send({
        email: 'early@example.com',
        password: 'early-pass-1',
      })
      .expect(200);
    expect(
      (await request(server).get('/api/site').expect(200)).body
        .registrationOpen,
    ).toBe(false);
    await settings.set('registrationOpen', true);
  });

  describe('google', () => {
    it('an account whose address nobody proved goes to the person Google vouches for alone', async () => {
      const server = app.getHttpServer();
      const planted = {
        email: 'victim@example.com',
        username: 'planted',
        password: 'attacker-pass-1',
      };
      const attacker = await request(server)
        .post('/api/auth/register')
        .set(XHR)
        .send(planted)
        .expect(200);
      const identity = {
        sub: 'google-sub-victim',
        email: planted.email,
        emailVerified: true,
        name: 'Victim',
      };
      expect(
        await app.get(AuthService).loginWithGoogle(identity, {}),
      ).toMatchObject({ username: 'planted' });
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', cookiesOf(attacker))
        .expect(401);
      await request(server)
        .post('/api/auth/login')
        .set(XHR)
        .send({ email: planted.email, password: planted.password })
        .expect(401);
    });

    it('reports as disabled and refuses to start without configuration', async () => {
      const c = client(app);
      expect((await c.get('/api/auth/google/status').expect(200)).body).toEqual(
        { enabled: false },
      );
      expect((await c.get('/api/auth/google').expect(503)).body.code).toBe(
        'googleNotConfigured',
      );
      expect(
        (
          await c
            .post('/api/auth/google/complete')
            .send({ username: 'ann_v' })
            .expect(400)
        ).body.code,
      ).toBe('googleSignupExpired');
    });

    it('a Google sign-up makes the new account even in a browser still signed in as someone else, and ends that session', async () => {
      const server = app.getHttpServer();
      const ann = await client(app)
        .post('/api/auth/register')
        .send(ANN)
        .expect(200);
      const annCookies = cookiesOf(ann);
      const secret = app.get(ConfigService).get<string>('COOKIE_SECRET')!;
      const pending = signedCookie(
        'vs_oauth_signup',
        JSON.stringify({
          identity: {
            sub: 'google-sub-1',
            email: 'new.person@gmail.com',
            emailVerified: true,
            name: 'New Person',
          },
          returnTo: '/',
        }),
        secret,
      );
      const res = await request(server)
        .post('/api/auth/google/complete')
        .set(XHR)
        .set('Cookie', `${annCookies}; ${pending}`)
        .send({ username: 'newbie' })
        .expect(200);
      expect(res.body).toMatchObject({
        username: 'newbie',
        email: 'new.person@gmail.com',
      });
      expect(
        (
          await request(server)
            .get('/api/auth/me')
            .set('Cookie', cookiesOf(res))
            .expect(200)
        ).body.username,
      ).toBe('newbie');
      // Ann's session in that browser is over, not left behind the new cookies
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', annCookies)
        .expect(401);
      await request(server)
        .post('/api/auth/refresh')
        .set(XHR)
        .set('Cookie', annCookies)
        .expect(401);
      expect(
        await prisma.oAuthAccount.count({
          where: { providerUserId: 'google-sub-1' },
        }),
      ).toBe(1);
      expect(await prisma.user.count()).toBe(2);
    });
  });

  describe('profile and username', () => {
    it('starts the account with the guest consent to sensitive content, off by default', async () => {
      const c = client(app);
      const plain = (await c.post('/api/auth/register').send(ANN).expect(200))
        .body;
      expect(plain.showSensitive).toBe(false);
      const agreed = (
        await client(app)
          .post('/api/auth/register')
          .send({
            ...ANN,
            email: 'bob@example.com',
            username: 'bob',
            showSensitive: true,
          })
          .expect(200)
      ).body;
      expect(agreed.showSensitive).toBe(true);
    });

    it('updates profile fields and localizes errors with the user locale', async () => {
      const c = client(app);
      await c.post('/api/auth/register').send(ANN).expect(200);
      // A new account follows its device until the person picks a theme.
      expect((await c.get('/api/auth/me').expect(200)).body.theme).toBe(
        'SYSTEM',
      );
      const me = (
        await c
          .patch('/api/me')
          .send({
            displayName: 'Anna',
            bio: ' hello ',
            locale: 'ru',
            theme: 'LIGHT',
            accentColor: '#AABBCC',
            coverPattern: 4242,
            showSensitive: true,
          })
          .expect(200)
      ).body;
      expect(me).toMatchObject({
        displayName: 'Anna',
        bio: 'hello',
        locale: 'ru',
        theme: 'LIGHT',
        accentColor: '#aabbcc',
        coverPattern: 4242,
        showSensitive: true,
      });
      expect(
        (await c.get('/api/users/ann_v').expect(200)).body.coverPattern,
      ).toBe(4242);
      await c.patch('/api/me').send({ coverPattern: -1 }).expect(400);
      // Text limits: a blank name is never stored; the bio and the exchange wishes are short.
      await c.patch('/api/me').send({ displayName: '   ' }).expect(400);
      await c
        .patch('/api/me')
        .send({ bio: 'b'.repeat(301) })
        .expect(400);
      await c
        .patch('/api/me')
        .send({ exchangeWants: 'w'.repeat(201) })
        .expect(400);
      await c
        .patch('/api/me')
        .send({ bio: 'b'.repeat(300), exchangeAvoid: 'a'.repeat(200) })
        .expect(200);
      const err = await c
        .patch('/api/me/username')
        .send({ username: 'admin' })
        .expect(400);
      expect(err.body.code).toBe('usernameReserved');
      expect(err.body.message).toBe('Это имя пользователя зарезервировано.');
    });

    it('changes the username once per period, redirects the old one and keeps it reserved', async () => {
      const c = client(app);
      await c.post('/api/auth/register').send(ANN).expect(200);
      expect((await c.get('/api/users/ANN_V').expect(200)).body.username).toBe(
        'ann_v',
      );

      await c
        .patch('/api/me/username')
        .send({ username: 'ann_new' })
        .expect(200);
      expect((await c.get('/api/users/ann_v').expect(200)).body.username).toBe(
        'ann_new',
      ); // canonical name → client redirects
      expect(
        (
          await c
            .patch('/api/me/username')
            .send({ username: 'ann_third' })
            .expect(400)
        ).body.code,
      ).toBe('usernameChangeTooSoon');

      const bob = client(app);
      await bob
        .post('/api/auth/register')
        .send({
          email: 'bob@example.com',
          username: 'bob',
          password: 'secret123',
        })
        .expect(200);
      expect(
        (
          await bob
            .patch('/api/me/username')
            .send({ username: 'ann_v' })
            .expect(409)
        ).body.code,
      ).toBe('usernameTaken');
      expect(
        (
          await bob
            .post('/api/auth/register')
            .send({
              email: 'x@example.com',
              username: 'ann_v',
              password: 'secret123',
            })
            .expect(409)
        ).body.code,
      ).toBe('usernameTaken');
      await c.get('/api/users/nobody_here').expect(404);
    });

    describe('started by the phone app', () => {
      /** What the app keeps (the secret) and what it sends when it starts the sign-in (its hash). */
      const secret = () => {
        const verifier = randomBytes(32).toString('base64url');
        return {
          verifier,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
        };
      };
      const APP = 'android/1.4.0 (Test phone; Android 15)';
      const exchange = (code: string, verifier: string) =>
        request(app.getHttpServer())
          .post('/api/auth/app/exchange')
          .set(XHR)
          .set('X-Tapeshelf-Client', APP)
          .send({ code, verifier });
      const codeOf = (url: string) => new URL(url).searchParams.get('code')!;

      it('a sign-up ends with a hand-over, not a session in the browser; the app trades the code for its own', async () => {
        const server = app.getHttpServer();
        const { verifier, challenge } = secret();
        const cookieSecret = app
          .get(ConfigService)
          .get<string>('COOKIE_SECRET')!;
        const pending = signedCookie(
          'vs_oauth_signup',
          JSON.stringify({
            identity: {
              sub: 'google-sub-app-1',
              email: 'phone.person@gmail.com',
              emailVerified: true,
              name: 'Phone Person',
            },
            returnTo: null,
            app: challenge,
          }),
          cookieSecret,
        );
        const res = await request(server)
          .post('/api/auth/google/complete')
          .set(XHR)
          .set('Cookie', pending)
          .send({ username: 'phoneperson' })
          .expect(200);
        expect(res.body.username).toBe('phoneperson');
        expect(res.body.appRedirect).toMatch(
          /^tapeshelf:\/\/app\/auth\/google\?code=[\w-]{20,}$/,
        );
        // Nothing of the sign-in stays in the browser.
        expect(cookiesOf(res)).not.toMatch(/vs_access|vs_refresh/);

        const code = codeOf(res.body.appRedirect);
        const signedIn = await exchange(code, verifier).expect(200);
        expect(signedIn.body.username).toBe('phoneperson');
        const cookies = cookiesOf(signedIn);
        expect(cookies).toMatch(/vs_access=/);
        expect(cookies).toMatch(/vs_refresh=/);
        const sessions = (
          await request(server)
            .get('/api/auth/sessions')
            .set('Cookie', cookies)
            .expect(200)
        ).body as { client: string | null; current: boolean }[];
        // One session, the app's own.
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({ client: APP, current: true });

        // A code works once.
        expect((await exchange(code, verifier).expect(400)).body.code).toBe(
          'googleFailed',
        );
      });

      it('the code is worth nothing without the secret, and the wrong secret spends it', async () => {
        const ann = await client(app)
          .post('/api/auth/register')
          .send(ANN)
          .expect(200);
        const handOver = app.get(AppSignInService);
        const { verifier, challenge } = secret();

        const stolen = await handOver.issue(ann.body.id, challenge);
        const wrong = await exchange(stolen, secret().verifier).expect(400);
        expect(wrong.body.code).toBe('googleFailed');
        expect(cookiesOf(wrong)).not.toMatch(/vs_access|vs_refresh/);
        await exchange(stolen, verifier).expect(400);

        const good = await handOver.issue(ann.body.id, challenge);
        expect((await exchange(good, verifier).expect(200)).body.username).toBe(
          'ann_v',
        );

        // Not a code at all, and a secret of the wrong shape.
        await exchange('x'.repeat(43), verifier).expect(400);
        expect((await exchange(good, 'short').expect(400)).body.code).toBe(
          'validation',
        );
      });

      it('an account that exists comes back to the app from the callback with a code; a failure, with its reason', async () => {
        const server = app.getHttpServer();
        await client(app).post('/api/auth/register').send(ANN).expect(200);
        const { verifier, challenge } = secret();
        const cookieSecret = app
          .get(ConfigService)
          .get<string>('COOKIE_SECRET')!;
        const started = (withApp: boolean) =>
          signedCookie(
            'vs_oauth',
            JSON.stringify({
              state: 'state-1',
              verifier: 'google-verifier',
              returnTo: null,
              app: withApp ? challenge : null,
            }),
            cookieSecret,
          );
        const google = vi.spyOn(app.get(GoogleService), 'exchange');
        try {
          google.mockResolvedValue({
            sub: 'google-sub-ann',
            email: ANN.email.toLowerCase(),
            emailVerified: true,
            name: 'Ann',
          });
          const back = await request(server)
            .get('/api/auth/google/callback?code=abc&state=state-1')
            .set('Cookie', started(true))
            .expect(302);
          expect(back.headers.location).toMatch(
            /^tapeshelf:\/\/app\/auth\/google\?code=[\w-]{20,}$/,
          );
          expect(cookiesOf(back)).not.toMatch(/vs_access|vs_refresh/);
          const signedIn = await exchange(
            codeOf(back.headers.location),
            verifier,
          ).expect(200);
          expect(signedIn.body.username).toBe('ann_v');

          // The same sign-in started by a browser is as it was: cookies and the person's page.
          const browser = await request(server)
            .get('/api/auth/google/callback?code=abc&state=state-1')
            .set('Cookie', started(false))
            .expect(302);
          expect(browser.headers.location).toMatch(/\/@ann_v$/);
          expect(cookiesOf(browser)).toMatch(/vs_refresh=/);

          google.mockRejectedValue(new Error('google said no'));
          const failed = await request(server)
            .get('/api/auth/google/callback?error=access_denied&state=state-1')
            .set('Cookie', started(true))
            .expect(302);
          expect(failed.headers.location).toBe(
            'tapeshelf://app/auth/google?error=googleFailed',
          );
        } finally {
          google.mockRestore();
        }
      });
    });
  });
});

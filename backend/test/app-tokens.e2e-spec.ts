import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AdminOverviewService } from '../src/modules/admin/admin-overview.service.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { ensureFixtures, fixtureBytes } from './utils/fixtures.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

ensureFixtures();
const ANN = {
  email: 'ann@example.com',
  username: 'ann',
  password: 'secret123',
};
const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

/** A PKCE pair as the extension makes it. */
function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

/**
 * Connected apps: the browser extension connects through the sign-in window,
 * uploads with its token and nothing else, counts toward its daily limit, and can be disconnected.
 */
describe('connected apps (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let settings: SettingsService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await settings.set('tiers', SETTING_DEFAULTS.tiers);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Ann (or another) signed in, the extension connected: the session client and the token. */
  async function connected(name = 'Chrome on Linux', who = ANN) {
    const c = client(app);
    await signUp(app, c, who);
    const { verifier, challenge } = pkce();
    const state = randomBytes(12).toString('hex');
    const connect = await c
      .post('/api/app-tokens/connect')
      .send({ redirectUri: REDIRECT, codeChallenge: challenge, state, name })
      .expect(200);
    const to = new URL(connect.body.redirectTo);
    expect(to.origin + to.pathname).toBe(REDIRECT);
    expect(to.searchParams.get('state')).toBe(state);
    const code = to.searchParams.get('code')!;
    const issued = await request(app.getHttpServer())
      .post('/api/app-tokens/token')
      .send({ code, codeVerifier: verifier, redirectUri: REDIRECT })
      .expect(200);
    return {
      c,
      token: issued.body.token as string,
      code,
      verifier,
      issued: issued.body,
    };
  }

  /** Requests as the extension makes them: the token, no cookies, no X-Requested-With. */
  const ext = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`),
    del: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`),
  });

  it('connects through the sign-in window: a one-time code, the PKCE verifier, a token', async () => {
    const { c, token, code, verifier, issued } = await connected();
    expect(token).toMatch(/^tsa_/);
    expect(issued.user).toMatchObject({ username: 'ann' });
    // The code works once.
    const again = await request(app.getHttpServer())
      .post('/api/app-tokens/token')
      .send({ code, codeVerifier: verifier, redirectUri: REDIRECT })
      .expect(400);
    expect(again.body.code).toBe('appCodeInvalid');
    // A code needs its own verifier; and goes only to an extension's address.
    const other = pkce();
    const next = await c
      .post('/api/app-tokens/connect')
      .send({
        redirectUri: REDIRECT,
        codeChallenge: other.challenge,
        state: 'state-123',
        name: 'Edge',
      })
      .expect(200);
    const nextCode = new URL(next.body.redirectTo).searchParams.get('code');
    const wrong = await request(app.getHttpServer())
      .post('/api/app-tokens/token')
      .send({
        code: nextCode,
        codeVerifier: pkce().verifier,
        redirectUri: REDIRECT,
      })
      .expect(400);
    expect(wrong.body.code).toBe('appCodeInvalid');
    const bad = await c
      .post('/api/app-tokens/connect')
      .send({
        redirectUri: 'https://evil.example/cb',
        codeChallenge: other.challenge,
        state: 'state-123',
        name: 'x',
      })
      .expect(400);
    expect(bad.body.code).toBe('appRedirectInvalid');
    // Only a signed-in person allows an app.
    await request(app.getHttpServer())
      .post('/api/app-tokens/connect')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        redirectUri: REDIRECT,
        codeChallenge: other.challenge,
        state: 'state-123',
        name: 'x',
      })
      .expect(401);
  });

  it('the token opens the extension’s routes and nothing else', async () => {
    const { token } = await connected();
    const context = await ext(token).get('/api/extension/context').expect(200);
    expect(context.body).toMatchObject({
      user: { username: 'ann' },
      unlimited: false,
      emailVerified: true,
      limits: { perDay: 3, usedToday: 0 },
    });
    // No CSRF header needed: a token is no cookie.
    await ext(token)
      .post('/api/uploads')
      .send({ filename: 'a.mp4', size: 1000 })
      .expect(200);
    for (const url of [
      '/api/app-tokens',
      '/api/auth/me',
      '/api/me/anonymous-links',
    ])
      expect((await ext(token).get(url).expect(403)).body.code).toBe(
        'appTokenScope',
      );
    const unknown = await ext(`tsa_${'x'.repeat(43)}`)
      .get('/api/extension/context')
      .expect(401);
    expect(unknown.body.code).toBe('appTokenInvalid');
  });

  it('is listed in the settings, and disconnecting stops it at once', async () => {
    const { c, token } = await connected('Chrome on Windows');
    const list = (await c.get('/api/app-tokens').expect(200)).body;
    expect(list).toEqual([
      expect.objectContaining({ name: 'Chrome on Windows' }),
    ]);
    await c.delete(`/api/app-tokens/${list[0].id}`).expect(200);
    expect(
      (await ext(token).get('/api/extension/context').expect(401)).body.code,
    ).toBe('appTokenInvalid');
    expect((await c.get('/api/app-tokens').expect(200)).body).toEqual([]);
  });

  it('the extension can disconnect itself; signing out everywhere disconnects it too', async () => {
    const { c, token } = await connected();
    await ext(token).del('/api/app-tokens/current').expect(200);
    await ext(token).get('/api/extension/context').expect(401);
    // Connected again, then "sign out everywhere".
    const { verifier, challenge } = pkce();
    const to = new URL(
      (
        await c
          .post('/api/app-tokens/connect')
          .send({
            redirectUri: REDIRECT,
            codeChallenge: challenge,
            state: 'state-456',
            name: 'Brave',
          })
          .expect(200)
      ).body.redirectTo,
    );
    const second = (
      await request(app.getHttpServer())
        .post('/api/app-tokens/token')
        .send({
          code: to.searchParams.get('code'),
          codeVerifier: verifier,
          redirectUri: REDIRECT,
        })
        .expect(200)
    ).body.token;
    await ext(second).get('/api/extension/context').expect(200);
    await c.post('/api/auth/logout-all').expect(200);
    await ext(second).get('/api/extension/context').expect(401);
  });

  it('Free saves 3 videos a day through the extension; given-up ones and the site’s own uploads do not count; Pro has no limit', async () => {
    const { c, token } = await connected();
    const start = () =>
      ext(token).post('/api/uploads').send({ filename: 'a.mp4', size: 1000 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await start().expect(200)).body.id);
    const over = await start().expect(429);
    expect(over.body.code).toBe('extensionDailyLimit');
    expect(over.body.message).toContain('3');
    // A cancelled one gives its place back.
    await ext(token).del(`/api/uploads/${ids[0]}`).expect(200);
    await start().expect(200);
    await start().expect(429);
    // Uploads from the site are not the extension's.
    await c
      .post('/api/uploads')
      .send({ filename: 'b.mp4', size: 1000 })
      .expect(200);
    expect(
      (await ext(token).get('/api/extension/context').expect(200)).body.limits
        .usedToday,
    ).toBe(3);
    // Pro: no daily limit.
    await prisma.user.update({
      where: { username: 'ann' },
      data: { tier: 'PREMIUM', tierSource: 'ADMIN' },
    });
    const pro = await ext(token).get('/api/extension/context').expect(200);
    expect(pro.body).toMatchObject({ unlimited: true, limits: { perDay: 0 } });
    await start().expect(200);
  });

  it('an admin’s account keeps an admin’s limits through the token, without admin powers; Pro has Pro’s', async () => {
    const { token } = await connected();
    // More on the shelf than Free's quota allows.
    await prisma.user.update({
      where: { username: 'ann' },
      data: { storageUsedBytes: BigInt(100 * 1024 ** 3) },
    });
    const start = () =>
      ext(token).post('/api/uploads').send({ filename: 'a.mp4', size: 1000 });
    expect((await start().expect(400)).body.code).toBe('quotaExceeded');
    await prisma.user.update({
      where: { username: 'ann' },
      data: { role: 'ADMIN' },
    });
    const context = await ext(token).get('/api/extension/context').expect(200);
    expect(context.body).toMatchObject({
      unlimited: true,
      limits: { freeBytes: -1, perDay: 0, maxFileBytes: 0 },
    });
    for (let i = 0; i < 4; i++) await start().expect(200);
    // No file size limit either (Free's is 1 GiB): 3 GiB goes.
    await ext(token)
      .post('/api/uploads')
      .send({ filename: 'big.mp4', size: 3 * 1024 ** 3 })
      .expect(200);
    // Still no admin powers: the admin API and looking as another user stay closed.
    expect(
      (await ext(token).get('/api/admin/users').expect(403)).body.code,
    ).toBe('appTokenScope');
    // Pro: Pro's quota and no daily limit.
    await prisma.user.update({
      where: { username: 'ann' },
      data: {
        role: 'USER',
        tier: 'PREMIUM',
        tierSource: 'ADMIN',
        storageUsedBytes: 0n,
      },
    });
    await prisma.uploadSession.updateMany({ data: { status: 'ABORTED' } });
    const pro = await ext(token).get('/api/extension/context').expect(200);
    expect(pro.body).toMatchObject({ unlimited: true, limits: { perDay: 0 } });
    expect(pro.body.limits.freeBytes).toBe(200 * 1024 ** 3);
  });

  it('a video in two files: both uploaded, completed together, the source link kept for the author alone', async () => {
    const { c, token } = await connected();
    const video = fixtureBytes('dashVideo');
    const audio = fixtureBytes('dashAudio');
    const session = (
      await ext(token)
        .post('/api/uploads')
        .send({
          filename: 'clip.mp4',
          size: video.length,
          mimeType: 'video/mp4',
          audio: {
            filename: 'clip.m4a',
            size: audio.length,
            mimeType: 'audio/mp4',
          },
        })
        .expect(200)
    ).body;
    expect(session.audio).toMatchObject({
      filename: 'clip.m4a',
      size: audio.length,
      partCount: 1,
    });
    const put = async (track: 'video' | 'audio', bytes: Buffer) => {
      const presigned = (
        await ext(token)
          .post(`/api/uploads/${session.id}/parts`)
          .send({ partNumbers: [1], track })
          .expect(200)
      ).body;
      const res = await fetch(presigned.parts[0].url, {
        method: 'PUT',
        body: new Blob([Uint8Array.from(bytes)]),
      });
      expect(res.status).toBe(200);
      return [{ partNumber: 1, etag: res.headers.get('etag')! }];
    };
    const parts = await put('video', video);
    // Completing without the audio is refused: both or neither.
    await ext(token)
      .post(`/api/uploads/${session.id}/complete`)
      .send({ title: 'Clip', visibility: 'PRIVATE', parts })
      .expect(400);
    const audioParts = await put('audio', audio);
    const done = await ext(token)
      .post(`/api/uploads/${session.id}/complete`)
      .send({
        title: 'Clip',
        visibility: 'PRIVATE',
        parts,
        audioParts,
        sourceUrl: 'https://example.com/watch/42',
      })
      .expect(200);
    const row = await prisma.video.findUniqueOrThrow({
      where: { id: done.body.id },
    });
    expect(row.audioKey).toBe(`videos/${session.id}/audio.m4a`);
    expect(Number(row.audioSizeBytes)).toBe(audio.length);
    expect(row.sourceUrl).toBe('https://example.com/watch/42');
    const ann = await prisma.user.findUniqueOrThrow({
      where: { username: 'ann' },
    });
    expect(Number(ann.storageUsedBytes)).toBe(video.length + audio.length);

    // The video page shows the source to its author and to nobody else.
    await prisma.video.update({
      where: { id: row.id },
      data: { visibility: 'PUBLIC', status: 'READY' },
    });
    const mine = await c.get(`/api/users/ann/videos/${row.id}`).expect(200);
    expect(mine.body.sourceUrl).toBe('https://example.com/watch/42');
    const bob = client(app);
    await signUp(app, bob, {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    const theirs = await bob.get(`/api/users/ann/videos/${row.id}`).expect(200);
    expect(theirs.body.sourceUrl).toBeNull();
  });

  it('a stream whose length is known only at its end: declared as at most, charged as finished', async () => {
    const { token } = await connected();
    const video = fixtureBytes('dashVideo');
    const start = (size: number) =>
      ext(token)
        .post('/api/uploads')
        .send({ filename: 'live.ts', size, sizeIsMax: true })
        .expect(200);
    const put = async (id: string) => {
      const presigned = (
        await ext(token)
          .post(`/api/uploads/${id}/parts`)
          .send({ partNumbers: [1] })
          .expect(200)
      ).body;
      const res = await fetch(presigned.parts[0].url, {
        method: 'PUT',
        body: new Blob([Uint8Array.from(video)]),
      });
      return [{ partNumber: 1, etag: res.headers.get('etag')! }];
    };
    // Reserved as declared while it runs.
    const roomy = (await start(video.length + 5000)).body;
    expect(
      (await ext(token).get('/api/uploads/quota').expect(200)).body
        .reservedBytes,
    ).toBe(video.length + 5000);
    const parts = await put(roomy.id);
    const done = await ext(token)
      .post(`/api/uploads/${roomy.id}/complete`)
      .send({ title: 'Stream', visibility: 'PRIVATE', parts })
      .expect(200);
    const row = await prisma.video.findUniqueOrThrow({
      where: { id: done.body.id },
    });
    expect(Number(row.sizeBytes)).toBe(video.length);
    expect(
      Number(
        (
          await prisma.user.findUniqueOrThrow({
            where: { username: 'ann' },
          })
        ).storageUsedBytes,
      ),
    ).toBe(video.length);
    // More than declared is refused all the same.
    const tight = (await start(video.length - 1)).body;
    const tooMany = await put(tight.id);
    const over = await ext(token)
      .post(`/api/uploads/${tight.id}/complete`)
      .send({ title: 'Stream', visibility: 'PRIVATE', parts: tooMany })
      .expect(400);
    expect(over.body.code).toBe('uploadSizeMismatch');
  });

  it('the admin dashboard counts the extension’s funnel on the server alone', async () => {
    // Bob signed up 10 days ago and connects now: a connection, not a new account from it.
    const bob = await connected('Chrome on Mac', {
      email: 'bob@example.com',
      username: 'bob',
      password: 'secret123',
    });
    await prisma.user.update({
      where: { username: 'bob' },
      data: { createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    });
    // Ann signs up and connects at once: both; then saves a video through it.
    const { token } = await connected();
    const started = await ext(token)
      .post('/api/uploads')
      .send({ filename: 'a.mp4', size: 1000 })
      .expect(200);
    await prisma.uploadSession.update({
      where: { id: started.body.id },
      data: { status: 'COMPLETED' },
    });
    // An upload on the site itself does not count.
    await prisma.uploadSession.create({
      data: {
        userId: (
          await prisma.user.findUniqueOrThrow({ where: { username: 'ann' } })
        ).id,
        filename: 'b.mp4',
        declaredSize: 1000n,
        mimeType: 'video/mp4',
        key: 'x',
        s3UploadId: 'y',
        partSize: 16 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 3600_000),
        status: 'COMPLETED',
      },
    });
    const dash = await app.get(AdminOverviewService).dashboard();
    expect(dash.extension).toEqual({
      connections: 2,
      signups: 1,
      shelfSaves: 1,
      connected: 2,
    });
    // Disconnected: no longer counted as connected now.
    await ext(bob.token).del('/api/app-tokens/current').expect(200);
    expect(
      (await app.get(AdminOverviewService).dashboard()).extension.connected,
    ).toBe(1);
  });
});

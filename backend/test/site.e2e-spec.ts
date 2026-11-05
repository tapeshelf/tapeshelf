import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { API_LEVEL, MIN_CLIENT } from '../src/common/client-version.js';
import { SETTING_DEFAULTS } from '../src/modules/settings/settings.defaults.js';
import { createTestApp, resetDatabase } from './utils/test-app.js';

/** Instance settings and the operator's legal texts (.env.test: LEGAL_DIR=test/legal). */
describe('site (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    // Limits come from the database: start from the defaults whatever ran before.
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('describes the instance to guests, cacheably', async () => {
    const res = await request(app.getHttpServer()).get('/api/site').expect(200);
    expect(res.body).toEqual({
      name: 'tapeshelf',
      contactEmail: 'contact@example.test',
      siteUrl: null,
      legal: { terms: true, privacy: true, imprint: false },
      edition: 'cloud',
      plans: SETTING_DEFAULTS.tiers,
      captchaSiteKey: null,
      demo: null,
      emailEnabled: true,
      registrationOpen: true,
      // Where the public pictures come from: the app preconnects to it.
      mediaOrigin: 'http://localhost:9100',
      // What an app needs to know before anything else: how much the API can do and the oldest
      // app the server still talks to.
      api: { level: API_LEVEL, minClient: MIN_CLIENT },
      // No push key in the tests: the app asks for news itself.
      push: false,
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('tells an app older than it accepts to update, on any request; others pass', async () => {
    const min = MIN_CLIENT.android!;
    const server = app.getHttpServer();
    const old = await request(server)
      .get('/api/site')
      .set('X-Tapeshelf-Client', 'android/0.0.1 (Test phone; Android 15)')
      .expect(426);
    expect(old.body).toMatchObject({
      statusCode: 426,
      code: 'clientTooOld',
      message: 'This version of the app is too old for this server.',
      details: { platform: 'android', min },
    });
    // In the app's language, like every other message.
    const inRussian = await request(server)
      .get('/api/site')
      .set('X-Tapeshelf-Client', 'android/0.0.1')
      .set('Accept-Language', 'ru')
      .expect(426);
    expect(inRussian.body.message).toBe(
      'Эта версия приложения слишком старая для этого сервера.',
    );
    // Before the request is looked at at all: no sign-in is attempted for it.
    const signIn = await request(server)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('X-Tapeshelf-Client', 'android/0.0.1')
      .send({ email: 'nobody@example.com', password: 'whatever123' })
      .expect(426);
    expect(signIn.body.code).toBe('clientTooOld');

    // The oldest accepted version, a newer one, a platform without a limit, a browser and a
    // header that is not an app's all get their answer.
    for (const client of [
      `android/${min}`,
      'android/99.0.0 (Test phone; Android 15)',
      'ios/0.0.1',
      'not an app',
      undefined,
    ]) {
      const req = request(server).get('/api/site');
      if (client) void req.set('X-Tapeshelf-Client', client);
      await req.expect(200);
    }
  });

  it('serves a document in the asked language and falls back to English', async () => {
    const ru = await request(app.getHttpServer())
      .get('/api/site/legal/terms?lang=ru')
      .expect(200);
    expect(ru.body).toMatchObject({ doc: 'terms', lang: 'ru' });
    expect(ru.body.markdown).toContain('# Правила использования');

    const fallback = await request(app.getHttpServer())
      .get('/api/site/legal/privacy?lang=ru')
      .expect(200);
    expect(fallback.body).toMatchObject({ doc: 'privacy', lang: 'en' });
    expect(fallback.body.markdown).toContain('# Privacy policy');
  });

  it('answers 404 for an unpublished document, an unknown one and anything path-like', async () => {
    for (const path of [
      '/api/site/legal/imprint',
      '/api/site/legal/cookies',
      '/api/site/legal/..%2F..%2Fpackage.json',
    ]) {
      const res = await request(app.getHttpServer()).get(path).expect(404);
      expect(res.body.code).toBe('legalNotFound');
    }
  });

  it('treats an unknown language as English instead of looking for a file by it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/site/legal/terms?lang=../../package')
      .expect(200);
    expect(res.body).toMatchObject({ doc: 'terms', lang: 'en' });
  });

  it('localizes the error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/site/legal/imprint')
      .set('Accept-Language', 'ru')
      .expect(404);
    expect(res.body).toMatchObject({
      code: 'legalNotFound',
      message: 'Оператор этого сайта не опубликовал этот документ.',
    });
  });
});

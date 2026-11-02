import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

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
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
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

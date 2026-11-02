import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { StorageService } from '../src/infra/storage/storage.service.js';
import { createTestApp } from './utils/test-app.js';

// Compose passes every optional setting as `${VAR:-}`, an empty string. Set before the app module
// is imported (the environment is validated then).
vi.hoisted(() => {
  process.env.SITE_URL = '';
  process.env.CONTACT_EMAIL = '';
  process.env.S3_PUBLIC_ENDPOINT = '';
  process.env.S3_PUBLIC_BUCKET_URL = '';
});

/** An empty variable means "not set" everywhere, not ''. */
describe('empty settings (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    for (const k of [
      'SITE_URL',
      'CONTACT_EMAIL',
      'S3_PUBLIC_ENDPOINT',
      'S3_PUBLIC_BUCKET_URL',
    ])
      delete process.env[k];
  });

  it('reads as unset: no website, no contact, the public bucket at the S3 endpoint', async () => {
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body).toMatchObject({ siteUrl: null, contactEmail: null });
    expect(app.get(StorageService).publicUrl('avatars/x.webp')).toBe(
      `${process.env['S3_ENDPOINT']}/${process.env['S3_BUCKET_PUBLIC']}/avatars/x.webp`,
    );
  });
});

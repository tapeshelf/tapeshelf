import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Server, createServer } from 'node:http';
import request from 'supertest';

import { client, createTestApp, resetDatabase } from './utils/test-app.js';

const VERIFY_PORT = 3398;

// The other suites run without a captcha (no Turnstile keys in .env.test). The environment is
// validated when the app module is imported, so the switch has to happen before the imports run.
vi.hoisted(() => {
  process.env.TURNSTILE_SITE_KEY = 'site-key-test';
  process.env.TURNSTILE_SECRET_KEY = 'secret-test';
  process.env.TURNSTILE_VERIFY_URL = 'http://127.0.0.1:3398/siteverify';
});

/**
 * Open registration: the first account from an IP needs nothing, another one from the same
 * IP within a day has to pass Cloudflare Turnstile (verified server-side; here a local stand-in
 * that accepts the token "good").
 */
describe('sign-up captcha (e2e)', () => {
  let app: NestExpressApplication;
  let verifier: Server;
  const verified: Record<string, string>[] = [];

  beforeAll(async () => {
    verifier = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const form = Object.fromEntries(new URLSearchParams(body));
        verified.push(form);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: form['response'] === 'good' }));
      });
    });
    await new Promise<void>((r) =>
      verifier.listen(VERIFY_PORT, '127.0.0.1', r),
    );
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((r) => verifier.close(() => r()));
    for (const k of [
      'TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'TURNSTILE_VERIFY_URL',
    ])
      delete process.env[k];
  });

  const register = (n: number, captchaToken?: string) =>
    client(app)
      .post('/api/auth/register')
      .send({
        email: `user${n}@example.com`,
        username: `user_${n}`,
        password: 'secret123',
        ...(captchaToken ? { captchaToken } : {}),
      });

  it('publishes the widget key', async () => {
    const site = await request(app.getHttpServer())
      .get('/api/site')
      .expect(200);
    expect(site.body.captchaSiteKey).toBe('site-key-test');
  });

  it('the first sign-up from an IP passes; the next one asks for the captcha and checks it', async () => {
    await register(1).expect(200);
    expect(verified).toEqual([]);

    const required = await register(2).expect(400);
    expect(required.body.code).toBe('captchaRequired');
    const wrong = await register(2, 'bad').expect(400);
    expect(wrong.body.code).toBe('captchaFailed');
    await register(2, 'good').expect(200);
    expect(verified.at(-1)).toMatchObject({
      secret: 'secret-test',
      response: 'good',
    });
    expect(verified.at(-1)!['remoteip']).toBeTruthy();
  });
});

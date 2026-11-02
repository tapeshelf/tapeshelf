import { validateEnv } from './env.js';

const valid: Record<string, string> = {
  PUBLIC_URL: 'http://localhost:4200',
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6379/0',
  S3_ENDPOINT: 'http://localhost:9100',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9100',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  S3_BUCKET_PRIVATE: 'private',
  S3_BUCKET_PUBLIC: 'public',
  COOKIE_SECRET: 'c'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
  KEK: 'ab'.repeat(32),
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'tapeshelf <no-reply@example.com>',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin12345',
  WORKER_TMP_DIR: '/tmp/tapeshelf',
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.WORKER_CONCURRENCY).toBe(1);
  });

  it('describes the instance: name by default, contact and legal texts only when set', () => {
    const env = validateEnv(valid);
    expect(env.SITE_NAME).toBe('tapeshelf');
    expect(env.CONTACT_EMAIL).toBeUndefined();
    expect(env.LEGAL_DIR).toBeUndefined();
    expect(env.SITE_URL).toBeUndefined();
    // An empty line in .env means "not set", not "invalid".
    const empty = validateEnv({ ...valid, CONTACT_EMAIL: '', LEGAL_DIR: '' });
    expect(empty.CONTACT_EMAIL).toBeUndefined();
    expect(empty.LEGAL_DIR).toBeUndefined();
    const own = validateEnv({
      ...valid,
      SITE_NAME: '  Family shelf ',
      CONTACT_EMAIL: 'ops@example.org',
      SITE_URL: 'https://example.org',
    });
    expect(own).toMatchObject({
      SITE_NAME: 'Family shelf',
      CONTACT_EMAIL: 'ops@example.org',
      SITE_URL: 'https://example.org',
    });
    expect(() =>
      validateEnv({ ...valid, CONTACT_EMAIL: 'not-an-address' }),
    ).toThrow(/CONTACT_EMAIL/);
  });

  it('parses boolean-like strings', () => {
    expect(
      validateEnv({ ...valid, S3_FORCE_PATH_STYLE: 'false' })
        .S3_FORCE_PATH_STYLE,
    ).toBe(false);
    expect(validateEnv({ ...valid, SMTP_SECURE: '1' }).SMTP_SECURE).toBe(true);
  });

  it('lists every problem in one error', () => {
    const broken = { ...valid, KEK: 'short', JWT_SECRET: 'tiny' };
    expect(() => validateEnv(broken)).toThrow(
      /KEK.*\n.*JWT_SECRET|JWT_SECRET.*\n.*KEK/s,
    );
  });

  it('rejects a missing database url', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('refuses the sample secrets and plain http in production', () => {
    const sample = {
      ...valid,
      NODE_ENV: 'production',
      COOKIE_SECRET: 'dev-cookie-secret-change-me-0123456789abcdef',
      KEK: '0'.repeat(64),
      PUBLIC_URL: 'http://example.com',
    };
    expect(() => validateEnv(sample)).toThrow(
      /COOKIE_SECRET: still the sample value[\s\S]*KEK[\s\S]*PUBLIC_URL: must be https[\s\S]*ADMIN_PASSWORD/,
    );
    expect(
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        PUBLIC_URL: 'https://tapeshelf.com',
        ADMIN_PASSWORD: 'a-long-real-password',
      }).NODE_ENV,
    ).toBe('production');
  });

  it('the cloud needs every Paddle key, all of one environment; self-hosted needs none', () => {
    expect(validateEnv(valid).EDITION).toBe('community');
    expect(() => validateEnv({ ...valid, EDITION: 'cloud' })).toThrow(
      /EDITION=cloud needs PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET, PADDLE_PRICE_MONTH, PADDLE_PRICE_YEAR/,
    );
    const cloud = {
      ...valid,
      EDITION: 'cloud',
      PADDLE_API_KEY: 'pdl_sdbx_apikey_x',
      PADDLE_CLIENT_TOKEN: 'test_x',
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_x',
      PADDLE_PRICE_MONTH: 'pri_m',
      PADDLE_PRICE_YEAR: 'pri_y',
    };
    expect(validateEnv(cloud).PADDLE_ENV).toBe('sandbox');
    expect(() => validateEnv({ ...cloud, PADDLE_ENV: 'production' })).toThrow(
      /PADDLE_API_KEY: not a production key[\s\S]*PADDLE_CLIENT_TOKEN: not a production token/,
    );
    expect(() => validateEnv({ ...cloud, PADDLE_PRICE_YEAR: 'year' })).toThrow(
      /PADDLE_PRICE_YEAR: a Paddle price id/,
    );
  });

  it('the demo erases its data daily: never on the cloud', () => {
    expect(validateEnv({ ...valid, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
    expect(() =>
      validateEnv({
        ...valid,
        DEMO_MODE: 'true',
        EDITION: 'cloud',
        PADDLE_API_KEY: 'pdl_sdbx_apikey_x',
        PADDLE_CLIENT_TOKEN: 'test_x',
        PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_x',
        PADDLE_PRICE_MONTH: 'pri_m',
        PADDLE_PRICE_YEAR: 'pri_y',
      }),
    ).toThrow(/DEMO_MODE erases everything daily: not with EDITION=cloud/);
  });
});

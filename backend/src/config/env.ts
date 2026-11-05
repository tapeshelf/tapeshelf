import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/** An empty value in a .env file means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(0).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PUBLIC_URL: z.url(),

  /** Name of this instance in the interface, e-mails and contact sheets (the software is tapeshelf). */
  SITE_NAME: z.string().trim().min(1).max(40).default('tapeshelf'),
  /** Public contact of the operator, shown in the footer; none when unset. */
  CONTACT_EMAIL: optional(z.email()),
  /** The instance's own legal texts: terms.<lang>.md, privacy.<lang>.md, imprint.<lang>.md (lang en|ru). */
  LEGAL_DIR: optional(z.string().min(1)),
  /**
   * The operator's own website in front of the app (tapeshelf.com: landing, rules, pricing, blog).
   * Set, the app sends its links to the rules there; unset, it shows LEGAL_DIR's texts.
   */
  SITE_URL: optional(z.url()),
  /**
   * `cloud` is tapeshelf.com: Free/Pro tiers, subscriptions and links to its site; `community` is a self-hosted instance with no tiers or tariff, one set of limits for
   * every account.
   */
  EDITION: z.enum(['community', 'cloud']).default('community'),
  /**
   * Paddle, the merchant of record for Pro subscriptions. The cloud needs all
   * of these; a self-hosted instance ignores them. Sandbox keys and tokens start with `pdl_sdbx_` and
   * `test_`, live ones with `pdl_live_` and `live_`.
   */
  PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PADDLE_API_KEY: optional(z.string().min(1)),
  /** Client-side token for Paddle.js in the browser (public by design). */
  PADDLE_CLIENT_TOKEN: optional(z.string().min(1)),
  /** Secret of the notification destination that posts to /api/billing/webhook. */
  PADDLE_WEBHOOK_SECRET: optional(z.string().min(1)),
  PADDLE_PRICE_MONTH: optional(z.string().regex(/^pri_/, 'a Paddle price id')),
  PADDLE_PRICE_YEAR: optional(z.string().regex(/^pri_/, 'a Paddle price id')),
  /** API base; by default the one of PADDLE_ENV (tests point it at a local stub). */
  PADDLE_API_URL: optional(z.url()),
  /**
   * Cloudflare Turnstile on a repeated sign-up from the same IP; off unless both keys are
   * set. The verify URL is overridden by tests only.
   */
  TURNSTILE_SITE_KEY: optional(z.string().min(1)),
  TURNSTILE_SECRET_KEY: optional(z.string().min(1)),
  TURNSTILE_VERIFY_URL: z
    .url()
    .default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),
  /**
   * Push to the phone app through Firebase Cloud Messaging: the Firebase project's service
   * account key, as its JSON or that JSON in base64. Off without it (a self-hosted server: the app
   * then asks for news itself). The API base is overridden by tests only.
   */
  FCM_SERVICE_ACCOUNT: optional(z.string().min(1)),
  FCM_API_URL: z.url().default('https://fcm.googleapis.com'),
  /**
   * The public demo: a banner with the demo account, sign-up without the confirmation email,
   * no email sent at all, and everything erased and seeded again daily (04:00 UTC). Never with
   * EDITION=cloud.
   */
  DEMO_MODE: bool.default(false),
  /**
   * A self-hosted instance without an email account: nothing is sent, and new accounts need no
   * confirmation. Forgotten passwords then have no way back but an admin; the installer says so.
   */
  EMAIL_DISABLED: bool.default(false),
  /** Who may read the details of /api/health/ops (header X-Ops-Token); without it, the status alone. */
  OPS_TOKEN: optional(z.string().min(16)),
  /** Videos to seed the demo shelf with (mp4/mov/mkv/webm); empty = clips made by ffmpeg. */
  DEMO_SEED_DIR: optional(z.string().min(1)),
  /** Rate limits (per user, per IP for guests); only test suites turn them off, as they share one IP. */
  RATE_LIMITS: bool.default(true),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.url(),
  /** Endpoint embedded in presigned URLs that browsers open; defaults to S3_ENDPOINT (differs only when the API reaches S3 over an internal network). */
  S3_PUBLIC_ENDPOINT: optional(z.url()),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PRIVATE: z.string().min(1),
  S3_BUCKET_PUBLIC: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(true),
  /** Base URL of public-bucket objects as browsers fetch them; defaults to <S3_PUBLIC_ENDPOINT>/<S3_BUCKET_PUBLIC>. */
  S3_PUBLIC_BUCKET_URL: optional(z.url()),
  /**
   * A second, S3-compatible storage the database dumps are copied to: with them all in the
   * videos' own bucket, losing that bucket lost the backups too. Off unless all four are set.
   */
  BACKUP_MIRROR_ENDPOINT: optional(z.url()),
  BACKUP_MIRROR_REGION: z.string().min(1).default('us-east-1'),
  BACKUP_MIRROR_ACCESS_KEY: optional(z.string().min(1)),
  BACKUP_MIRROR_SECRET_KEY: optional(z.string().min(1)),
  BACKUP_MIRROR_BUCKET: optional(z.string().min(1)),
  BACKUP_MIRROR_FORCE_PATH_STYLE: bool.default(false),

  COOKIE_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  KEK: z.string().regex(/^[0-9a-f]{64}$/i, 'KEK must be 32 bytes in hex'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  ADMIN_EMAIL: z.email(),
  ADMIN_USERNAME: z.string().min(3),
  ADMIN_PASSWORD: z.string().min(8),

  WORKER_TMP_DIR: z.string().min(1),
  /** Parallel transcode jobs (CPU-bound). Remux/thumbnail jobs run with a fixed small concurrency. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  /** Optional HTTP health endpoint of the worker (0 = disabled). */
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).default(0),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  /** Threads of one ffmpeg run; 0 = the container's CPU quota (cpu-budget.ts). */
  FFMPEG_THREADS: z.coerce.number().int().min(0).max(64).default(0),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  /** Fonts and other static assets used by the worker (relative to the working directory). */
  ASSETS_DIR: z.string().min(1).default('assets'),
});

export type Env = z.infer<typeof envSchema>;

/** Production refuses the sample values of .env.example and a plain-http public URL. */
export function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  for (const key of ['COOKIE_SECRET', 'JWT_SECRET'] as const)
    if (/change-me/i.test(env[key]))
      problems.push(`${key}: still the sample value from .env.example`);
  if (/^0+$/.test(env.KEK))
    problems.push('KEK: still the sample value (all zeros)');
  if (env.COOKIE_SECRET === env.JWT_SECRET)
    problems.push('COOKIE_SECRET and JWT_SECRET must differ');
  // Plain http only for trying it on this computer: browsers treat localhost as secure.
  if (!/^(https:\/\/|http:\/\/localhost(:\d+)?\/?$)/.test(env.PUBLIC_URL))
    problems.push(
      'PUBLIC_URL: must be https:// in production (cookies are Secure), or http://localhost to try it',
    );
  if (/^(.)\1+$/.test(env.KEK))
    problems.push('KEK: a sample value (one character repeated)');
  if (env.S3_ACCESS_KEY === 'minioadmin' || env.S3_SECRET_KEY === 'minioadmin')
    problems.push('S3_ACCESS_KEY, S3_SECRET_KEY: still the sample values');
  for (const key of ['COOKIE_SECRET', 'JWT_SECRET'] as const)
    if (/^test-/.test(env[key]))
      problems.push(`${key}: a value from the test settings`);
  if (env.ADMIN_PASSWORD === 'admin12345')
    problems.push('ADMIN_PASSWORD: still the sample value from .env.example');
  return problems;
}

const PADDLE_KEYS = [
  'PADDLE_API_KEY',
  'PADDLE_CLIENT_TOKEN',
  'PADDLE_WEBHOOK_SECRET',
  'PADDLE_PRICE_MONTH',
  'PADDLE_PRICE_YEAR',
] as const;

/** The cloud sells Pro through Paddle: every key is needed, and all of one environment. */
export function billingProblems(env: Env): string[] {
  if (env.EDITION !== 'cloud') return [];
  const missing = PADDLE_KEYS.filter((k) => !env[k]);
  if (missing.length)
    return [`EDITION=cloud needs ${missing.join(', ')} (Paddle)`];
  const sandbox = env.PADDLE_ENV === 'sandbox';
  const problems: string[] = [];
  if (!env.PADDLE_API_KEY!.startsWith(sandbox ? 'pdl_sdbx_' : 'pdl_live_'))
    problems.push(`PADDLE_API_KEY: not a ${env.PADDLE_ENV} key`);
  if (!env.PADDLE_CLIENT_TOKEN!.startsWith(sandbox ? 'test_' : 'live_'))
    problems.push(`PADDLE_CLIENT_TOKEN: not a ${env.PADDLE_ENV} token`);
  return problems;
}

/** The demo erases its database every day: never on the cloud's data. */
export function demoProblems(env: Env): string[] {
  return env.DEMO_MODE && env.EDITION === 'cloud'
    ? ['DEMO_MODE erases everything daily: not with EDITION=cloud']
    : [];
}

/** Used by ConfigModule: fails fast with a readable list of problems. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  const lines = result.success
    ? [
        ...productionProblems(result.data),
        ...billingProblems(result.data),
        ...demoProblems(result.data),
      ].map((p) => `  ${p}`)
    : result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  if (!result.success || lines.length)
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  return result.data;
}

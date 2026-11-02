import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test';

import { linkFromMail, waitForMailText } from './mailpit';

export interface E2EUser {
  email: string;
  username: string;
  password: string;
  displayName: string;
}

export function newUser(prefix: string): E2EUser {
  const stamp = Date.now().toString(36);
  return {
    email: `${prefix}-${stamp}@example.com`,
    username: `${prefix}_${stamp}`,
    password: 'secret123',
    displayName: `${prefix} tester`,
  };
}

let crowd = 0;

/**
 * Registers and confirms through the API alone, for the many accounts a list test needs: the
 * returned context is signed in as that user (its `request` carries the session cookies). Each
 * account comes from its own address (the API trusts X-Forwarded-For from the loopback), so the
 * sign-up rate limit of five a minute per address does not stop a crowd.
 */
export async function registerViaApi(browser: Browser, user: E2EUser): Promise<BrowserContext> {
  const n = ++crowd;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': `10.77.${Math.floor(n / 250)}.${(n % 250) + 1}` },
  });
  const xhr = { 'X-Requested-With': 'XMLHttpRequest' };
  const signedUp = await context.request.post('/api/auth/register', { data: user, headers: xhr });
  expect(signedUp.ok(), `sign-up of ${user.username}: ${signedUp.status()}`).toBe(true);
  const link = linkFromMail(await waitForMailText(user.email, 'Confirm'), '/verify-email');
  const token = new URL(link).searchParams.get('token');
  expect(token).toBeTruthy();
  const verified = await context.request.post('/api/auth/verify-email', {
    data: { token },
    headers: xhr,
  });
  expect(verified.ok()).toBe(true);
  return context;
}

/** Registers through the UI and confirms the email via Mailpit; ends on the user's own page. */
export async function registerAndVerify(page: Page, user: E2EUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(`/@${user.username}`);
  const link = linkFromMail(await waitForMailText(user.email, 'Confirm'), '/verify-email');
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await page.getByRole('link', { name: 'Go to my page' }).click();
  await expect(page).toHaveURL(`/@${user.username}`);
}

const BACKEND = join(__dirname, '..', '..', 'backend');

/** Runs one UPDATE on the e2e database only (there is no API for these, by design). */
function updateUser(sql: string, value: string, username: string): void {
  const env = readFileSync(join(BACKEND, '.env.test'), 'utf8');
  const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (!url?.includes('_test')) throw new Error('refusing to touch a non-test database');
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import pg from 'pg';
       const c = new pg.Client({ connectionString: process.env.E2E_DB });
       await c.connect();
       await c.query(process.env.E2E_SQL, [process.env.E2E_VALUE, process.env.E2E_USER]);
       await c.end();`,
    ],
    {
      cwd: BACKEND,
      env: { ...process.env, E2E_DB: url, E2E_SQL: sql, E2E_VALUE: value, E2E_USER: username },
    },
  );
}

/**
 * Puts `count` READY videos straight on a user's shelf (rows only, no files: tiles show their
 * placeholder), titled "<title> 01"…, newest first in that order, made `minutesAgo` minutes ago
 * (and ready then: "What's new" lists them by that). For shelves bigger than a page.
 */
export function seedVideos(
  username: string,
  title: string,
  count: number,
  visibility: 'PUBLIC' | 'PRIVATE',
  minutesAgo = 1,
): void {
  runSql(
    `WITH u AS (SELECT id FROM "User" WHERE username = $1),
     v AS (
       INSERT INTO "Video" (id, "authorId", title, visibility, status, progress, "originalKey",
         "originalFilename", "sizeBytes", "durationSec", width, height, "createdAt", "updatedAt",
         "readyAt")
       SELECT gen_random_uuid(), u.id, $2 || ' ' || lpad(g::text, 2, '0'), $3::"Visibility", 'READY', 100,
         'seeded/none', 'seeded.mp4', 1000, 10, 640, 360,
         now() - (g || ' seconds')::interval - ($5 || ' minutes')::interval, now(),
         now() - (g || ' seconds')::interval - ($5 || ' minutes')::interval
       FROM u, generate_series(1, $4::int) g
       RETURNING id, "authorId", "createdAt")
     INSERT INTO "VideoAccess" (id, "videoId", "holderId", source, "createdAt")
     SELECT gen_random_uuid(), v.id, v."authorId", 'AUTHOR', v."createdAt" FROM v`,
    [username, title, visibility, String(count), String(minutesAgo)],
  );
}

/** Gives a holder a copy of an author's video, as a free share would (rows only). */
export function shareSeeded(author: string, title: string, holder: string): void {
  runSql(
    `INSERT INTO "VideoAccess" (id, "videoId", "holderId", source, "createdAt")
     SELECT gen_random_uuid(), v.id, h.id, 'SHARE', now()
     FROM "Video" v JOIN "User" a ON a.id = v."authorId", "User" h
     WHERE a.username = $1 AND v.title = $2 AND h.username = $3`,
    [author, title, holder],
  );
}

/** Puts one of a user's videos back into processing, as if the worker were still at it. */
export function markProcessing(username: string, title: string): void {
  runSql(
    `UPDATE "Video" SET status = 'PROCESSING', stage = 'PACKAGE', progress = 40, "readyAt" = NULL
     WHERE title = $2 AND "authorId" = (SELECT id FROM "User" WHERE username = $1)`,
    [username, title],
  );
}

/** Ends a visitor's current visits to shelves, as if they had left hours ago. */
export function endShelfVisits(visitorUsername: string): void {
  runSql(
    `UPDATE "ShelfVisit" SET "lastSeenAt" = now() - interval '2 hours'
     WHERE "visitorId" = (SELECT id FROM "User" WHERE username = $1)`,
    [visitorUsername],
  );
}

/** Runs one statement on the e2e database only; returns its rows. */
export function runSql(sql: string, params: string[]): Record<string, unknown>[] {
  const env = readFileSync(join(BACKEND, '.env.test'), 'utf8');
  const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (!url?.includes('_test')) throw new Error('refusing to touch a non-test database');
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import pg from 'pg';
       const c = new pg.Client({ connectionString: process.env.E2E_DB });
       await c.connect();
       const r = await c.query(process.env.E2E_SQL, JSON.parse(process.env.E2E_PARAMS));
       process.stdout.write(JSON.stringify(r.rows ?? []));
       await c.end();`,
    ],
    {
      cwd: BACKEND,
      env: { ...process.env, E2E_DB: url, E2E_SQL: sql, E2E_PARAMS: JSON.stringify(params) },
    },
  );
  return JSON.parse(out.toString() || '[]') as Record<string, unknown>[];
}

/**
 * Grants the admin role the way the panel lets an admin in: two-step sign-in on, and the
 * sessions the account has so far past the second step — so sign in first, then make admin. Uses the
 * backend's `pg` and the test DATABASE_URL, so it works the same locally and in CI.
 */
export function makeAdmin(username: string): void {
  runSql(`UPDATE "User" SET role = 'ADMIN', "twoFactorAt" = now() WHERE username = $1`, [username]);
  runSql(
    `UPDATE "Session" SET "secondFactorAt" = now()
     WHERE "userId" = (SELECT id FROM "User" WHERE username = $1)`,
    [username],
  );
}

/** The code an authenticator app shows for a base32 secret, `steps` periods from now (RFC 6238). */
export function totp(secret: string, steps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/[\s=]/g, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + steps));
  const mac = createHmac('sha1', key).update(counter).digest();
  const at = mac[mac.length - 1]! & 0xf;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Puts an account on a tier with no end date (an admin would do it in the panel). */
export function setTier(username: string, tier: 'BASIC' | 'PREMIUM'): void {
  updateUser('UPDATE "User" SET tier = $1 WHERE username = $2', tier, username);
}

/** Signs an existing e2e user in through the form (a fresh page has no session of its own). */
export async function login(page: Page, user: E2EUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(`/@${user.username}`);
}

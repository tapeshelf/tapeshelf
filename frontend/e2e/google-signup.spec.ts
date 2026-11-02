import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, request, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';

/** The e2e API runs with backend/.env.test, so its signed cookies use that COOKIE_SECRET. */
function cookieSecret(): string {
  const env = readFileSync(join(__dirname, '..', '..', 'backend', '.env.test'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('COOKIE_SECRET='));
  if (!line) throw new Error('COOKIE_SECRET missing in backend/.env.test');
  return line.slice('COOKIE_SECRET='.length).trim();
}

/** What Google's callback leaves for an unknown Google account, signed as cookie-parser does. */
function pendingSignup(sub: string, email: string): string {
  const value = JSON.stringify({
    identity: { sub, email, emailVerified: true, name: 'Google Person' },
    returnTo: '/',
  });
  const mac = createHmac('sha256', cookieSecret())
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');
  return encodeURIComponent(`s:${value}.${mac}`);
}

/**
 * The app could take a browser for a guest while another account's session was still alive in it;
 * a visitor signing up with Google must not land in that other account. A Google sign-up always
 * makes the new account: the page says who is signed in, the
 * new account takes over the browser and the old session is ended on the server.
 */
test('a Google sign-up in a browser still signed in as someone else makes the new account', async ({
  page,
  context,
  baseURL,
}) => {
  const old = newUser('gold');
  await registerAndVerify(page, old);
  const before = (await context.cookies())
    .filter((c) => c.name === 'vs_access' || c.name === 'vs_refresh')
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const stamp = Date.now().toString(36);
  await context.addCookies([
    {
      name: 'vs_oauth_signup',
      value: pendingSignup(`google-${stamp}`, `google-${stamp}@example.com`),
      url: `${baseURL}/api/auth/google`,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/auth/google/complete');
  await expect(page.getByTestId('google-complete-signed-in')).toContainText(`@${old.username}`);

  const username = `gnew_${stamp}`;
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(`/@${username}`);
  const me = (await (await page.request.get('/api/auth/me')).json()) as { username: string };
  expect(me.username).toBe(username);

  // The old account's cookies, saved before the sign-up, no longer open anything.
  const probe = await request.newContext({ baseURL, extraHTTPHeaders: { Cookie: before } });
  expect((await probe.get('/api/auth/me')).status()).toBe(401);
  expect(
    (
      await probe.post('/api/auth/refresh', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    ).status(),
  ).toBe(401);
  await probe.dispose();
});

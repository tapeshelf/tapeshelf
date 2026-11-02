import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, registerViaApi } from './account';

const XHR = { 'X-Requested-With': 'XMLHttpRequest' };
const BACKEND = join(__dirname, '..', '..', 'backend');

/**
 * Has the API close a user's sockets, as it does when a session is revoked (backend
 * `session.revoked` control message on the Redis channel the gateway listens to). The session
 * itself stays live: only the connections go.
 */
function dropSockets(userId: string): void {
  const env = readFileSync(join(BACKEND, '.env.test'), 'utf8');
  const url = /^REDIS_URL=(.+)$/m.exec(env)?.[1]?.trim();
  if (!url) throw new Error('no REDIS_URL in .env.test');
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { Redis } from 'ioredis';
       const r = new Redis(process.env.E2E_REDIS);
       await r.publish('vs:ws', JSON.stringify({ userId: process.env.E2E_USER, event: 'session.revoked', payload: {} }));
       await r.quit();`,
    ],
    { cwd: BACKEND, env: { ...process.env, E2E_REDIS: url, E2E_USER: userId } },
  );
}

/**
 * Live updates survive a break in the connection: the access cookie expired while
 * the tab slept and the server closed the socket. The app renews the session, connects again and
 * fetches what it missed; before, it stayed without live updates until a reload.
 */
test('the chat comes back live after the connection broke with an expired access cookie', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const ann = newUser('rtann');
  const bob = newUser('rtbob');
  await registerAndVerify(page, ann);
  const bobContext = await registerViaApi(browser, bob);
  try {
    // Friends: they can write to each other.
    expect(
      (await page.request.post(`/api/users/${bob.username}/follow`, { headers: XHR })).ok(),
    ).toBe(true);
    expect(
      (await bobContext.request.post(`/api/users/${ann.username}/follow`, { headers: XHR })).ok(),
    ).toBe(true);
    const annId = ((await (await page.request.get('/api/auth/me')).json()) as { id: string }).id;
    const send = async (body: string) =>
      expect(
        (
          await bobContext.request.post(`/api/conversations/with/${ann.username}/messages`, {
            data: { body },
            headers: XHR,
          })
        ).ok(),
      ).toBe(true);

    await page.goto(`/@${ann.username}(panel:messages/${bob.username})`);
    const thread = page.getByTestId('chat-messages');
    await send('Before the break');
    await expect(thread).toContainText('Before the break');

    // The tab "slept": the access cookie is gone, the server closes the socket.
    await page.context().clearCookies({ name: 'vs_access' });
    dropSockets(annId);
    await send('During the break');
    await expect(thread).toContainText('During the break', { timeout: 20_000 });
    await send('After the break');
    await expect(thread).toContainText('After the break', { timeout: 20_000 });
    // Still signed in.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  } finally {
    await bobContext.close();
  }
});

import { createHash, randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';

const user = newUser('connect');
/** The address Chromium gives an extension for its sign-in window. */
const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/**
 * Connecting the browser extension: its sign-in window opens /connect/extension;
 * a guest signs in first and comes back; one button sends the code to the extension; the
 * connection then shows in Settings → Security and is disconnected from there.
 */
test.describe.serial('connect the browser extension', () => {
  test('a guest is asked to sign in first and comes back to the window', async ({ page }) => {
    const { challenge } = pkce();
    await page.goto(
      `/connect/extension?redirect_uri=${encodeURIComponent(REDIRECT)}&state=state-1234&code_challenge=${challenge}`,
    );
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    expect(decodeURIComponent(page.url())).toContain('/connect/extension?redirect_uri=');
  });

  test('one button connects; the code reaches the extension, the token works, settings list it, Disconnect stops it', async ({
    page,
    request,
  }) => {
    await registerAndVerify(page, user);
    const { verifier, challenge } = pkce();
    // The browser hands the extension's address to the extension; here the test catches it.
    let caught = '';
    await page.route('https://*.chromiumapp.org/**', async (route) => {
      caught = route.request().url();
      await route.fulfill({ status: 200, body: 'connected' });
    });
    await page.goto(
      `/connect/extension?redirect_uri=${encodeURIComponent(REDIRECT)}&state=state-5678&code_challenge=${challenge}`,
    );
    await expect(page.getByTestId('connect-account')).toContainText(user.username);
    await expect(page.getByTestId('connect-terms')).toContainText('Terms of Service');
    await page.getByTestId('connect-confirm').click();
    await expect.poll(() => caught).toContain('chromiumapp.org');
    const to = new URL(caught);
    expect(to.searchParams.get('state')).toBe('state-5678');

    // As the extension asks: its own requests, without the site's cookies.
    const issued = await request.post('/api/app-tokens/token', {
      data: { code: to.searchParams.get('code'), codeVerifier: verifier, redirectUri: REDIRECT },
    });
    expect(issued.ok()).toBe(true);
    const { token } = await issued.json();
    const context = await request.get('/api/extension/context', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await context.json()).user.username).toBe(user.username);

    await page.unroute('https://*.chromiumapp.org/**');
    await page.goto(`/@${user.username}(panel:settings/security)`);
    const app = page.getByTestId('connected-app');
    await expect(app).toHaveCount(1);
    await expect(app).toContainText('Chrome');
    await app.getByTestId('connected-app-revoke').click();
    await expect(page.getByTestId('connected-apps')).toHaveCount(0);
    const after = await request.get('/api/extension/context', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status()).toBe(401);
  });

  test('a link not from the extension connects nothing', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`/@${user.username}`);
    await page.goto(
      `/connect/extension?redirect_uri=${encodeURIComponent('https://evil.example/cb')}&state=state-0000&code_challenge=${pkce().challenge}`,
    );
    await expect(page.getByTestId('connect-invalid')).toBeVisible();
    await expect(page.getByTestId('connect-confirm')).toHaveCount(0);
  });

  test('Firefox’s address for the extension connects as well', async ({
    page,
    request,
  }) => {
    const firefox = 'https://f5b5d7a2c4e6f8091a2b3c4d5e6f708192a3b4c5.extensions.allizom.org/';
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`/@${user.username}`);
    const { verifier, challenge } = pkce();
    let caught = '';
    await page.route('https://*.extensions.allizom.org/**', async (route) => {
      caught = route.request().url();
      await route.fulfill({ status: 200, body: 'connected' });
    });
    await page.goto(
      `/connect/extension?redirect_uri=${encodeURIComponent(firefox)}&state=state-ff&code_challenge=${challenge}`,
    );
    await page.getByTestId('connect-confirm').click();
    await expect.poll(() => caught).toContain('extensions.allizom.org');
    const issued = await request.post('/api/app-tokens/token', {
      data: {
        code: new URL(caught).searchParams.get('code'),
        codeVerifier: verifier,
        redirectUri: firefox,
      },
    });
    expect(issued.ok()).toBe(true);
  });
});

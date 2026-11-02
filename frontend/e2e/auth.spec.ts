import { expect, request, test } from '@playwright/test';

import { linkFromMail, waitForMailText } from './mailpit';

const stamp = Date.now().toString(36);
const user = {
  email: `e2e-${stamp}@example.com`,
  username: `e2e_${stamp}`,
  password: 'secret123',
  displayName: 'E2E Tester',
};

test.describe.serial('account lifecycle', () => {
  test('registers, confirms the email and lands on the own page', async ({ page }) => {
    await page.goto('/register');
    // The page address uses /@name, on this host.
    await expect(
      page.getByText(`Your page will be at ${new URL(page.url()).host}/@username.`),
    ).toBeVisible();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByLabel('Display name').fill(user.displayName);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL(`/@${user.username}`);
    await expect(page.getByRole('heading', { name: user.displayName })).toBeVisible();
    // The banner, and the empty shelf too: uploads wait for the email.
    await expect(page.getByText('Confirm your email')).toHaveCount(2);

    const link = linkFromMail(await waitForMailText(user.email, 'Confirm'), '/verify-email');
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByText('Your email is confirmed')).toBeVisible();
    await page.getByRole('link', { name: 'Go to my page' }).click();
    await expect(page.getByText('Confirm your email')).toHaveCount(0);
  });

  test('logs out, rejects a wrong password, logs back in and reaches settings', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('wrong9999');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Wrong email or password')).toBeVisible();

    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`/@${user.username}`);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\(panel:settings\/profile\)$/);
    await page.getByLabel('About you').fill('Hello from e2e');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.getByRole('link', { name: 'Security' }).click();
    await expect(page.getByText('current', { exact: true })).toBeVisible();

    const session = (await context.cookies())
      .filter((c) => c.name === 'vs_access' || c.name === 'vs_refresh')
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    // The settings panel covers the whole window, header included: close it first.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('panel')).toBeHidden();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Log in', exact: true }),
    ).toBeVisible();

    // A full logout: no session cookie left in the browser, a fresh load is a guest, and the
    // cookies saved before logging out are dead on the server too.
    expect(
      (await context.cookies()).filter((c) => c.name === 'vs_access' || c.name === 'vs_refresh'),
    ).toEqual([]);
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    const probe = await request.newContext({ baseURL, extraHTTPHeaders: { Cookie: session } });
    expect((await probe.get('/api/auth/me')).status()).toBe(401);
    expect(
      (
        await probe.post('/api/auth/refresh', {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
      ).status(),
    ).toBe(401);
    await probe.dispose();
  });

  test('resets a forgotten password through the mailed link', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByText('a reset link is on its way')).toBeVisible();

    const link = linkFromMail(await waitForMailText(user.email, 'Reset'), '/reset-password');
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await page.getByLabel('New password').fill('another456');
    await page.getByLabel('Repeat password').fill('another456');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Your password has been changed')).toBeVisible();

    await page.getByRole('link', { name: 'Log in', exact: true }).first().click();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('another456');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`/@${user.username}`);
  });
});

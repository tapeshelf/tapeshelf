import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, runSql, totp } from './account';

async function logOut(page: Page, username: string): Promise<void> {
  await page.goto(`/@${username}`);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login|\/$/);
}

async function password(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('secret123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
}

/**
 * Two-step sign-in: an admin is sent to set it up before the panel opens; the app's
 * code after the password; a passkey (Chrome's virtual authenticator) instead of the code.
 */
test('an admin sets up the app and a passkey, then signs in with each', async ({ page }) => {
  const user = newUser('tfa');
  await registerAndVerify(page, user);
  runSql(`UPDATE "User" SET role = 'ADMIN' WHERE username = $1`, [user.username]);

  // The panel waits for the second step.
  await page.goto('/admin');
  await expect(page).toHaveURL(/panel:settings\/security/);
  await expect(page.getByTestId('two-factor-admin')).toBeVisible();

  await page.getByTestId('two-factor-add-app').click();
  await page.getByTestId('prompt-input').fill('secret123');
  await page.getByTestId('prompt-confirm').click();
  await expect(page.getByTestId('two-factor-qr')).toBeVisible();
  const secret = (await page.getByTestId('two-factor-secret').textContent())!.replace(/\s/g, '');
  await page.getByTestId('two-factor-app-code').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  await page.getByRole('button', { name: 'I saved them' }).click();
  await expect(page.getByTestId('two-factor-state')).toHaveText('On');
  await expect(page.getByTestId('recovery-left')).toHaveText('10 of 10 left');

  await page.goto('/admin');
  await expect(page.getByTestId('admin-nav')).toBeVisible();

  // A passkey on this "device": Chrome's virtual authenticator answers for it.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('/settings/security');
  await page.getByTestId('two-factor-add-passkey').click();
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);
  await expect(page.getByTestId('passkey-row')).toContainText('Added');

  // The password alone opens nothing; the passkey finishes the sign-in.
  await logOut(page, user.username);
  await password(page, user.email);
  await page.getByRole('button', { name: 'Use a passkey' }).click();
  await expect(page).toHaveURL(`/@${user.username}`);

  // And the app's next code does too.
  await logOut(page, user.username);
  await password(page, user.email);
  await page.getByTestId('second-step-code').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(`/@${user.username}`);
  await page.goto('/admin');
  await expect(page.getByTestId('admin-nav')).toBeVisible();
});

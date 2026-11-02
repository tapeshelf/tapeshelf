import { expect, test } from '@playwright/test';

import { newUser, registerViaApi, runSql } from './account';

/**
 * Twenty languages: the app opens in the browser's language when it speaks it, English
 * otherwise; a language picked by hand under the page wins, stays after a reload and moves the
 * other open tabs at once.
 */
test('the browser’s language first, a picked one after that, in every tab', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const german = await context.newPage();
  await german.goto('/login');
  await expect(german.locator('html')).toHaveAttribute('lang', 'de');
  await expect(german.getByRole('heading', { level: 1 })).toHaveText('Anmelden');
  const other = await context.newPage();
  await other.goto('/register');
  await expect(other.locator('html')).toHaveAttribute('lang', 'de');

  const arabic = await (await browser.newContext({ locale: 'ar-EG' })).newPage();
  await arabic.goto('/login');
  await expect(arabic.getByRole('heading', { level: 1 })).toHaveText('Log in');

  // The footer's list is the app's own, not the browser's.
  await german.getByTestId('footer-language').getByRole('combobox').click();
  await german.getByRole('option', { name: '日本語' }).click();
  await expect(german.getByRole('heading', { level: 1 })).toHaveText('ログイン');
  await expect(other.locator('html')).toHaveAttribute('lang', 'ja');
  await german.reload();
  await expect(german.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(german.getByRole('heading', { level: 1 })).toHaveText('ログイン');
});

/**
 * A language picked on the site (or here signed out) that the account has not got yet wins over
 * the account's on the next sign-in and is saved to it; without such a pick the account's own
 * language is the one shown.
 */
test('a pick made before signing in reaches the account', async ({ browser }) => {
  const user = newUser('lang');
  const context = await registerViaApi(browser, user);
  const page = await context.newPage();
  await page.goto(`/@${user.username}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // What the site's language switch leaves behind.
  await page.evaluate(() => {
    localStorage.setItem('vs.lang', 'de');
    localStorage.setItem('vs.lang.picked', '1');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  const locale = () =>
    runSql('SELECT locale FROM "User" WHERE username = $1', [user.username])[0]?.['locale'];
  await expect.poll(locale).toBe('de');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vs.lang.picked'))).toBeNull();

  // A language left in the browser without a pick gives way to the account's.
  await page.evaluate(() => localStorage.setItem('vs.lang', 'ja'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(locale()).toBe('de');
});

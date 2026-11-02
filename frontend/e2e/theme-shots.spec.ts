import { type Page, expect, test } from '@playwright/test';

import { newUser, registerViaApi, seedVideos, shareSeeded } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { setVisibility, tile, uploadAndWaitReady } from './videos';

/**
 * Not a test of behaviour: the main screens in one theme, for a design review of the palette.
 * The device's scheme is emulated: with no theme picked the app follows it. Runs
 * only with VS_SHOTS_DIR=<dir>; VS_SHOTS_SCHEME=light|dark (dark by default).
 */
const dir = process.env['VS_SHOTS_DIR'];
const scheme = process.env['VS_SHOTS_SCHEME'] === 'light' ? 'light' : 'dark';
test.skip(!dir, 'set VS_SHOTS_DIR to capture theme screenshots');

const user = newUser('dusk');
const friend = newUser('dawn');

async function shot(page: Page, name: string): Promise<void> {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/${scheme}-${name}.png` });
}

test('theme screenshots', async ({ browser }) => {
  test.setTimeout(240_000);
  const guestCtx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1440, height: 900 },
  });
  const guest = await guestCtx.newPage();
  await guest.goto('/login');
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(guest, '01-login');
  await guest.goto('/register');
  await shot(guest, '02-register');

  const ctx = await registerViaApi(browser, user);
  await registerViaApi(browser, friend).then((c) => c.close());
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 1440, height: 900 });
  seedVideos(friend.username, 'Night drive', 3, 'PUBLIC');
  shareSeeded(friend.username, 'Night drive 01', user.username);
  await page.goto(`/@${user.username}`);
  await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
  await uploadAndWaitReady(page, SAMPLE_VIDEO_2, /^second/i);
  await setVisibility(page, /^sample/i, 'Public');
  await page.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Category name').fill('Trips');
  await page.getByLabel('Category name').press('Enter');
  await page.getByRole('button', { name: /^All videos/ }).click();
  await expect(tile(page, /^second/i)).toBeVisible();
  await shot(page, '03-shelf');
  await tile(page, /^second/i).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('bulk-bar')).toBeVisible();
  await shot(page, '04-shelf-selected');
  await page.keyboard.press('Escape');
  await tile(page, /^sample/i).click({ button: 'right' });
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${scheme}-05-context-menu.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${scheme}-06-account-menu.png` });
  await page.keyboard.press('Escape');

  await tile(page, /^sample/i).click();
  await expect(page.getByRole('heading', { name: /^sample/i })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, '07-video');
  await page.goto(`/@${friend.username}`);
  await expect(page.getByRole('link', { name: /^Night drive 02/ })).toBeVisible();
  await shot(page, '08-friend-shelf');
  await page.getByRole('link', { name: /^Night drive 02/ }).click();
  await page.waitForTimeout(800);
  await shot(page, '09-friend-video');

  for (const [name, url] of [
    ['10-settings', '/settings/profile'],
    ['11-settings-page', '/settings/page'],
    ['12-notifications', '/notifications'],
    ['13-exchange', '/exchange'],
    ['14-friends', `/@${user.username}/friends`],
    ['15-whats-new', '/whats-new'],
    ['16-not-found', '/nope'],
  ] as const) {
    await page.goto(url);
    await shot(page, name);
  }

  await page.goto(`/@${user.username}`);
  await tile(page, /^second/i).click({ modifiers: ['ControlOrMeta'] });
  await page.keyboard.press('Delete');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${scheme}-17-confirm.png` });
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/@${user.username}`);
  await expect(tile(page, /^sample/i)).toBeVisible();
  await shot(page, '18-mobile-shelf');
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto('/');
  await shot(guest, '19-mobile-guest-home');
  await guest.setViewportSize({ width: 1440, height: 900 });
  await guest.goto('/');
  await shot(guest, '20-guest-home');
  await guest.goto(`/@${friend.username}`);
  await shot(guest, '21-guest-shelf');
  await ctx.close();
  await guestCtx.close();
});

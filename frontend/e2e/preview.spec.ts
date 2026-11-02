import { type Browser, type Page, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify, registerViaApi } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { tileAction, uploadAndWaitReady } from './videos';

const owner = newUser('prv');
const fan = newUser('fan');
const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/**
 * "View as visitor" is a guest's view, one to one: sensitive videos blurred, a
 * private video without its player, and the reminder above the header until the owner switches
 * back. The friends lists show each person's videos and the owner's exchanges.
 */
test('view as visitor: blurred sensitive video, no player on a private one, the banner on the own page until switched back or signed out; followers list with counts', async ({
  page,
  browser,
}) => {
  await registerAndVerify(page, owner);
  await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
  await uploadAndWaitReady(page, SAMPLE_VIDEO_2, /^second/i);
  await page.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();
  await tileAction(page, /^second/i, 'Mark as sensitive');
  // The owner never sees their own videos blurred.
  await expect(page.getByTestId('sensitive-cover')).toHaveCount(0);

  // Someone follows the owner: a follower with videos of their own.
  const other = await freshPage(browser);
  await registerAndVerify(other, fan);
  const followed = await other.request.post(`/api/users/${owner.username}/follow`, {
    headers: XHR,
  });
  expect(followed.ok()).toBe(true);
  await other.context().close();
  // And eight more, one with a very long name, so the list has to scroll in the panel.
  const stamp = Date.now().toString(36);
  for (let i = 0; i < 8; i++) {
    const context = await registerViaApi(browser, {
      email: `crowd${i}-${stamp}@example.com`,
      username: `crowd${i}_${stamp}`,
      password: 'secret123',
      displayName: i === 0 ? 'Anastasia Konstantinopolskaya-Wolfeschlegelstein' : `Crowd ${i}`,
    });
    const r = await context.request.post(`/api/users/${owner.username}/follow`, { headers: XHR });
    expect(r.ok()).toBe(true);
    await context.close();
  }

  // The preview: the banner above the header, the sensitive video blurred as for a guest.
  await page.getByTestId('view-as-visitor').click();
  await expect(page.getByTestId('visitor-banner')).toBeVisible();
  await expect(page.getByTestId('sensitive-cover')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private videos' })).toBeVisible();
  // It survives a reload: the mode belongs to the tab.
  await page.reload();
  await expect(page.getByTestId('visitor-banner')).toBeVisible();
  await expect(page.getByTestId('sensitive-cover')).toBeVisible();

  // Only the own page and its videos are previewed: another shelf is the owner's app as
  // usual, without the reminder; a panel over the page hides it too; back home, it is on again.
  await page.goto(`/@${fan.username}`);
  await expect(page.getByRole('heading', { name: fan.displayName })).toBeVisible();
  await expect(page.getByTestId('visitor-banner')).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByTestId('panel')).toBeVisible();
  await expect(page.getByTestId('visitor-banner')).toHaveCount(0);
  await page.getByTestId('panel-close').click();
  await expect(page).toHaveURL(`/@${owner.username}`);
  await expect(page.getByTestId('visitor-banner')).toBeVisible();
  await expect(page.getByTestId('sensitive-cover')).toBeVisible();

  // A private video opens the way a guest sees it: no player, the request card instead.
  await page.getByRole('link', { name: /^sample/i }).click();
  await expect(page.getByRole('heading', { name: /^sample/i })).toBeVisible();
  await expect(page.getByTestId('visitor-banner')).toBeVisible();
  await expect(page.getByTestId('player')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  // Back to the own view from the banner: the player is there again, the banner gone.
  await page.getByTestId('visitor-exit').click();
  await expect(page.getByTestId('visitor-banner')).toHaveCount(0);
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  // The followers list: one row per person, the name on its own line and the
  // numbers below it — a long name never pushes them out; no exchanges yet, so no chip.
  await page.goto(`/@${owner.username}`);
  await page
    .getByRole('link', { name: /Followers/i })
    .first()
    .click();
  const list = page.getByTestId('social-list');
  await expect(list).toBeVisible();
  const rows = list.getByRole('listitem');
  await expect(rows).toHaveCount(9);
  await expect(list.getByTestId('video-counts').first()).toContainText('0 public');
  await expect(list.getByTestId('exchanges')).toHaveCount(0);
  const long = rows.filter({ hasText: 'Anastasia' });
  await expect(long.getByTestId('video-counts')).toBeVisible();
  const [nameBox, rowBox] = await Promise.all([
    long.getByTestId('person-name').boundingBox(),
    long.boundingBox(),
  ]);
  expect(nameBox!.width).toBeLessThan(rowBox!.width); // truncated inside the row, not spilling
  // Nine rows do not fit the window: the panel scrolls, and the last row can be reached.
  const scroller = page.getByTestId('panel').locator('.overflow-y-auto').first();
  const overflow = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeGreaterThan(0);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeVisible();

  // Signing out ends the preview: the next sign-in in this tab opens the own view.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel')).toBeHidden();
  await page.getByTestId('view-as-visitor').click();
  await expect(page.getByTestId('visitor-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('visitor-banner')).toHaveCount(0);
  await login(page, owner);
  await expect(page.getByTestId('view-as-visitor')).toBeVisible();
  await expect(page.getByTestId('visitor-banner')).toHaveCount(0);
  await expect(page.getByTestId('sensitive-cover')).toHaveCount(0);
});

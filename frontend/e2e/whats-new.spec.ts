import { expect, test } from '@playwright/test';

import { endShelfVisits, newUser, registerAndVerify, registerViaApi, seedVideos } from './account';

const author = newUser('wnauth');
const fan = newUser('wnfan');
const xhr = { 'X-Requested-With': 'XMLHttpRequest' };

/** "What's new" instead of a notification per video; new since the last visit. */
test('a followed author’s new video lights “What’s new” until looked at, and their shelf since the last visit', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const authorContext = await registerViaApi(browser, author);
  await registerAndVerify(page, fan);
  // The back catalogue is older than the follow: listed, but nothing to light up.
  seedVideos(author.username, 'Old clip', 2, 'PUBLIC', 180);
  expect(
    (await page.request.post(`/api/users/${author.username}/follow`, { headers: xhr })).ok(),
  ).toBe(true);

  const menu = page.getByRole('button', { name: 'Account menu' });
  await menu.click();
  await expect(page.getByTestId('nav-whats-new')).toBeVisible();
  await expect(page.getByTestId('whats-new-dot')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A first visit to the shelf lights nothing; it ended hours ago.
  await page.goto(`/@${author.username}`);
  await expect(page.getByTestId('section-PUBLIC')).toBeVisible();
  await expect(page.getByTestId('fresh-dot')).toHaveCount(0);
  endShelfVisits(fan.username);

  // The author adds a video: the dot is on "What's new" in the account menu.
  seedVideos(author.username, 'New clip', 1, 'PRIVATE', 0);
  await menu.click();
  await expect(page.getByTestId('whats-new-dot')).toBeVisible();
  await page.getByTestId('nav-whats-new').click();
  await expect(page).toHaveURL(/panel:whats-new/);
  const list = page.getByTestId('whats-new-list');
  await expect(list.getByTestId('whats-new-item-new')).toHaveCount(1);
  await expect(list.getByTestId('whats-new-item-new')).toContainText('New clip 01');
  await expect(list.getByTestId('whats-new-item')).toHaveCount(2);
  // Looked at: the dot is gone.
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/panel:/);
  await menu.click();
  await expect(page.getByTestId('nav-whats-new')).toBeVisible();
  await expect(page.getByTestId('whats-new-dot')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Back on the shelf: only what came since the last visit has the quiet dot.
  await page.goto(`/@${author.username}`);
  await expect(page.getByTestId('section-PRIVATE')).toBeVisible();
  await expect(page.getByTestId('fresh-dot')).toHaveCount(1);
  await expect(page.getByTestId('section-PRIVATE').getByTestId('fresh-dot')).toHaveCount(1);

  // A video picked in the panel opens as a page, the panel closed.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByTestId('nav-whats-new').click();
  await page
    .getByTestId('whats-new-list')
    .getByRole('link', { name: 'Old clip 01' })
    .last()
    .click();
  await expect(page).not.toHaveURL(/panel:/);
  await expect(page.getByRole('heading', { name: 'Old clip 01' })).toBeVisible();
  await authorContext.close();
});

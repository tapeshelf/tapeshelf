import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { codeOf, setVisibility, uploadSampleAndWaitReady } from './videos';

/** The author marks a video sensitive through the API (the edit dialog does the same). */
async function markSensitive(page: Page, id: string): Promise<void> {
  const res = await page.request.patch(`/api/videos/${id}`, {
    data: { sensitive: true },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(res.ok()).toBeTruthy();
}

/**
 * The sensitive mark: strangers see a blurred cover and are asked once; a
 * guest also confirms being an adult and the answer lives in the browser, a signed-in viewer (an
 * adult by the terms) just chooses to see it and the answer switches the setting on in the account.
 */
test('a video marked sensitive asks once and is then shown', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const author = newUser('sens');
  await registerAndVerify(page, author);
  const videoId = await uploadSampleAndWaitReady(page);
  await setVisibility(page, /^sample/i, 'Public');
  await markSensitive(page, videoId);
  await page.reload();
  // the author always sees their own picture, with the mark on the tile
  await expect(
    page.getByRole('button', { name: /^sample/i }).getByTitle('Sensitive content'),
  ).toBeVisible();
  await expect(page.getByTestId('sensitive-cover')).toHaveCount(0);

  // a guest: blurred tile, the question, then the player; the answer survives a reload
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/@${author.username}`);
  await expect(guest.getByTestId('sensitive-cover')).toBeVisible();
  // a blurred tile is a button, not a link: it can only ask
  await guest.getByRole('button', { name: /sample/i }).click();
  await expect(guest.getByTestId('sensitive-dialog')).toContainText('Sensitive content');
  await expect(guest.getByTestId('sensitive-dialog')).toContainText(
    'This video is marked sensitive',
  );
  await guest.getByRole('button', { name: "I'm 18 or older, show" }).click();
  // only the question opened: the tile is clear now and the next click opens the video
  await expect(guest).toHaveURL(`/@${author.username}`);
  await expect(guest.getByTestId('sensitive-cover')).toHaveCount(0);
  await guest.getByRole('link', { name: /sample/i }).click();
  await expect(guest).toHaveURL(`/${await codeOf(guest, videoId)}`);
  await expect(guest.locator('app-video-player')).toBeVisible();
  await guest.reload();
  await expect(guest.locator('app-video-player')).toBeVisible();

  // a signed-in viewer: agreeing on the video page switches the setting on in the account
  const other = await (await browser.newContext()).newPage();
  await registerAndVerify(other, newUser('viewer'));
  await other.goto(`/@${author.username}/v/${videoId}`);
  await expect(other.getByTestId('sensitive-gate')).toContainText(
    'may show things not everyone wants to see',
  );
  await expect(other.getByRole('button', { name: /18 or older/ })).toHaveCount(0);
  await other.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(other.locator('app-video-player')).toBeVisible();
  const me = await (await other.request.get('/api/auth/me')).json();
  expect(me.showSensitive).toBe(true);
  await other.goto('/settings/profile');
  await expect(other.getByLabel(/Show sensitive content/)).toBeChecked();
});

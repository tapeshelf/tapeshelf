import { expect, test } from '@playwright/test';

import { newUser, registerViaApi, seedVideos, shareSeeded } from './account';
import { tile } from './videos';

const author = newUser('giver');
const holder = newUser('keeper');

/**
 * Videos from others can be deleted too, but only from the holder's own shelf: the
 * video stays with its author.
 */
test('a received video is deleted from my shelf only, from the shelf and from its page', async ({
  browser,
}) => {
  const authorCtx = await registerViaApi(browser, author);
  const holderCtx = await registerViaApi(browser, holder);
  seedVideos(author.username, 'gift', 2, 'PRIVATE');
  shareSeeded(author.username, 'gift 01', holder.username);
  shareSeeded(author.username, 'gift 02', holder.username);

  const page = await holderCtx.newPage();
  await page.goto(`/@${holder.username}`);
  await tile(page, /^gift 01/).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
  await page.getByTestId('bulk-bar').getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete 1 video from your shelf?');
  await expect(dialog).toContainText('They stay with their author');
  await dialog.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('Deleted: 1.')).toBeVisible();
  await expect(tile(page, /^gift 01/)).toHaveCount(0);

  await tile(page, /^gift 02/).click();
  await expect(page.getByRole('heading', { name: /^gift 02/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('It stays with its author')).toBeVisible();
  await page.getByTestId('confirm-delete-video').click();
  await expect(page.getByText('Video deleted from your shelf.')).toBeVisible();
  await expect(page).toHaveURL(`/@${holder.username}`);
  await expect(tile(page, /^gift/i)).toHaveCount(0);

  // The author still has both.
  const own = await authorCtx.newPage();
  await own.goto(`/@${author.username}`);
  await expect(tile(own, /^gift 01/)).toBeVisible();
  await expect(tile(own, /^gift 02/)).toBeVisible();
  await authorCtx.close();
  await holderCtx.close();
});

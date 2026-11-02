import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, seedVideos } from './account';
import { tileAction } from './videos';

const user = newUser('hidemenu');

/** "Hide from visitors" / "Show to visitors" from the tile's menu do what they say. */
test('the tile menu hides a video from visitors and shows it again', async ({ page }) => {
  await registerAndVerify(page, user);
  seedVideos(user.username, 'Clip', 2, 'PRIVATE');
  await page.reload();
  const hiddenFolder = page.getByRole('button', { name: /^Hidden/ });
  await expect(hiddenFolder).toContainText('0');

  await tileAction(page, /clip 01/i, 'Hide from visitors');
  await expect(page.getByRole('button', { name: /clip 01/i })).toHaveCount(0);
  await expect(hiddenFolder).toContainText('1');

  await hiddenFolder.click();
  const hidden = page.getByRole('button', { name: /clip 01/i });
  await expect(hidden).toBeVisible();
  // Not dimmed: the eye mark says it is hidden.
  await expect(hidden.locator('.opacity-45')).toHaveCount(0);
  await expect(hidden.getByTitle('hidden', { exact: true })).toBeVisible();

  await tileAction(page, /clip 01/i, 'Show to visitors');
  await expect(page.getByRole('button', { name: /clip 01/i })).toHaveCount(0);
  await expect(hiddenFolder).toContainText('0');
});

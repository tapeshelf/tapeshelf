import { type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { newUser, registerAndVerify, seedVideos } from './account';
import { tile, tileAction, uploadSampleAndWaitReady } from './videos';

/** Design-review screenshots, only with VS_SHOTS_DIR. */
async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env['VS_SHOTS_DIR'];
  if (dir) await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/**
 * a deleted video waits in "Deleted" for the plan's days and goes back
 * on the shelf with one click.
 */
test('a deleted video waits in “Deleted” and comes back on the shelf', async ({ page }) => {
  const user = newUser('trsh');
  await registerAndVerify(page, user);
  await uploadSampleAndWaitReady(page);

  await tileAction(page, /^sample/i, 'Delete');
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(tile(page, /^sample/i)).toHaveCount(0);

  const folders = page.getByRole('navigation', { name: 'Folders' });
  const folder = folders.getByRole('button', { name: /^Deleted/ });
  await expect(folder).toContainText('1');
  await folder.click();
  const item = page.getByTestId('trash-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Sample');
  await expect(item).toContainText('7 d left');
  await expect(page.getByText('waits here for 7 days')).toBeVisible();
  await shot(page, 'trash-01-list');
  await audit(page, 'trash');

  await item.getByTestId('trash-restore').click();
  await expect(page.getByText('“Sample” is back on your shelf.')).toBeVisible();
  await expect(page.getByTestId('trash-item')).toHaveCount(0);
  await expect(folder).not.toContainText('1');
  await folders.getByRole('button', { name: /^All videos/ }).click();
  await expect(tile(page, /^sample/i)).toBeVisible();
});

/**
 * the owner lets deleted videos go sooner — one from its row, or the whole trash —
 * and then they can no longer be brought back.
 */
test('videos deleted from “Deleted” or the whole trash emptied are gone for good', async ({
  page,
}) => {
  const user = newUser('trsx');
  await registerAndVerify(page, user);
  seedVideos(user.username, 'gone', 3, 'PRIVATE');
  await page.reload();
  for (const n of ['01', '02', '03']) {
    await tileAction(page, new RegExp(`^gone ${n}`), 'Delete');
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(tile(page, new RegExp(`^gone ${n}`))).toHaveCount(0);
  }

  const folders = page.getByRole('navigation', { name: 'Folders' });
  const folder = folders.getByRole('button', { name: /^Deleted/ });
  await folder.click();
  const items = page.getByTestId('trash-item');
  await expect(items).toHaveCount(3);

  // One from its row.
  await items.filter({ hasText: 'gone 01' }).getByTestId('trash-delete').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('can’t be brought back');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted from the trash: 1 video.')).toBeVisible();
  await expect(items).toHaveCount(2);

  // A click on a row ticks it; Shift ticks the range.
  await items.nth(0).locator('label').click();
  await items
    .nth(1)
    .locator('label')
    .click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('trash-delete-selected')).toHaveText(/Delete \(2\)/);
  await expect(page.getByTestId('trash-restore-selected')).toHaveText(/Restore \(2\)/);
  await shot(page, 'trash-02-selected');

  // The rest with the whole trash.
  await page.getByTestId('trash-empty').click();
  await expect(page.getByRole('alertdialog')).toContainText('2 videos can’t be brought back');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Empty trash' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();
  await expect(items).toHaveCount(0);
  await expect(folder).not.toContainText('2');
  await audit(page, 'trash empty');
});

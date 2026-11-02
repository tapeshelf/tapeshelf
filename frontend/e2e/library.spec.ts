import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { codeOf, dragTileTo, tile, uploadAndWaitReady } from './videos';

const user = newUser('lib');

/** The file-manager view: folders, drag and drop, multi-select and bulk actions. */
test.describe.serial('library: categories, drag and drop, bulk actions', () => {
  test('drag a video into a new category, filter by it, then select both and delete', async ({
    page,
  }) => {
    await registerAndVerify(page, user);
    await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
    await uploadAndWaitReady(page, SAMPLE_VIDEO_2, /^second/i);
    await expect(page.getByRole('heading', { name: 'My videos' })).toBeAttached();
    await expect(page.getByRole('button', { name: /^All videos/ })).toContainText('2');
    // The upload panel covers the bottom right of the shelf until it tucks itself away.
    await page.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();

    // Create a category inline in the index.
    await page.getByRole('button', { name: 'New category' }).click();
    await page.getByLabel('Category name').fill('Trips');
    await page.getByLabel('Category name').press('Enter');
    const trips = page.getByRole('button', { name: /^Trips/ });
    await expect(trips).toBeVisible();
    // Creating a category opens it: empty for now.
    await expect(page.getByText('Nothing here.')).toBeVisible();
    await page.getByRole('button', { name: /^All videos/ }).click();
    await expect(tile(page, /^sample/i)).toBeVisible();

    // Drag "sample" onto the category, then the folder shows only it.
    await dragTileTo(page, /^sample/i, trips);
    await expect(page.getByText('Moved.')).toBeVisible();
    await expect(trips).toContainText('1');
    // Only dragged, not picked: nothing is left selected.
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);
    await expect(tile(page, /^sample/i)).toHaveAttribute('aria-label', /^sample(?!.*selected)/i);
    await trips.click();
    await expect(tile(page, /^sample/i)).toBeVisible();
    await expect(tile(page, /^second/i)).toHaveCount(0);

    // The folder is in the address: a reload opens the same one. The layout and
    // the sort are the page's settings, kept like a change made in Settings.
    await expect(page).toHaveURL(/[?&]folder=c(:|%3A)/);
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().endsWith('/api/me/page'),
    );
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await saved;
    await page.reload();
    await expect(trips).toHaveAttribute('aria-current', 'page');
    await expect(tile(page, /^sample/i)).toBeVisible();
    await expect(tile(page, /^second/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A panel opened over the shelf and closed again leaves the folder as it was, in the address too.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByTestId('nav-exchange').click();
    await expect(page).toHaveURL(/panel:exchange/);
    await expect(page).toHaveURL(/[?&]folder=c(:|%3A)/);
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/panel:/);
    await expect(page).toHaveURL(/[?&]folder=c(:|%3A)/);
    await expect(page).not.toHaveURL(/[?&]tab=/);
    await expect(trips).toHaveAttribute('aria-current', 'page');
    await expect(tile(page, /^second/i)).toHaveCount(0);
    // A video opened from the category, then "back": the same category again.
    await tile(page, /^sample/i).click();
    await expect(page.getByRole('heading', { name: /^sample/i })).toBeVisible();
    await page.getByTestId('video-back').click();
    await expect(page).toHaveURL(/[?&]folder=c(:|%3A)/);
    await expect(trips).toHaveAttribute('aria-current', 'page');
    await expect(tile(page, /^second/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await page.getByRole('button', { name: /^All videos/ }).click();
    await expect(page).not.toHaveURL(/folder=/);
    await expect(tile(page, /^second/i)).toBeVisible();

    // A plain click opens the video; the big back button returns to the shelf.
    const sampleId = await tile(page, /^sample/i).getAttribute('data-video-id');
    await tile(page, /^sample/i).click();
    await expect(page).toHaveURL(`/${await codeOf(page, sampleId!)}`);
    await expect(page.getByRole('heading', { name: /^sample/i })).toBeVisible();
    await page.getByTestId('video-back').click();
    await expect(page).toHaveURL(`/@${user.username}`);
    await expect(tile(page, /^second/i)).toBeVisible();
    // Opened by a link there is no page to go back to: the button leads to the holder's shelf.
    await page.goto(`/v/${sampleId}`);
    await expect(page.getByTestId('video-back')).toHaveText(`Back to @${user.username}’s shelf`);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`/@${user.username}`);

    // Ctrl selects instead of opening, Shift extends; the floating bar never pushes the shelf
    // down. Then bulk "make public", and delete both with the Delete key.
    const top = () =>
      tile(page, /^second/i).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const before = await top();
    await tile(page, /^sample/i).click({ modifiers: ['ControlOrMeta'] });
    const bulk = page.getByTestId('bulk-bar');
    await expect(bulk).toContainText('1 selected');
    // within half a pixel: sub-pixel rounding differs between machines (CI saw 1/64 px), the bug
    // this guards against moved the shelf by the bar's whole height
    expect(await top()).toBeCloseTo(before, 0);
    await tile(page, /^second/i).click({ modifiers: ['Shift'] });
    await expect(bulk).toContainText('2 selected');
    await expect(page).toHaveURL(`/@${user.username}`);
    await bulk.getByRole('button', { name: 'Make public' }).click();
    await expect(tile(page, /^sample/i).getByTitle('Public')).toBeVisible();
    await expect(tile(page, /^second/i).getByTitle('Public')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Public/ })).toContainText('2');

    // A panel over the shelf takes the keys: Delete there asks nothing about the shelf.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByTestId('nav-exchange').click();
    await expect(page).toHaveURL(/panel:exchange/);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByTestId('panel-close').click();
    await expect(page).not.toHaveURL(/panel:/);
    // Closed for the shelf too, not only in the address: its keys are the shelf's again.
    await expect(page.getByTestId('panel')).toBeHidden();
    await expect(bulk).toContainText('2 selected');

    await page.keyboard.press('Delete');
    await expect(page.getByRole('alertdialog')).toContainText('Delete 2 videos?');
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByText('Deleted: 2.')).toBeVisible();
    await expect(tile(page, /^sample/i)).toHaveCount(0);
    await expect(tile(page, /^second/i)).toHaveCount(0);
    await expect(page.getByText('Your collection is empty', { exact: false })).toBeVisible();
  });
});

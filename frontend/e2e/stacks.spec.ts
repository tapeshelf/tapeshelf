import { type Browser, type Page, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { dragTileOnto, dragTileTo, stackTile, tile, uploadAndWaitReady } from './videos';

const user = newUser('stk');
const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/** Stacks: drop a video onto another, open, name, grow, categories, take out, unstack. */
test.describe.serial('stacks: drop onto a tile, open, name, category rules, take out', () => {
  test('two videos dropped together become a stack; it opens, takes a name and a third video', async ({
    page,
  }) => {
    await registerAndVerify(page, user);
    // Three videos: the sample clip twice (the first renamed "alpha" so the tiles differ) and "second".
    const alpha = await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
    const renamed = await page.request.patch(`/api/videos/${alpha}`, {
      data: { title: 'alpha' },
      headers: XHR,
    });
    expect(renamed.ok()).toBe(true);
    await page.reload();
    await expect(tile(page, /^alpha/i)).toBeVisible();
    await uploadAndWaitReady(page, SAMPLE_VIDEO_2, /^second/i);
    // The same file again: the upload asks first.
    await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i, true);
    await page.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();

    // "second" dropped on the middle of "alpha": a stack of two takes alpha's place.
    await dragTileOnto(page, tile(page, /^second/i), tile(page, /^alpha/i));
    await expect(page.getByText('Stacked.')).toBeVisible();
    const stack = stackTile(page, 'Stack', 2);
    await expect(stack).toBeVisible();
    await expect(stack.getByTestId('stack-count')).toHaveText('2');
    await expect(tile(page, /^second/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^All videos/ })).toContainText('3');

    // It opens in its window, in the address; the owner names it there.
    await stack.click();
    const sheet = page.getByTestId('stack-sheet');
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\?stack=/);
    await expect(sheet.getByRole('button', { name: /^alpha/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^second/i })).toBeVisible();
    await page.getByTestId('stack-name').fill('Summer');
    await page.getByTestId('stack-name').press('Enter');
    // A video opened from inside the stack: Back leads to the shelf, never into the window again.
    await sheet.getByRole('button', { name: /^alpha/ }).click();
    await expect(page.getByRole('heading', { name: /^alpha/ })).toBeVisible();
    await expect(page.getByTestId('video-back')).toHaveText(`Back to @${user.username}’s shelf`);
    await page.getByTestId('video-back').click();
    await expect(page).toHaveURL(`/@${user.username}`);
    await expect(sheet).toHaveCount(0);
    await expect(stackTile(page, 'Summer', 2)).toBeVisible();
    await page.waitForTimeout(600); // the shelf settles its sizes after the fresh load

    // A third video dropped on the stack joins it.
    await dragTileOnto(page, tile(page, /^sample/i), stackTile(page, 'Summer', 2));
    await expect(stackTile(page, 'Summer', 3)).toBeVisible();
    await expect(page.getByRole('button', { name: /^All videos/ })).toContainText('3');
  });

  test('a stack keeps one category: it moves whole, a loose video joins it, a conflict asks', async ({
    page,
  }) => {
    await login(page, user);
    const setCategory = async (videoIds: string[], categoryId: string | null) => {
      const res = await page.request.patch('/api/me/collection/holdings', {
        data: { videoIds, categoryId },
        headers: XHR,
      });
      expect(res.ok()).toBe(true);
    };
    const created = await page.request.post('/api/me/categories', {
      data: { name: 'Trips' },
      headers: XHR,
    });
    const tripsId = ((await created.json()) as { id: string }).id;
    await page.reload();
    const trips = page.getByRole('button', { name: /^Trips/ });
    await expect(trips).toBeVisible();

    // The whole stack onto the category: all three move. Picked on purpose (Ctrl) before the
    // drag, it stays picked; the tile dragged in library.spec, only dragged, does not.
    await stackTile(page, 'Summer', 3).click({ modifiers: ['ControlOrMeta'] });
    await expect(page.getByTestId('bulk-bar')).toContainText('selected');
    await dragTileTo(page, 'Summer, 3 videos', trips);
    await expect(page.getByText('Moved.')).toBeVisible();
    await expect(trips).toContainText('3');
    await expect(page.getByTestId('bulk-bar')).toContainText('selected');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);

    // Inside the stack, a video dragged out onto the dim leaves it (and keeps the category).
    await stackTile(page, 'Summer', 3).click();
    const sheet = page.getByTestId('stack-sheet');
    await expect(sheet).toBeVisible();
    const third = sheet.getByRole('button', { name: /^sample/i });
    await third.scrollIntoViewIfNeeded();
    const box = (await third.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 20, { steps: 4 });
    await page.mouse.move(640, 10, { steps: 10 });
    await expect(page.getByText('Drop here to take out of the stack')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByText('Taken out of the stack.')).toBeVisible();
    await page.getByTestId('stack-close').click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await expect(stackTile(page, 'Summer', 2)).toBeVisible();
    await expect(tile(page, /^sample/i)).toBeVisible();
    await expect(trips).toContainText('3');

    // A loose video without a category dropped on a stack in "Trips" takes the category silently.
    const sampleId = (await tile(page, /^sample/i).getAttribute('data-video-id'))!;
    await setCategory([sampleId], null);
    await page.reload();
    await expect(trips).toContainText('2');
    await dragTileOnto(page, tile(page, /^sample/i), stackTile(page, 'Summer', 2));
    await expect(page.getByText('Stacked; the stack is now in “Trips”.')).toBeVisible();
    await expect(stackTile(page, 'Summer', 3)).toBeVisible();
    await expect(trips).toContainText('3');

    // The other way round: the stack without a category, the video in "Trips" — the owner chooses.
    const members = (await stackTile(page, 'Summer', 3).getAttribute('data-tile-ids'))!.split(',');
    await setCategory(members, null); // the whole stack at once: it stays together
    await page.reload();
    await expect(trips).toContainText('0');
    await stackTile(page, 'Summer', 3).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^sample/i }).click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('take-out').click();
    await expect(page.getByText('Taken out of the stack.')).toBeVisible();
    await page.getByTestId('stack-close').click();
    await expect(sheet).toHaveCount(0);
    await setCategory([sampleId], tripsId);
    await page.reload();
    await expect(trips).toContainText('1');
    await dragTileOnto(page, tile(page, /^sample/i), stackTile(page, 'Summer', 2));
    const dialog = page.getByTestId('stack-category-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Trips' })).toBeChecked();
    await dialog.getByTestId('stack-category-confirm').click();
    await expect(page.getByText('Stacked; the stack is now in “Trips”.')).toBeVisible();
    await expect(stackTile(page, 'Summer', 3)).toBeVisible();
    await expect(trips).toContainText('3');
  });

  test('a visitor sees the stack and opens it; the owner unstacks it and groups with Ctrl+G', async ({
    page,
    browser,
  }) => {
    const guest = await freshPage(browser);
    await guest.goto(`/@${user.username}`);
    const stack = stackTile(guest, 'Summer', 3);
    await expect(stack).toBeVisible();
    await expect(guest.getByRole('button', { name: /^sample/i })).toHaveCount(0);
    await stack.click();
    const sheet = guest.getByTestId('stack-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Summer' })).toBeVisible();
    await expect(sheet.locator('[data-video-id]')).toHaveCount(3);
    await guest.goBack();
    await expect(sheet).toHaveCount(0);
    await guest.context().close();

    await login(page, user);
    await stackTile(page, 'Summer', 3).click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('unstack').click();
    await expect(page.getByText('Unstacked.')).toBeVisible();
    await expect(page.locator('app-stack-tile')).toHaveCount(0);
    await expect(tile(page, /^sample/i)).toBeVisible();

    // Keyboard: Ctrl+G stacks the selection, Ctrl+Shift+G takes it apart again.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);
    await tile(page, /^alpha/i).click({ modifiers: ['ControlOrMeta'] });
    await tile(page, /^second/i).click({ modifiers: ['ControlOrMeta'] });
    await expect(page.getByTestId('bulk-bar')).toContainText('2 selected');
    await page.keyboard.press('ControlOrMeta+g');
    await expect(page.getByText('Stacked.', { exact: true })).toBeVisible();
    await expect(stackTile(page, 'Stack', 2)).toBeVisible();
    // The two videos stay selected, as the stack tile: Ctrl+Shift+G takes them both out.
    await expect(page.getByTestId('bulk-bar')).toContainText('2 selected');
    await expect(stackTile(page, 'Stack', 2).getByTestId('tile-check')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+g');
    await expect(
      page.getByText('The stack had one video left, so it was dissolved.'),
    ).toBeVisible();
    await expect(page.locator('app-stack-tile')).toHaveCount(0);
  });

  test('the owner picks the stack’s cover; a drag between tiles sorts the shelf by hand', async ({
    page,
  }) => {
    await login(page, user);
    const alphaThumb = await tile(page, /^alpha/i)
      .locator('img[data-thumb]')
      .getAttribute('src');
    await tile(page, /^alpha/i).click({ modifiers: ['ControlOrMeta'] });
    await tile(page, /^second/i).click({ modifiers: ['ControlOrMeta'] });
    await page.keyboard.press('ControlOrMeta+g');
    await expect(stackTile(page, 'Stack', 2)).toBeVisible();
    await page.keyboard.press('Escape');

    // The first video (the newest, "second") is the cover until the owner picks another from
    // inside the window.
    await stackTile(page, 'Stack', 2).click();
    const sheet = page.getByTestId('stack-sheet');
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: /^second/i }).getByTestId('cover-chip'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: /^alpha/ }).click({ button: 'right' });
    await page.getByTestId('context-menu').getByTestId('set-cover').click();
    await expect(page.getByText('This video is the stack’s cover now.')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: /^alpha/ }).getByTestId('cover-chip'),
    ).toBeVisible();
    await page.getByTestId('stack-close').click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await expect(
      stackTile(page, 'Stack', 2).locator('[data-morph] img[data-thumb]'),
    ).toHaveAttribute('src', alphaThumb!);

    // Sorted by date, the newest first: "sample", then the stack. Dropping "sample" after the stack
    // keeps that order by hand from now on, reload included.
    const order = () =>
      page
        .locator('[data-video-id]')
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute('aria-label')?.replace(/, selected$/, '')),
        );
    expect(await order()).toEqual(['Sample', 'Stack, 2 videos']);
    const from = (await tile(page, /^sample/i).boundingBox())!;
    const to = (await stackTile(page, 'Stack', 2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 10, {
      steps: 4,
    });
    await page.mouse.move(to.x + to.width * 0.92, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(
      page.getByText('The shelf is sorted by hand from now on: your order is kept.'),
    ).toBeVisible();
    expect(await order()).toEqual(['Stack, 2 videos', 'Sample']);
    await page.reload();
    await expect(stackTile(page, 'Stack', 2)).toBeVisible();
    expect(await order()).toEqual(['Stack, 2 videos', 'Sample']);
  });
});

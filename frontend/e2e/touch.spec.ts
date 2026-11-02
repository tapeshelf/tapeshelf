import { devices, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify, seedVideos } from './account';

const owner = newUser('touch');

/** The shelf on a phone: no Ctrl, Shift or right button, still several videos at once. */
test('on a touch screen several videos are picked by a button or a long press', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await registerAndVerify(page, owner);
  seedVideos(owner.username, 'Clip', 4, 'PRIVATE');
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale: 'en-US',
  });
  const p = await context.newPage();
  try {
    await login(p, owner);
    const tiles = p.locator('app-library-tile');
    await expect(tiles).toHaveCount(4);
    const bulk = p.getByTestId('bulk-bar');

    // The button: taps then pick instead of opening.
    await p.getByTestId('pick-several').click();
    await tiles.nth(0).tap();
    await tiles.nth(2).tap();
    await expect(bulk).toContainText('2 selected');
    await expect(p).toHaveURL(`/@${owner.username}`);
    await bulk.getByRole('button', { name: 'Make public' }).click();
    await expect(tiles.nth(0).getByTitle('Public')).toBeVisible();
    await bulk.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bulk).toHaveCount(0);

    // A long press on a tile: it is selected, the video does not open, the next tap adds another.
    const box = (await tiles.nth(1).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await tiles.nth(1).dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: at.x,
      clientY: at.y,
    });
    await p.waitForTimeout(600);
    await p.evaluate(({ x, y }) => {
      window.dispatchEvent(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: x, clientY: y }),
      );
    }, at);
    await tiles.nth(1).dispatchEvent('click');
    await expect(bulk).toContainText('1 selected');
    await expect(p).toHaveURL(`/@${owner.username}`);
    await tiles.nth(3).tap();
    await expect(bulk).toContainText('2 selected');
  } finally {
    await context.close();
  }
});

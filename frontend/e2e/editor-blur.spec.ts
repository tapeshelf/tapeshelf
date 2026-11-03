import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, setTier } from './account';
import { uploadSampleAndWaitReady } from './videos';

const author = newUser('blur');

/** Takes the point with the pointer and drags it by (dx, dy). */
async function drag(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test('every handle of every blurred area resizes that area', async ({ page }) => {
  test.setTimeout(180_000);
  await registerAndVerify(page, author);
  const id = await uploadSampleAndWaitReady(page);
  setTier(author.username, 'PREMIUM');
  await page.goto(`/edit/${id}`);
  const stage = page.getByTestId('editor-stage');
  await expect
    .poll(() => stage.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), {
      timeout: 20_000,
    })
    .toBe(640);
  const shots = process.env['VS_EDITOR_SHOTS'];
  if (shots) await page.screenshot({ path: `${shots}/editor-frame.png`, fullPage: true });
  await page.getByTestId('editor-tab-blur').click();
  await page.getByTestId('add-blur').click();
  await page.getByTestId('add-blur').click();
  const first = page.getByTestId('stage-blur-0');
  const second = page.getByTestId('stage-blur-1');
  // The second lies on the first: moved aside, it is the one picked.
  let box = (await second.boundingBox())!;
  await drag(page, box.x + box.width / 2, box.y + box.height / 2, 120, 60);
  if (shots) await page.screenshot({ path: `${shots}/editor-blur.png`, fullPage: true });

  const untouched = (await first.boundingBox())!;
  box = (await second.boundingBox())!;
  // Bottom right: it grows that way, its top left stays.
  await drag(page, box.x + box.width, box.y + box.height, 40, 30);
  let now = (await second.boundingBox())!;
  expect(now.width).toBeCloseTo(box.width + 40, 0);
  expect(now.height).toBeCloseTo(box.height + 30, 0);
  expect(now.x).toBeCloseTo(box.x, 0);
  expect(now.y).toBeCloseTo(box.y, 0);
  // Top left: it shrinks, its bottom right stays.
  box = now;
  await drag(page, box.x, box.y, 20, 10);
  now = (await second.boundingBox())!;
  expect(now.width).toBeCloseTo(box.width - 20, 0);
  expect(now.height).toBeCloseTo(box.height - 10, 0);
  expect(now.x + now.width).toBeCloseTo(box.x + box.width, 0);
  // A side: only that side.
  box = now;
  await drag(page, box.x + box.width, box.y + box.height / 2, 25, 0);
  now = (await second.boundingBox())!;
  expect(now.width).toBeCloseTo(box.width + 25, 0);
  expect(now.height).toBeCloseTo(box.height, 0);
  // The other area was left alone, and undo takes back one drag.
  expect(await first.boundingBox()).toEqual(untouched);
  await page.getByTestId('undo').click();
  await expect
    .poll(async () => Math.round((await second.boundingBox())!.width))
    .toBe(Math.round(box.width));
  if (shots) {
    for (const tab of ['time', 'timer', 'caption', 'sound']) {
      await page.getByTestId(`editor-tab-${tab}`).click();
      const add = page.getByTestId(`add-${tab === 'time' ? 'cut' : tab}`);
      if (await add.count()) await add.click();
      await page.screenshot({ path: `${shots}/editor-${tab}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('editor-tab-blur').click();
    await page.screenshot({ path: `${shots}/editor-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByTestId('editor-tab-frame').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/editor-dark.png`, fullPage: true });
  }
});

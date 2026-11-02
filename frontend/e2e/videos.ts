import { type Locator, type Page, expect } from '@playwright/test';

import { SAMPLE_VIDEO } from './global-setup';

/** The tile of a video on the own page (library) by its title. */
export function tile(page: Page, title: string | RegExp): Locator {
  return page.getByRole('button', { name: title });
}

/**
 * Uploads a clip on the own page and waits until the worker has produced its thumbnail. `again`:
 * the same file is on the shelf already — it is held back with a word and sent anyway.
 */
export async function uploadAndWaitReady(
  page: Page,
  file: string,
  title: RegExp,
  again = false,
): Promise<string> {
  await page.getByTestId('upload-input').setInputFiles(file);
  if (again) await page.getByTestId('upload-anyway').click();
  await expect(page.getByTestId('upload-panel')).toContainText('Uploaded, now processing', {
    timeout: 30_000,
  });
  const t = tile(page, title);
  // The tile's small copy, also after the live "processed" event (was the JPEG).
  await expect(t.locator('img[data-thumb]')).toHaveAttribute('src', /\/s07\.webp$/, {
    timeout: 90_000,
  });
  const id = await t.getAttribute('data-video-id');
  if (!id) throw new Error('tile has no video id');
  return id;
}

/** The short code a video opens at, tapeshelf.com/<code>. */
export async function codeOf(page: Page, videoId: string): Promise<string> {
  const res = await page.request.get(`/api/videos/${videoId}/context`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { code: string }).code;
}

/** Uploads the sample clip on the own page, waits for the worker, returns the video id. */
export function uploadSampleAndWaitReady(page: Page): Promise<string> {
  return uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
}

/** Opens the context menu of a tile and picks an action. */
export async function tileAction(
  page: Page,
  title: string | RegExp,
  action: string,
): Promise<void> {
  await tile(page, title).click({ button: 'right' });
  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: action, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

/** Changes the visibility of an own video through its context menu. */
export async function setVisibility(
  page: Page,
  title: RegExp,
  visibility: 'Public' | 'Private',
): Promise<void> {
  await tileAction(page, title, visibility === 'Public' ? 'Make public' : 'Make private');
  // A public video carries a globe in the corner of its picture; private is the default.
  await expect(tile(page, title).getByTitle('Public')).toHaveCount(visibility === 'Public' ? 1 : 0);
}

/** Drags a tile onto a folder/category of the index (pointer-based drag, see tile-drag.ts). */
export async function dragTileTo(
  page: Page,
  title: string | RegExp,
  target: Locator,
): Promise<void> {
  // Not at the very edge of the screen: a drag resting there scrolls the page away from it.
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from = await tile(page, title).boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');
  // A big tile (a showcase of one) may reach below the screen: grab the middle of what is in view.
  const bottom = Math.min(from.y + from.height, page.viewportSize()?.height ?? Infinity);
  const fy = (Math.max(from.y, 0) + bottom) / 2;
  await page.mouse.move(from.x + from.width / 2, fy);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, fy + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Drags a tile onto the middle of another and rests there a moment: stacks them. */
export async function dragTileOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  // Both must be on screen: a real drag scrolls the page itself, the test just starts in view. The
  // target goes to the middle of the screen (a tile only partly in view has its middle outside it),
  // so the source in the row above stays in view too.
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 10, { steps: 4 });
  // The shelf may have re-laid out since (a summary arriving sizes the tiles): aim again.
  const now = (await target.boundingBox()) ?? to;
  await page.mouse.move(now.x + now.width / 2, now.y + now.height / 2, { steps: 12 });
  await page.waitForTimeout(700);
  await page.mouse.up();
}

/** A stack's tile on the shelf by its name ("Stack" when unnamed) and count. */
export function stackTile(page: Page, name: string, count: number): Locator {
  return page.getByRole('button', { name: `${name}, ${count} videos`, exact: true });
}

import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, seedVideos } from './account';
import { uploadSampleAndWaitReady } from './videos';

const owner = newUser('ghost');

test('a shelf waits as placeholders and comes in one piece, its pictures fading in', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const shots = process.env['VS_EDITOR_SHOTS'];
  await registerAndVerify(page, owner);
  await uploadSampleAndWaitReady(page);
  seedVideos(owner.username, 'Clip', 70, 'PUBLIC');

  // Everything the shelf asks for first is held back: only placeholders can be on the page.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const asks: string[] = [];
  await page.route(
    (url) => /\/collection(\/|$|\?)/.test(url.pathname),
    async (route) => {
      asks.push(new URL(route.request().url()).pathname);
      await held;
      await route.continue().catch(() => undefined);
    },
  );
  // The pictures come late, too.
  await page.route('**/*.{webp,jpg,jpeg}*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue().catch(() => undefined);
  });
  await page.goto(`/@${owner.username}`);
  const ghosts = page.getByTestId('shelf-ghosts');
  await expect(ghosts).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-video-id]')).toHaveCount(0);
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/shelf-ghosts.png` });
  const before = (await ghosts.boundingBox())!;
  expect(before.height).toBeGreaterThan(200);

  // Tiles are not drawn until month headings and sizes are in too, so nothing moves afterwards.
  release();
  await expect(page.locator('[data-video-id]').first()).toBeVisible({ timeout: 20_000 });
  await expect(ghosts).toHaveCount(0);
  const first = page.locator('[data-video-id]').first();
  const place = (await first.boundingBox())!;
  if (shots) await page.screenshot({ path: `${shots}/shelf-pictures-coming.png` });
  await page.waitForTimeout(1500);
  expect(await first.boundingBox()).toEqual(place);
  if (shots) await page.screenshot({ path: `${shots}/shelf-pictures-in.png` });

  // The rows still to come stand as placeholders under the last tiles.
  await expect(page.getByTestId('auto-more').locator('app-tile-ghost').first()).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId('auto-more')).toHaveCount(0, { timeout: 20_000 });
});

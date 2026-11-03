import { type Page, expect, test } from '@playwright/test';

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
  const ghostAt = (await ghosts.locator('app-tile-ghost').first().boundingBox())!;
  if (shots) await page.screenshot({ path: `${shots}/shelf-ghosts.png` });
  const before = (await ghosts.boundingBox())!;
  expect(before.height).toBeGreaterThan(200);

  // Tiles are not drawn until month headings and sizes are in too, so nothing moves afterwards.
  release();
  await expect(page.locator('[data-video-id]').first()).toBeVisible({ timeout: 20_000 });
  await expect(ghosts).toHaveCount(0);
  const first = page.locator('[data-video-id]').first();
  const place = (await first.boundingBox())!;
  expect(
    Math.abs(place.y - ghostAt.y),
    'the tiles land where their placeholders stood',
  ).toBeLessThan(2);
  if (shots) await page.screenshot({ path: `${shots}/shelf-pictures-coming.png` });
  await page.waitForTimeout(1500);
  expect(await first.boundingBox()).toEqual(place);
  if (shots) await page.screenshot({ path: `${shots}/shelf-pictures-in.png` });

  // The rows still to come stand as placeholders under the last tiles.
  await expect(page.getByTestId('auto-more').locator('app-tile-ghost').first()).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId('auto-more')).toHaveCount(0, { timeout: 20_000 });
});

/** Holds the shelf's lists back (not its summary): only placeholders can be on the page. */
async function holdLists(page: Page): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => /\/collection(\/|$|\?)/.test(url.pathname) && !/summary/.test(url.pathname),
    async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    },
  );
  return release;
}

test('a visitor and the owner previewing see the tiles land where their placeholders stood', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const host = newUser('ghostv');
  await registerAndVerify(page, host);
  seedVideos(host.username, 'Clip', 30, 'PUBLIC');
  const check = async (on: Page, open: () => Promise<unknown>) => {
    const release = await holdLists(on);
    await open();
    const ghosts = on.getByTestId('shelf-ghosts');
    await expect(ghosts).toBeVisible({ timeout: 20_000 });
    await on.waitForTimeout(400);
    const at = (await ghosts.locator('app-tile-ghost').first().boundingBox())!;
    release();
    const tile = on.locator('[data-video-id]').first();
    await expect(tile).toBeVisible({ timeout: 20_000 });
    const landed = (await tile.boundingBox())!;
    expect(Math.abs(landed.y - at.y)).toBeLessThan(2);
    expect(Math.abs(landed.x - at.x)).toBeLessThan(2);
    await on.unrouteAll({ behavior: 'ignoreErrors' });
  };
  // Somebody else's shelf.
  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await check(guest, () => guest.goto(`/@${host.username}`));
  // The own page as a visitor sees it: the person stays on screen through the switch.
  await page.goto(`/@${host.username}`);
  await page.getByTestId('view-as-visitor').waitFor();
  await expect(page.locator('[data-video-id]').first()).toBeVisible({ timeout: 20_000 });
  await check(page, async () => {
    await page.getByTestId('view-as-visitor').click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test('at rest a tile says nothing; under the pointer, its name and length', async ({ page }) => {
  test.setTimeout(120_000);
  const host = newUser('quiet');
  await registerAndVerify(page, host);
  seedVideos(host.username, 'Clip', 3, 'PUBLIC');
  await page.goto(`/@${host.username}`);
  const tile = page.locator('[data-video-id]').first();
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await page.mouse.move(0, 0);
  // Every word on the picture that can be seen: through its own and its ancestors' opacity.
  const shown = () =>
    tile.evaluate((root) => {
      const words: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (!text) continue;
        let opacity = 1;
        for (let el = node.parentElement; el && el !== root; el = el.parentElement)
          opacity *= Number(getComputedStyle(el).opacity);
        if (opacity > 0) words.push(text);
      }
      return words;
    });
  await expect.poll(shown).toEqual([]);
  await tile.hover();
  await expect.poll(shown).toContain('0:10');
});

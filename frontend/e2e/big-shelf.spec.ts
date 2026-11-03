import { type Page, expect, test } from '@playwright/test';

import { login, makeAdmin, newUser, registerAndVerify, seedVideos } from './account';
import { dragTileOnto } from './videos';

const owner = newUser('big');

/** The request for a shelf's second page (it comes by itself as the end of the page nears). */
const secondPage = (url: URL) =>
  url.pathname.endsWith('/collection') && url.searchParams.get('offset') === '60';

/** Holds a shelf's second page back until released: only the first one is on the page. */
async function holdSecondPage(page: Page): Promise<() => Promise<void>> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(secondPage, async (route) => {
    await held;
    await route.continue().catch(() => undefined); // the page may have been reloaded meanwhile
  });
  return async () => {
    release();
    await page.unroute(secondPage);
  };
}

/** Scrolls down until the shelf has nothing more to bring. */
async function scrollToTheEnd(page: Page, rows = page.locator('[data-video-id]')): Promise<void> {
  await expect(rows.first()).toBeVisible(); // the first page is in
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByTestId('auto-more')).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Tiles of the owner's shelf in the order shown (their labels). */
const order = (page: Page) =>
  page
    .locator('[data-video-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')?.replace(/, selected$/, '')));

/** Shelves bigger than a page. */
test.describe.serial('a shelf bigger than a page', () => {
  test('a visitor scrolls through the sections one after another, each with its real count; back from a video it is as it was', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await registerAndVerify(page, owner);
    seedVideos(owner.username, 'Public clip', 65, 'PUBLIC');
    seedVideos(owner.username, 'Private clip', 3, 'PRIVATE');
    const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
    try {
      await guest.goto(`/@${owner.username}`);
      const pub = guest.getByTestId('section-PUBLIC');
      const priv = guest.getByTestId('section-PRIVATE');
      await expect(pub.locator('h2 sup')).toHaveText('65');
      // The private section follows the last public video, with its real count.
      await scrollToTheEnd(guest);
      await expect(pub.locator('[data-video-id]')).toHaveCount(65);
      await expect(priv.locator('h2 sup')).toHaveText('3');
      await expect(guest.getByTestId('more-PUBLIC')).toHaveCount(0);
      await expect(guest.getByTestId('more-PRIVATE')).toHaveCount(0);
      await expect(guest.locator('app-compact-footer footer')).toBeVisible(); // the footer, at the very end

      // Back from a video: the pages loaded and the place on the page are still there.
      const card = priv.getByRole('link', { name: /Private clip 02/ }).first();
      await card.scrollIntoViewIfNeeded();
      const y = await guest.evaluate(() => window.scrollY);
      expect(y).toBeGreaterThan(200);
      await card.click();
      await expect(guest.getByRole('heading', { name: /Private clip 02/ })).toBeVisible();
      await guest.goBack();
      await expect(priv.locator('h2 sup')).toHaveText('3');
      await expect(guest.getByTestId('more-PUBLIC')).toHaveCount(0);
      await expect
        .poll(() => guest.evaluate(() => window.scrollY), { timeout: 5_000 })
        .toBeGreaterThan(y - 100);
    } finally {
      await guest.context().close();
    }
  });

  test('the owner drags on a shelf bigger than a page under another sort: the saved order is the one on screen', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, owner);
    const put = await page.request.put('/api/me/page', {
      data: { sort: 'title' },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(put.ok()).toBe(true);
    const release = await holdSecondPage(page);
    await page.reload();
    const tiles = page.locator('[data-video-id]');
    await expect(tiles).toHaveCount(60);
    const firstPage = await order(page);
    expect(firstPage.slice(0, 3)).toEqual([
      'Private clip 01',
      'Private clip 02',
      'Private clip 03',
    ]);

    // Only the first page is loaded: the first tile dropped after the second. The whole shelf takes
    // the title order by hand, then the move — not just the 60 videos the page had.
    const from = (await tiles.nth(0).boundingBox())!;
    const to = (await tiles.nth(1).boundingBox())!;
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

    await release();
    await page.reload();
    await scrollToTheEnd(page);
    await expect(tiles).toHaveCount(68);
    const titles = [
      ...['01', '02', '03'].map((n) => `Private clip ${n}`),
      ...Array.from({ length: 65 }, (_, i) => `Public clip ${String(i + 1).padStart(2, '0')}`),
    ];
    expect(await order(page)).toEqual([titles[1], titles[0], ...titles.slice(2)]);

    // All 68 loaded, two tiles stacked: the shelf is fetched again with all of them, not cut back
    // to its first page.
    // (The fourth tile may stand in the next row: the helper brings it into view first.)
    await page.evaluate(() => window.scrollTo(0, 0));
    await dragTileOnto(page, tiles.nth(2), tiles.nth(3));
    await expect(page.getByRole('button', { name: /^Stack, 2 videos$/ })).toBeVisible();
    await expect.poll(() => tiles.count()).toBe(67);
    await expect(page.getByTestId('auto-more')).toHaveCount(0);
  });

  test('the next page comes by itself near the end; nothing in view moves, the new ones come below', async ({
    browser,
  }) => {
    const guest = await (
      await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
    ).newPage();
    try {
      const release = await holdSecondPage(guest);
      await guest.goto(`/@${owner.username}`);
      const more = guest.getByTestId('more-PUBLIC');
      await expect(more).toHaveCount(1);
      // Near the end: the page is asked for, its rows stand as placeholders, the footer waits.
      await guest.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(more.locator('app-tile-ghost').first()).toBeVisible();
      await expect(guest.locator('app-compact-footer footer')).toHaveCount(0);
      const where = () =>
        guest.evaluate(() => ({
          y: Math.round(scrollY),
          tiles: [
            ...document.querySelectorAll<HTMLElement>(
              '[data-testid="section-PUBLIC"] [data-video-id]',
            ),
          ].map((t) => {
            const r = t.getBoundingClientRect();
            return `${t.dataset['videoId']}@${Math.round(r.left)},${Math.round(r.top)}`;
          }),
        }));
      const before = await where();
      await release();
      await expect(more).toHaveCount(0);
      const after = await where();
      expect(after.y).toBe(before.y);
      expect(after.tiles.slice(0, before.tiles.length)).toEqual(before.tiles);
      expect(after.tiles.length).toBeGreaterThan(before.tiles.length);
    } finally {
      await guest.context().close();
    }
  });

  test('an admin table brings its next rows as its end nears, the count below it', async ({
    page,
  }) => {
    await login(page, owner);
    makeAdmin(owner.username);
    await page.goto(`/admin/videos?author=${owner.username}`);
    const rows = page.getByTestId('admin-video-row');
    await expect(page.getByText(/1–(30|60|68) of 68/)).toBeVisible();
    await scrollToTheEnd(page, rows);
    await expect(rows).toHaveCount(68);
    await expect(page.getByText('1–68 of 68')).toBeVisible();
  });
});

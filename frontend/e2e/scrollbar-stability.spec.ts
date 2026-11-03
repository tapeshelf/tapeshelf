import { type Page, expect, test } from '@playwright/test';

import { makeAdmin, newUser, registerAndVerify, runSql, seedVideos, setTier } from './account';
import { SAMPLE_VIDEO } from './global-setup';
import { browserWithScrollbars, shakingHeights, strayScrollbars } from './scrollbar';
import { codeOf, uploadSampleAndWaitReady } from './videos';

/** Whatever lays itself out by its width can run the page into its own scrollbar, for good. */
const WIDTHS = [1280, 720, 1024, 1920];

test('no page shakes at the height where its scrollbar comes', async ({ playwright }, info) => {
  test.setTimeout(900_000);
  const { baseURL, locale } = info.project.use;
  const browser = await browserWithScrollbars(playwright, info);
  const owner = newUser('sbar');
  const context = await browser.newContext({ baseURL, locale });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const found: Record<string, number[]> = {};
  const strays: Record<string, string[]> = {};
  const check = async (on: Page, name: string, url: string, widths = WIDTHS.slice(0, 1)) => {
    await on.goto(url);
    await on.waitForLoadState('networkidle').catch(() => undefined);
    await on.setViewportSize({ width: 1280, height: 900 });
    await on.waitForTimeout(150);
    const stray = await strayScrollbars(on);
    if (stray.length) strays[name] = stray;
    for (const width of widths) {
      const heights = await shakingHeights(on, width);
      if (heights.length) found[`${name} at ${width}`] = heights;
    }
  };
  try {
    await registerAndVerify(page, owner);
    const id = await uploadSampleAndWaitReady(page);
    const code = await codeOf(page, id);
    setTier(owner.username, 'PREMIUM');

    // A shelf: a short one and a longer one, where a row's height still follows the width.
    const shelf = `/@${owner.username}`;
    await check(page, 'shelf, one video', shelf, WIDTHS);
    seedVideos(owner.username, 'Clip', 7, 'PUBLIC');
    await check(page, 'shelf, eight videos', shelf, WIDTHS);
    // With a row on top of it, as the owner sees it and as a visitor does.
    runSql(
      `UPDATE "VideoAccess" a SET pinned = 0 FROM "Video" v, "User" u
       WHERE v.id = a."videoId" AND u.id = a."holderId" AND u.username = $1 AND v.title = 'Clip 03'`,
      [owner.username],
    );
    await check(page, 'shelf with a row on top', shelf, WIDTHS);
    await expect(page.getByTestId('featured')).toBeVisible();
    seedVideos(owner.username, 'More', 16, 'PUBLIC');
    await check(page, 'shelf, 24 videos', shelf, WIDTHS);

    // The other pages: all of them, once. Side panels scroll by themselves.
    for (const [name, url] of [
      ['home', '/'],
      ['video', `/${code}`],
      ['editor', `/edit/${id}`],
      ['profile', '/settings/profile'],
      ['account', '/settings/account'],
      ['plan', '/settings/plan'],
      ['security', '/settings/security'],
      ['page settings', '/settings/page'],
      ['notification settings', '/settings/notifications'],
      ['blocked', '/settings/blocked'],
      ['exchange', '/exchange'],
      ['support', '/support'],
      ['new request', '/support/new'],
      ['links', '/links'],
      ['whats new', '/whats-new'],
      ['messages', '/messages'],
      ['pro', '/pro'],
      ['notifications', '/notifications'],
    ] as const)
      await check(page, name, url);

    makeAdmin(owner.username);
    await check(page, 'admin', '/admin');
    await expect(page).toHaveURL(/\/admin\//);

    // A guest: the shelf, the pages before signing in, and the exchange's two boards.
    runSql(`UPDATE "User" SET "exchangeWants" = 'Old cartoons' WHERE username = $1`, [
      owner.username,
    ]);
    const guest = await (await browser.newContext({ baseURL, locale })).newPage();
    guest.setDefaultTimeout(30_000);
    await check(guest, 'shelf for a visitor', shelf, WIDTHS);
    await check(guest, 'video for a visitor', `/${code}`);
    await check(guest, 'sign in', '/login');
    await check(guest, 'sign up', '/register');
    const trade = `/x/v/${code}?h=${owner.username}`;
    await check(guest, 'offer to a guest', trade, WIDTHS);
    await guest.goto(trade);
    await guest.getByTestId('trade-file').setInputFiles(SAMPLE_VIDEO);
    await expect(guest).toHaveURL(/\/deal\/[0-9a-f-]{36}$/);
    await expect(guest.getByTestId('trade-board').getByTestId('trade-get')).toBeVisible();
    // The board's tiles get lower with the room across: 900 is a width where they do.
    await check(guest, 'a deal under way', guest.url(), [...WIDTHS, 900]);

    expect(found, 'window heights at which a page never settles').toEqual({});
    expect(strays, 'scrollbars with next to nothing to scroll').toEqual({});
  } finally {
    await browser.close();
  }
});

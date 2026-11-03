import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, runSql } from './account';
import { uploadSampleAndWaitReady } from './videos';

const owner = newUser('open');
const card = (page: Page) => page.locator('[data-video-id]').first();

/** Notes in `window.seen` anything that ever came on the page, however briefly. */
const watchFor = (selectors: Record<string, string>) => {
  (window as unknown as { seen: Record<string, boolean> }).seen = {};
  new MutationObserver(() => {
    const seen = (window as unknown as { seen: Record<string, boolean> }).seen;
    for (const [name, selector] of Object.entries(selectors))
      if (document.querySelector(selector)) seen[name] = true;
  }).observe(document, { childList: true, subtree: true });
};

test.describe('opening a video', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await registerAndVerify(page, owner);
    await uploadSampleAndWaitReady(page);
    await page.close();
  });

  test('one the viewer cannot play is its preview from the first paint, never a player', async ({
    browser,
  }) => {
    const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await guest.addInitScript(watchFor, {
      player: '[data-testid="player"]',
      spinner: 'app-video-page app-spinner',
    });
    await guest.goto(`/@${owner.username}`);
    await expect(card(guest)).toBeVisible({ timeout: 20_000 });
    // The page's own answer is late: all the same, the preview is there at once.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await guest.route(/\/api\/.*\/(videos|collection)\/.*/, async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    await card(guest).click();
    await expect(guest.getByTestId('private-preview')).toBeVisible();
    await expect(guest.getByTestId('contact-sheet')).toBeVisible();
    await guest.waitForTimeout(700);
    release();
    await expect(guest.getByText('Private video')).toBeVisible({ timeout: 15_000 });
    expect(await guest.evaluate(() => (window as unknown as { seen: object }).seen)).toEqual({});
  });

  test('one the viewer can play starts with no Play button or black in between', async ({
    browser,
  }) => {
    runSql(
      `UPDATE "Video" SET visibility = 'PUBLIC' WHERE "authorId" = (SELECT id FROM "User" WHERE username = $1)`,
      [owner.username],
    );
    const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await guest.addInitScript(watchFor, {
      playButton: '[data-testid="player"] button.inset-0',
    });
    await guest.goto(`/@${owner.username}`);
    await expect(card(guest)).toBeVisible({ timeout: 20_000 });
    await card(guest).click();
    const player = guest.getByTestId('player');
    await expect(player).toBeVisible({ timeout: 15_000 });
    // The tile's picture lies under the video from the start.
    await expect(player.locator('img').first()).toBeAttached();
    await expect
      .poll(() => player.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    expect(await guest.evaluate(() => (window as unknown as { seen: object }).seen)).toEqual({});
  });

  test('by a direct link, what waits looks like no player either', async ({ browser }) => {
    const [{ code }] = runSql(
      `SELECT v.code FROM "Video" v JOIN "User" u ON u.id = v."authorId" WHERE u.username = $1`,
      [owner.username],
    ) as { code: string }[];
    const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await guest.route(/\/api\/.*\/(videos|collection)\/.*/, async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    await guest.goto(`/${code}`);
    await expect(guest.getByTestId('video-ghost')).toBeVisible({ timeout: 15_000 });
    await expect(guest.locator('app-spinner')).toHaveCount(0);
    release();
    await expect(guest.getByTestId('video-ghost')).toHaveCount(0, { timeout: 15_000 });
  });
});

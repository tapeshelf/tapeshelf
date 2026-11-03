import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, setTier } from './account';
import { browserWithScrollbars } from './scrollbar';
import { uploadSampleAndWaitReady } from './videos';

const author = newUser('fit');

/** How many times the picture changes its size within a moment, untouched. */
function resizesOver(page: Page, ms: number): Promise<number> {
  return page.getByTestId('editor-stage').evaluate(
    (stage, wait) =>
      new Promise<number>((resolve) => {
        let seen = -1; // An observer reports once at the start, whatever happens.
        const observer = new ResizeObserver(() => (seen += 1));
        observer.observe(stage);
        setTimeout(() => {
          observer.disconnect();
          resolve(Math.max(0, seen));
        }, wait);
      }),
    ms,
  );
}

const pageScrolls = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);

test('the editor holds still at any height of the window and keeps the timeline on screen', async ({
  playwright,
}, info) => {
  test.setTimeout(240_000);
  const { baseURL, locale } = info.project.use;
  const browser = await browserWithScrollbars(playwright, info);
  const context = await browser.newContext({
    baseURL,
    locale,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  try {
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
    await page.getByTestId('editor-tab-blur').click();
    await page.getByTestId('add-blur').click();
    await page.getByTestId('add-blur').click();
    const shots = process.env['VS_EDITOR_SHOTS'];

    // Where the page stops fitting the window: the scrollbar comes around there.
    let fits = 1600;
    let overflows = 500;
    while (fits - overflows > 2) {
      const middle = Math.round((fits + overflows) / 2);
      await page.setViewportSize({ width: 1280, height: middle });
      await page.waitForTimeout(150);
      if (await pageScrolls(page)) overflows = middle;
      else fits = middle;
    }
    const shaking: number[] = [];
    for (let height = fits + 16; height >= fits - 16; height -= 1) {
      await page.setViewportSize({ width: 1280, height });
      await page.waitForTimeout(120);
      if ((await resizesOver(page, 250)) > 2) shaking.push(height);
    }
    expect(shaking, 'window heights at which the picture never settles').toEqual([]);

    // A full screen: the picture takes what is left, the whole timeline stays in the window.
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1920, height: 950 },
      { width: 2560, height: 1300 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(200);
      if (shots) await page.screenshot({ path: `${shots}/editor-fit-${size.height}.png` });
      const card = (await page.getByTestId('editor-card').boundingBox())!;
      expect(card.y + card.height, `the timeline at ${size.height}`).toBeLessThanOrEqual(
        size.height,
      );
      // Not small either.
      const box = (await stage.boundingBox())!;
      expect(box.height, `the picture at ${size.height}`).toBeGreaterThanOrEqual(
        size.height * 0.45,
      );
      expect(await resizesOver(page, 250)).toBeLessThanOrEqual(2);
    }

    // A low window: the picture stops shrinking, the page scrolls instead.
    await page.setViewportSize({ width: 1920, height: 640 });
    await page.waitForTimeout(200);
    expect((await stage.boundingBox())!.height).toBeGreaterThanOrEqual(320);

    // Not brought closer, the timeline has nothing to scroll sideways.
    const scroller = page.getByTestId('timeline-scroller');
    expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    await page.getByTestId('trim-end').hover();
    expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
  } finally {
    await browser.close();
  }
});

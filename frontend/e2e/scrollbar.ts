import type { Browser, Page, PlaywrightWorkerArgs, TestInfo } from '@playwright/test';

/**
 * Chromium with scrollbars that take room, as in a real browser: Playwright hides them by default,
 * and a page that gets narrower as they come is what these checks are about.
 */
export function browserWithScrollbars(
  playwright: PlaywrightWorkerArgs['playwright'],
  info: TestInfo,
): Promise<Browser> {
  return playwright.chromium.launch({
    ...info.project.use.launchOptions,
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
}

/** How many times the scrollbars come or go by themselves within `ms`, nothing being touched. */
export function scrollbarFlips(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (wait) =>
      new Promise<number>((resolve) => {
        const boxes = [
          document.documentElement,
          ...[...document.querySelectorAll<HTMLElement>('body *')].filter((el) =>
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
          ),
        ];
        const widths = boxes.map((el) => el.clientWidth);
        const start = performance.now();
        let flips = 0;
        const look = () => {
          boxes.forEach((el, i) => {
            if (el.clientWidth === widths[i]) return;
            widths[i] = el.clientWidth;
            flips += 1;
          });
          if (performance.now() - start < wait) requestAnimationFrame(look);
          else resolve(flips);
        };
        requestAnimationFrame(look);
      }),
    ms,
  );
}

/** The box that scrolls this page: an open side panel's (a closed one is there, of no size), or the page. */
function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.vt-panel .overflow-y-auto');
    const box = panel?.clientHeight ? panel : document.documentElement;
    return box.scrollHeight > box.clientHeight;
  });
}

/**
 * The window heights at `width` around where this page stops fitting, at which its scrollbar never
 * settles. Empty when it does settle, or when the page is taller than any window tried.
 */
export async function shakingHeights(page: Page, width: number): Promise<number[]> {
  const shaking = new Set<number>();
  const at = async (height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(60);
    if ((await scrollbarFlips(page, 180)) > 2) shaking.add(height);
  };
  let fits = 3000;
  let overflowing = 300;
  await at(fits);
  if (await overflows(page)) return [];
  while (fits - overflowing > 8) {
    const middle = Math.round((fits + overflowing) / 2);
    await at(middle);
    if (await overflows(page)) overflowing = middle;
    else fits = middle;
  }
  for (let height = fits + 8; height >= overflowing - 8; height -= 1) await at(height);
  return [...shaking];
}

/**
 * Scrollbars that have next to nothing to scroll, and a page wider than its window: something
 * sticking out of its box by a few pixels. Each scrollbar takes room from what it scrolls.
 */
export function strayScrollbars(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const stray: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) stray.push('the page, sideways');
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(el);
      if (style.scrollbarWidth === 'none' || !el.clientHeight) continue;
      const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
      const x = scrolls(style.overflowX) ? el.scrollWidth - el.clientWidth : 0;
      const y = scrolls(style.overflowY) ? el.scrollHeight - el.clientHeight : 0;
      if ((x > 0 && x <= 24) || (y > 0 && y <= 24)) {
        const name = el.getAttribute('data-testid') ?? el.className.toString().slice(0, 60);
        stray.push(`${el.tagName.toLowerCase()} "${name}": ${x} across, ${y} down`);
      }
    }
    return stray;
  });
}

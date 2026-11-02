import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, seedVideos } from './account';
import { uploadSampleAndWaitReady } from './videos';

/**
 * Layout-shift check, not a test: run alone with VS_PERF_DIR set. A guest opens a shelf on a slow
 * network; every layout shift is recorded with the elements that moved and where from.
 */
test('layout shifts of a shelf opened by a guest', async ({ page, browser }) => {
  const dir = process.env['VS_PERF_DIR'];
  test.skip(!dir, 'VS_PERF_DIR not set');
  test.setTimeout(300_000);
  const owner = newUser('cls');
  await registerAndVerify(page, owner);
  await uploadSampleAndWaitReady(page);
  seedVideos(owner.username, 'Public clip', 24, 'PUBLIC');
  seedVideos(owner.username, 'Private clip', 6, 'PRIVATE');

  const out: Record<string, unknown> = {};
  for (const [name, viewport] of [
    ['desktop', { width: 1350, height: 940 }],
    ['mobile', { width: 412, height: 823 }],
  ] as const) {
    const ctx = await browser.newContext({ locale: 'en-US', viewport });
    const guest = await ctx.newPage();
    const cdp = await ctx.newCDPSession(guest);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await guest.addInitScript(() => {
      const w = window as unknown as { __shifts: unknown[] };
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          startTime: number;
          sources: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
        }[]) {
          w.__shifts.push({
            value: +e.value.toFixed(4),
            at: Math.round(e.startTime),
            input: e.hadRecentInput,
            sources: e.sources.map((s) => {
              const el = s.node as HTMLElement | undefined;
              return {
                node: el
                  ? `${el.nodeName?.toLowerCase()}${el.getAttribute?.('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${(el.getAttribute?.('class') ?? '').slice(0, 60)}`
                  : null,
                from: [
                  s.previousRect.x,
                  s.previousRect.y,
                  s.previousRect.width,
                  s.previousRect.height,
                ].map(Math.round),
                to: [
                  s.currentRect.x,
                  s.currentRect.y,
                  s.currentRect.width,
                  s.currentRect.height,
                ].map(Math.round),
              };
            }),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await guest.goto(`/@${owner.username}`);
    await expect(guest.getByTestId('section-PUBLIC')).toBeVisible({ timeout: 60_000 });
    await guest.waitForTimeout(4000);
    out[name] = await guest.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts);
    await ctx.close();
  }
  writeFileSync(join(dir!, 'cls.json'), JSON.stringify(out, null, 2));
});

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type CDPSession, type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, seedVideos } from './account';
import { tile, uploadSampleAndWaitReady } from './videos';

/**
 * Memory check, not a test: run alone with VS_PERF_DIR set. Walks the app in-place (no reloads)
 * shelf → video (plays) → back → three panels, many times, and records the heap after a forced GC,
 * DOM nodes, listeners and live players between laps. Steady numbers = no leak per lap.
 */
const PROTOS = [
  'MediaSource',
  'HTMLVideoElement',
  'ResizeObserver',
  'IntersectionObserver',
  'MutationObserver',
  'WebSocket',
  'Worker',
] as const;

interface DomNode {
  nodeName: string;
  attributes?: string[];
  children?: DomNode[];
}

async function counts(cdp: CDPSession): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of PROTOS) {
    // Every handle goes into one object group released below: handles left in the default group
    // keep what they point at alive (and the whole page behind an observer's callback).
    const proto = await cdp.send('Runtime.evaluate', {
      expression: `${name}.prototype`,
      objectGroup: 'perf',
    });
    if (!proto.result.objectId) continue;
    const found = await cdp.send('Runtime.queryObjects', {
      prototypeObjectId: proto.result.objectId,
      objectGroup: 'perf',
    });
    const len = await cdp.send('Runtime.callFunctionOn', {
      objectId: found.objects.objectId!,
      functionDeclaration: 'function () { return this.length; }',
      returnByValue: true,
    });
    out[name] = len.result.value as number;
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'perf' });
  return out;
}

async function sample(page: Page, cdp: CDPSession, lap: number) {
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  // DOM.* is left out between laps: the DevTools DOM agent keeps every node it reported alive.
  const detached = null;
  return {
    lap,
    heapMB: +(m['JSHeapUsedSize'] / 1048576).toFixed(2),
    nodes: m['Nodes'],
    listeners: m['JSEventListeners'],
    documents: m['Documents'],
    layoutObjects: m['LayoutObjects'],
    detached,
    ...(await counts(cdp)),
    url: page.url().replace(/^https?:\/\/[^/]+/, ''),
  };
}

test('memory over laps of in-app navigation', async ({ page }) => {
  const dir = process.env['VS_PERF_DIR'];
  test.skip(!dir, 'VS_PERF_DIR not set');
  test.setTimeout(1_200_000);
  await page.setViewportSize({ width: 1600, height: 1000 }); // the header shows its sections
  const owner = newUser('perf');
  await registerAndVerify(page, owner);
  await uploadSampleAndWaitReady(page);
  seedVideos(owner.username, 'Seeded', 60, 'PUBLIC');
  await page.reload();
  await expect(page.getByTestId('profile-head')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  const parts = (process.env['VS_PERF_PARTS'] ?? 'video,panels').split(',');
  const lap = async () => {
    if (parts.includes('video')) await videoLap();
    if (parts.includes('panels')) await panelsLap();
  };
  const videoLap = async () => {
    await tile(page, /^sample/i).click();
    await expect(page.getByTestId('player')).toBeVisible();
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0.3);
    await page.goBack();
    await expect(page.getByTestId('profile-head')).toBeVisible();
  };
  const panelsLap = async () => {
    for (const nav of ['nav-exchange', 'nav-messages', 'nav-whats-new']) {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByTestId(nav).click({ timeout: 15_000 });
      await expect(page.getByTestId('panel')).toBeVisible();
      await page.getByTestId('panel-close').click();
      await expect(page.getByTestId('panel')).toBeHidden();
    }
  };

  const rows = [];
  for (let i = 0; i < 2; i++) await lap(); // warm-up: lazy chunks, caches
  rows.push(await sample(page, cdp, 0));
  const LAPS = Number(process.env['VS_PERF_LAPS'] ?? 30);
  for (let i = 1; i <= LAPS; i++) {
    await lap();
    if (i % 5 === 0) rows.push(await sample(page, cdp, i));
  }
  console.table(rows);
  writeFileSync(join(dir!, 'leak.json'), JSON.stringify(rows, null, 2));

  if (process.env['VS_PERF_SNAPSHOT']) {
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
    const chunks: string[] = [];
    cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    writeFileSync(join(dir!, 'final.heapsnapshot'), chunks.join(''));
  }

  // What the detached trees are: their roots, biggest first, with the custom elements inside.
  try {
    await cdp.send('DOM.enable');
    const res = (await cdp.send('DOM.getDetachedDomNodes' as never)) as unknown as {
      detachedNodes: { treeNode: DomNode; retainedNodeIds: number[] }[];
    };
    const tags = (n: DomNode, out: Map<string, number>) => {
      if (n.nodeName.includes('-')) out.set(n.nodeName, (out.get(n.nodeName) ?? 0) + 1);
      for (const c of n.children ?? []) tags(c, out);
      return out;
    };
    const roots = res.detachedNodes
      .map((d) => ({
        root: d.treeNode.nodeName,
        attrs: (d.treeNode.attributes ?? []).join(' ').slice(0, 160),
        retained: d.retainedNodeIds.length,
        inside: [...tags(d.treeNode, new Map())].slice(0, 12),
      }))
      .sort((a, b) => b.retained - a.retained);
    writeFileSync(join(dir!, 'detached.json'), JSON.stringify(roots, null, 2));
  } catch (e) {
    writeFileSync(join(dir!, 'detached.json'), String(e));
  }
});

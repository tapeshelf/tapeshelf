import { statSync } from 'node:fs';

import { type Browser, type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { newUser, registerAndVerify, setTier } from './account';
import { SAMPLE_VIDEO } from './global-setup';
import { codeOf, setVisibility, uploadSampleAndWaitReady } from './videos';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US', acceptDownloads: true })).newPage();
}

/** Design-review screenshots, only with VS_SHOTS_DIR. */
async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env['VS_SHOTS_DIR'];
  if (!dir) return;
  // Let the page transition finish (the leader's own sweep never does).
  await p.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/**
 * a Free viewer goes through the wait page — a five-second
 * countdown, the limits, what is left — and gets the original byte for byte; again within the hour
 * it does not count; Pro downloads at once.
 */
test('Free downloads through the wait page and spends one of ten; Pro downloads at once', async ({
  browser,
}) => {
  const author = newUser('dlau');
  const viewer = newUser('dlfr');
  const proUser = newUser('dlpr');
  const page = await freshPage(browser);
  await registerAndVerify(page, author);
  const videoId = await uploadSampleAndWaitReady(page);
  await setVisibility(page, /^sample/i, 'Public');
  const code = await codeOf(page, videoId);
  // The original as stored: cleaned of its metadata on upload, so not the sample's size.
  const stored = await page.request.get(`/api/videos/${videoId}`);
  const size = Number(((await stored.json()) as { sizeBytes: number }).sizeBytes);
  expect(size).toBeGreaterThan(0);
  expect(size).not.toBe(statSync(SAMPLE_VIDEO).size);

  const free = await freshPage(browser);
  await registerAndVerify(free, viewer);
  await free.goto(`/${code}`);
  await expect(free.getByTestId('downloads-left')).toHaveText('10 of 10 downloads left this month');
  await free.getByTestId('video-download').click();
  await expect(free).toHaveURL(`/download/${code}`);
  await expect(free).toHaveTitle('Download · tapeshelf');
  await expect(free.getByTestId('download-starts')).toContainText('Your download starts in');
  await expect(free.getByTestId('download-limits')).toContainText(
    'On the free plan, speed is limited to 1 MB/s; 10 of 10 downloads left until',
  );
  await expect(free.getByTestId('download-pro')).toHaveText('More about Pro');
  await shot(free, 'download-01-countdown');
  await audit(free, 'download wait page');

  const first = await free.waitForEvent('download', { timeout: 20_000 });
  expect(first.suggestedFilename()).toBe('sample.mp4');
  expect(statSync((await first.path())!).size).toBe(size);
  await expect(free.getByTestId('download-started')).toBeVisible();
  await expect(free.getByTestId('download-limits')).toContainText('9 of 10 downloads left');
  await shot(free, 'download-02-started');

  // Again within the hour: the same wait, but it does not count.
  await free.getByTestId('download-again').click();
  await expect(free.getByText('this time does not count')).toBeVisible();
  const second = await free.waitForEvent('download', { timeout: 20_000 });
  expect(statSync((await second.path())!).size).toBe(size);
  await free.goto(`/${code}`);
  await expect(free.getByTestId('downloads-left')).toHaveText('9 of 10 downloads left this month');
  await free.goto('/settings/plan');
  await expect(free.getByTestId('plan-downloads')).toHaveText('1 of 10 this month');
  await expect(free.getByTestId('plan-speed')).toHaveText('up to 1 MB/s');

  // Pro: no wait page, no count.
  const pro = await freshPage(browser);
  await registerAndVerify(pro, proUser);
  setTier(proUser.username, 'PREMIUM');
  await pro.goto(`/${code}`);
  await expect(pro.getByTestId('downloads-left')).toHaveCount(0);
  const [direct] = await Promise.all([
    pro.waitForEvent('download', { timeout: 20_000 }),
    pro.getByTestId('video-download').click(),
  ]);
  expect(statSync((await direct.path())!).size).toBe(size);
  await expect(pro).toHaveURL(`/${code}`);
});

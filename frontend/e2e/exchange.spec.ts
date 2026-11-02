import { type Browser, type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { uploadAndWaitReady } from './videos';

const holder = newUser('hold');
const requester = newUser('ask');

/** The bottom-right upload panel would cover the thread's buttons. */
async function closeUploads(p: Page): Promise<void> {
  await p.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();
  await expect(p.getByTestId('upload-panel')).toHaveCount(0);
}

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/** Request → counter → counter → accept → the new holder watches the video. */
test('a private video is requested, negotiated over two rounds and exchanged', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  // Holder uploads a private clip.
  await registerAndVerify(page, holder);
  const videoId = await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
  await closeUploads(page);

  // Requester uploads something to trade and asks for the holder's clip.
  const asker = await freshPage(browser);
  await registerAndVerify(asker, requester);
  await uploadAndWaitReady(asker, SAMPLE_VIDEO_2, /^second/i);
  await closeUploads(asker);
  await asker.goto(`/@${holder.username}/v/${videoId}`);
  await expect(asker.getByTestId('private-preview')).toBeVisible();
  await asker.getByLabel('Message to the owner (optional)').fill('Could you share this one?');
  await asker.getByTestId('request-button').click();
  const hint = asker.getByTestId('hint-dialog');
  await expect(hint).toContainText('This video is private.');
  await hint.getByRole('button', { name: 'Got it, send request' }).click();
  await expect(asker.getByText('Request sent.')).toBeVisible();
  await expect(asker.getByTestId('requested-badge')).toBeVisible();

  // Holder sees the request and proposes an exchange: sample for second. A toast tells them at
  // once, with the requester's message.
  const toast = page.getByTestId('toast-with-action');
  await expect(toast).toContainText('Could you share this one?', { timeout: 15_000 });
  await expect(toast.getByRole('button', { name: 'Open' })).toBeVisible();
  // The bell counts it; the account capsule does not repeat it.
  await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('account-badge')).toHaveCount(0);
  // The bell keeps a line about requests awaiting a decision.
  await page.getByTestId('notification-bell').click();
  await expect(page.getByTestId('awaiting-requests')).toHaveText(/1 request awaits your decision/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByTestId('exchange-badge')).toHaveText('1');
  await page.getByTestId('nav-exchange').click();
  await expect(page).toHaveURL(/panel:exchange/);
  // The row says the deal so far and the last words.
  await expect(page.getByTestId('request-deal')).toHaveText(
    'You give 1 ↔ you get 0 · “Could you share this one?”',
  );
  await page
    .getByTestId('request-list')
    .getByRole('link', { name: /Request from/ })
    .click();
  const thread = page.getByTestId('request-thread');
  await expect(thread).toContainText('Could you share this one?');
  await expect(page.getByTestId('request-status')).toHaveText('your move');
  await page.getByTestId('counter').click();
  // Their tile shows its frames before picking.
  await page.getByRole('button', { name: 'Frames of “Second”' }).click();
  // Full screen, as every frame preview.
  await expect(page.getByTestId('lightbox-image')).toBeVisible();
  await page.getByTestId('lightbox-close').click();
  await expect(page.getByTestId('lightbox-image')).toHaveCount(0);
  await page.getByRole('button', { name: 'Second', exact: true }).click();
  await expect(page.getByTestId('offer-summary')).toHaveText('1 ↔ 1');
  if (process.env['VS_SHOT_BUILDER'])
    await page.screenshot({ path: process.env['VS_SHOT_BUILDER'], fullPage: true });
  await page.getByTestId('send-offer').click();
  await expect(page.getByText('Offer sent.')).toBeVisible();
  await expect(page.getByTestId('offer-1')).toBeVisible();
  await expect(page.getByTestId('request-status')).toHaveText('waiting for them');

  // The requester's bell says what is offered for what.
  await asker.getByTestId('notification-bell').click();
  await expect(asker.getByTestId('notification-menu')).toContainText(
    `offers “Sample” for your “Second”`,
  );
  await asker.keyboard.press('Escape');

  // Requester counters back with the same deal (round 2), then the holder accepts.
  await asker.goto('/exchange?tab=outgoing');
  await asker
    .getByTestId('request-list')
    .getByRole('link', { name: /Request to/ })
    .click();
  await expect(asker.getByTestId('request-status')).toHaveText('your move');
  await expect(asker.getByTestId('offer-1')).toContainText('You give');
  await asker.getByTestId('counter').click();
  await expect(asker.getByTestId('offer-summary')).toHaveText('1 ↔ 1');
  await asker.getByTestId('send-offer').click();
  await expect(asker.getByTestId('offer-2')).toBeVisible();

  await expect(page.getByTestId('request-status')).toHaveText('your move', { timeout: 15_000 });
  // Answering a counter-offer, the holder may still just share for free.
  await expect(page.getByTestId('share')).toBeVisible();
  await page.getByTestId('accept').click();
  // The two covers swap places for a moment, then the scene is gone.
  await expect(page.getByTestId('exchange-scene')).toBeVisible();
  await expect(page.getByTestId('exchange-scene')).toHaveCount(0);
  const done = page.getByTestId('toast-with-action').filter({
    hasText: 'Exchange completed. The videos are in your collection.',
  });
  await expect(done).toBeVisible();
  await expect(page.getByTestId('request-status')).toHaveText('completed');
  if (process.env['VS_SHOT_THREAD'])
    await page.screenshot({ path: process.env['VS_SHOT_THREAD'], fullPage: true });

  // Both sides now hold the other's video. "See" in the toast leads to what came...
  await done.getByRole('button', { name: 'See' }).click();
  await expect(page).toHaveURL(new RegExp(`/@${holder.username}\\?folder=others`));
  await expect(page.getByRole('button', { name: /^second/i })).toBeVisible();
  // What came is quietly "new" until opened.
  await expect(page.getByTestId('new-badge')).toBeVisible();
  // ...and so does the requester's notification, from any page.
  await asker.goto(`/@${holder.username}`);
  await asker.getByTestId('notification-bell').click();
  await asker
    .getByTestId('notification-menu')
    .getByText(/Exchange with .* completed/)
    .click();
  await expect(asker).toHaveURL(new RegExp(`/@${requester.username}\\?folder=others`));
  await expect(asker.getByRole('button', { name: /^sample/i })).toBeVisible();
  await expect(asker.getByTestId('new-badge')).toBeVisible();
  await asker.getByRole('button', { name: /^sample/i }).click();
  await expect(asker.getByTestId('player')).toBeVisible();
  await asker.goBack();
  await expect(asker.getByRole('button', { name: /^sample/i })).toBeVisible();
  await expect(asker.getByTestId('new-badge')).toHaveCount(0);
  // The requester names it their own way on their shelf: the tile and the page opened there
  // say so, the author's name stays in sight; the author's own shelf keeps the author's.
  await asker.getByRole('button', { name: /^sample/i }).click({ button: 'right' });
  await asker.getByTestId('action-own-name').click();
  const dialog = asker.getByTestId('holding-text-dialog');
  await dialog.getByTestId('own-title').fill('Test pattern from the holder');
  await dialog.getByTestId('own-save').click();
  await expect(dialog).toHaveCount(0);
  const renamed = asker.getByRole('button', { name: /^Test pattern from the holder/ });
  await expect(renamed).toBeVisible();
  await renamed.click();
  await expect(asker.getByRole('heading', { name: 'Test pattern from the holder' })).toBeVisible();
  await expect(asker.getByTestId('original-title')).toContainText('Original: “Sample”');
  // The requester can watch the once-private clip.
  await asker.goto(`/@${holder.username}/v/${videoId}`);
  await expect(asker.getByTestId('player')).toBeVisible();
  await expect(asker.getByRole('heading', { name: 'Sample' })).toBeVisible();
  await asker.context().close();
});

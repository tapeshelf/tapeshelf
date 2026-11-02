import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, registerViaApi, runSql } from './account';
import { SAMPLE_VIDEO } from './global-setup';
import { uploadSampleAndWaitReady } from './videos';

/**
 * An exchange with a guest: from a private video's page straight to the
 * exchange — the videos big on the left, full screen on a click; the deal starts with the guest's
 * first file and the page turns into the exchange (both sides small, side by side); it is sent once
 * everything is processed, the message with it; the owner sees the guest's video in full in the
 * thread (no page, no 404) and accepts; the guest watches what they received, a week on the clock.
 */
test('a guest offers a video for a private one; the owner accepts; the guest watches', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = newUser('ownr');
  await registerAndVerify(page, owner);
  await uploadSampleAndWaitReady(page);
  runSql(`UPDATE "User" SET "exchangeWants" = 'Old cartoons' WHERE username = $1`, [
    owner.username,
  ]);
  const [{ code }] = runSql(
    `SELECT v.code FROM "Video" v JOIN "User" u ON u.id = v."authorId"
     WHERE u.username = $1 AND v.title ILIKE 'sample%'`,
    [owner.username],
  ) as { code: string }[];

  const guest: Page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/${code}`);
  await expect(guest.getByTestId('exchange-prefs')).toContainText('Old cartoons');
  await guest.getByTestId('guest-exchange').click();
  await expect(guest).toHaveURL(new RegExp(`/x/v/${code}\\?h=${owner.username}$`));
  await expect(guest.getByTestId('trade-state')).toHaveText('Offer your videos');
  await expect(guest.getByTestId('trade-panel').getByTestId('exchange-prefs')).toContainText(
    'Old cartoons',
  );
  // The preview, full screen.
  await guest.getByTestId('trade-get').getByTestId('deal-preview').click();
  await expect(guest.getByTestId('lightbox-image')).toBeVisible();
  await guest.getByTestId('lightbox-close').click();
  await expect(guest.getByTestId('lightbox-image')).toHaveCount(0);

  // The first file starts the deal: the address becomes the deal's.
  await guest.getByTestId('trade-file').setInputFiles(SAMPLE_VIDEO);
  await expect(guest).toHaveURL(/\/deal\/[0-9a-f-]{36}$/);
  const dealId = guest.url().split('/').pop()!;
  await expect(guest.getByTestId('trade-upload')).toHaveCount(1);
  // Under way, the exchange is the main thing: both sides side by side, small.
  await expect(guest.getByTestId('trade-board').getByTestId('trade-get')).toBeVisible();
  await expect(guest.getByTestId('trade-give').getByTestId('deal-video')).toHaveCount(1);
  await guest.getByTestId('trade-message').fill('Swap for my clip?');
  // Sent only when everything is ready to change hands.
  await expect(guest.getByTestId('trade-send')).toBeDisabled();
  await expect(guest.getByTestId('trade-send-hint')).toBeVisible();
  await expect(guest.getByTestId('trade-send')).toBeEnabled({ timeout: 120_000 });
  await expect(guest.getByTestId('trade-send-hint')).toHaveCount(0);
  await guest.getByTestId('trade-send').click();
  // It reaches the owner at once, three days on the clock.
  await expect(guest.getByTestId('trade-state')).toHaveText(`Waiting for ${owner.displayName}`);
  await expect(guest.getByTestId('trade-uploads')).toHaveCount(0);
  await expect(guest.getByTestId('trade-timer')).toContainText('2 days');

  await page.goto(`/exchange/${dealId}`);
  await expect(page.getByRole('heading', { name: /Guest/ })).toBeVisible();
  await expect(page.getByText('Swap for my clip?')).toBeVisible();
  await expect(page.getByTestId('request-expires')).toBeVisible();
  // The guest's video has no page: its preview opens in full instead of a 404.
  const theirs = page.getByTestId('offer-0').getByTestId('offer-video');
  await expect(theirs).toHaveCount(2);
  await theirs.first().getByRole('button').click();
  await expect(page.getByTestId('lightbox-image')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('accept').click();
  await expect(page.getByTestId('request-status')).toHaveText('completed');

  await guest.reload();
  await expect(guest.getByTestId('trade-state')).toHaveText('The exchange is done');
  await expect(guest.getByTestId('trade-timer')).toContainText('6 days');
  await expect(guest.getByTestId('trade-received')).toHaveCount(1);
  await expect(guest.getByTestId('trade-received').locator('video')).toBeAttached();
});

/**
 * A guest who sent their offer by an exchange link signs in: the deal is the account's
 * request now, and the old addresses — the deal's page, the link — lead to it, not to a new offer.
 */
test('a guest signs in after sending; the link and the deal page lead to the request', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = newUser('lnko');
  await registerAndVerify(page, owner);
  await uploadSampleAndWaitReady(page);
  const [{ id }] = runSql(
    `SELECT v.id FROM "Video" v JOIN "User" u ON u.id = v."authorId" WHERE u.username = $1`,
    [owner.username],
  ) as { id: string }[];
  const code = await page.evaluate(async (videoId) => {
    const r = await fetch('/api/me/exchange-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ videoIds: [videoId] }),
    });
    return ((await r.json()) as { code: string }).code;
  }, id);
  const person = newUser('gsti');
  await (await registerViaApi(browser, person)).close();

  const guest: Page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/x/${code}`);
  await guest.getByTestId('trade-file').setInputFiles(SAMPLE_VIDEO);
  await expect(guest).toHaveURL(/\/deal\/[0-9a-f-]{36}$/);
  const dealId = guest.url().split('/').pop()!;
  await expect(guest.getByTestId('trade-send')).toBeEnabled({ timeout: 120_000 });
  await guest.getByTestId('trade-send').click();
  await expect(guest.getByTestId('trade-state')).toHaveText(`Waiting for ${owner.displayName}`);

  // Signing in from the deal's page comes back to it: the account's request now.
  await guest.getByTestId('trade-panel').getByRole('link', { name: 'Log in' }).click();
  await guest.getByLabel('Email').fill(person.email);
  await guest.getByLabel('Password').fill(person.password);
  await guest.getByRole('button', { name: 'Log in' }).click();
  const thread = new RegExp(`exchange/${dealId}`);
  await expect(guest).toHaveURL(thread);
  await expect(guest.getByTestId('offer-0').getByTestId('offer-video')).toHaveCount(2);
  // The old addresses lead there too.
  await guest.goto(`/x/${code}`);
  await expect(guest).toHaveURL(thread);
  await guest.goto(`/deal/${dealId}`);
  await expect(guest).toHaveURL(thread);
});

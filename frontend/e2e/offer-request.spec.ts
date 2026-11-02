import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, registerViaApi, seedVideos } from './account';

const holder = newUser('ofh');
const requester = newUser('ofr');

/** A request may offer something in return from the start. */
test('a request offers a video in return; the holder accepts the exchange at once', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await registerAndVerify(page, holder);
  seedVideos(holder.username, 'Wanted', 1, 'PRIVATE');
  const context = await registerViaApi(browser, requester);
  seedVideos(requester.username, 'Mine', 2, 'PRIVATE');
  const asker = await context.newPage();

  await asker.goto(`/@${holder.username}`);
  await asker
    .getByTestId('section-PRIVATE')
    .getByRole('link', { name: /Wanted 01/ })
    .click();
  await asker.getByTestId('offer-in-return').click();
  const pick = asker.getByTestId('offer-pick');
  await pick.getByRole('button', { name: 'Mine 01' }).click();
  await expect(pick.getByTestId('offer-pick-count')).toHaveText('1 picked');
  await pick.getByTestId('offer-pick-done').click();
  await expect(asker.getByTestId('offer-in-return')).toContainText('You offer 1 video in return');
  await asker.getByTestId('request-button').click();
  await asker
    .getByTestId('hint-dialog')
    .getByRole('button', { name: 'Got it, send request' })
    .click();
  await expect(asker.getByText('Request sent.')).toBeVisible();

  // The holder sees both sides and can take the exchange as it is.
  await page.goto('/exchange?tab=incoming');
  await expect(page.getByTestId('request-deal')).toContainText('You give 1 ↔ you get 1');
  await page
    .getByTestId('request-list')
    .getByRole('link', { name: /Request from/ })
    .click();
  await expect(page.getByTestId('share')).toBeVisible();
  await expect(page.getByTestId('counter')).toBeVisible();
  await expect(page.getByTestId('accept')).toHaveText(/Accept the offer/);
  await page.getByTestId('accept').click();
  await expect(
    page.getByText('Exchange completed. The videos are in your collection.'),
  ).toBeVisible();
  await expect(page.getByTestId('request-status')).toHaveText('completed');
  await page.goto(`/@${holder.username}?folder=others`);
  await expect(page.getByRole('button', { name: /^Mine 01/ })).toBeVisible();
  await context.close();
});

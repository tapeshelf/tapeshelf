import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, seedVideos } from './account';

const owner = newUser('find');

/** Search by title within one shelf. */
test('the owner and a visitor search one shelf by title; back from a video the search is still there', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await registerAndVerify(page, owner);
  seedVideos(owner.username, 'Lake trip', 3, 'PUBLIC');
  seedVideos(owner.username, 'Mountain', 9, 'PRIVATE');

  await page.goto(`/@${owner.username}`);
  const tiles = page.locator('[data-video-id]');
  await expect(tiles).toHaveCount(12);
  const search = page.getByTestId('shelf-search');
  await search.fill('LAKE');
  await expect(page).toHaveURL(/[?&]q=LAKE/);
  await expect(tiles).toHaveCount(3);
  await search.fill('nothing like it');
  await expect(page.getByText('Nothing on this shelf is called “nothing like it”.')).toBeVisible();
  await search.press('Escape');
  await expect(tiles).toHaveCount(12);
  await expect(page).not.toHaveURL(/[?&]q=/);

  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  try {
    await guest.goto(`/@${owner.username}`);
    await guest.getByTestId('shelf-search').fill('mountain 0');
    await expect(guest.getByTestId('section-PUBLIC')).toHaveCount(0);
    const priv = guest.getByTestId('section-PRIVATE');
    await expect(priv.locator('h2 sup')).toHaveText('9');
    await priv
      .getByRole('link', { name: /Mountain 02/ })
      .first()
      .click();
    await expect(guest.getByRole('heading', { name: /Mountain 02/ })).toBeVisible();
    await guest.goBack();
    await expect(guest.getByTestId('shelf-search')).toHaveValue('mountain 0');
    await expect(priv.locator('h2 sup')).toHaveText('9');
    await expect(guest.getByTestId('section-PUBLIC')).toHaveCount(0);
  } finally {
    await guest.context().close();
  }
});

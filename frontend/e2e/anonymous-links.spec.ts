import { type Page, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify, runSql, seedVideos, setTier } from './account';

const owner = newUser('anonown');

/** Everything a page says and links to: the nickname must be in none of it. */
const pageText = (page: Page) =>
  page.evaluate(
    () =>
      document.body.innerText +
      [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).join(' ') +
      document.title,
  );

/**
 * Anonymous links: made in "My links" (Pro), opened by a guest who sees the shelf
 * and its videos without ever meeting the owner's nickname.
 */
test.describe.serial('anonymous links', () => {
  let url = '';

  test('Free sees it is Pro’s; Pro makes one, named because the name is the nickname', async ({
    page,
  }) => {
    await registerAndVerify(page, owner);
    seedVideos(owner.username, 'Night', 2, 'PRIVATE');
    seedVideos(owner.username, 'Day', 1, 'PUBLIC');
    await page.goto(`/@${owner.username}(panel:links)`);
    const section = page.getByTestId('anonymous-links');
    await expect(section.getByTestId('anonymous-link-pro')).toContainText('Pro');

    setTier(owner.username, 'PREMIUM');
    // A display name left as the nickname, as sign-up makes it when none is given.
    runSql(`UPDATE "User" SET "displayName" = username WHERE username = $1`, [owner.username]);
    await page.reload();
    const form = section.getByTestId('anonymous-link-form');
    // The display name is the nickname (as after sign-up): the link needs a name of its own.
    await form.getByTestId('anonymous-link-note').fill('for Bob');
    await expect(form.getByTestId('anonymous-link-create')).toBeDisabled();
    await form.getByTestId('anonymous-link-name').fill('Moth');
    await form.getByTestId('anonymous-link-create').click();
    const row = section.getByTestId('my-anonymous-link');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('for Bob');
    await expect(row).toContainText('Moth');
    url = (await row.locator('a[target=_blank]').getAttribute('href')) ?? '';
    expect(url).toMatch(/\/p\/[2-9a-hjkmnp-z]{10}$/);
  });

  test('a guest sees the shelf and its videos under the link’s name, never the nickname', async ({
    page,
  }) => {
    await page.goto(url);
    await expect(page.getByTestId('profile-head')).toContainText('Moth');
    // A visitor's tiles are links.
    const night = page.getByRole('link', { name: /^night 01/i });
    await expect(night).toBeVisible();
    await expect(page.getByTestId('profile-counts')).not.toContainText(/friends/i);
    expect((await pageText(page)).toLowerCase()).not.toContain(owner.username);

    await night.click();
    await expect(page.getByTestId('video-author')).toContainText('Moth');
    expect(new URL(page.url()).pathname).toMatch(/^\/[2-9a-hjkmnp-z]{7}$/);
    expect((await pageText(page)).toLowerCase()).not.toContain(owner.username);

    // Back leads to the shelf seen through the link.
    await page.getByRole('button', { name: /back to the shelf/i }).click();
    await expect(page).toHaveURL(url);
  });

  test('deleted, the link no longer opens', async ({ page }) => {
    await login(page, owner);
    await page.goto(`/@${owner.username}(panel:links)`);
    await page.getByTestId('my-anonymous-link-delete').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('my-anonymous-link')).toHaveCount(0);
    await page.goto(url);
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByTestId('profile-head')).toHaveCount(0);
  });
});

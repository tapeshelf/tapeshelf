import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { SAMPLE_IMAGE, SAMPLE_VIDEO } from './global-setup';
import { tile, uploadAndWaitReady } from './videos';

const user = newUser('look');

/** Settings → My page: avatar, cover colour and picture, layout seen by visitors. */
test('uploads an avatar and a cover, switches the page to a list; visitors see it that way', async ({
  page,
  browser,
}) => {
  await registerAndVerify(page, user);
  await uploadAndWaitReady(page, SAMPLE_VIDEO, /^sample/i);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'My page' }).click();
  await expect(page.getByRole('heading', { name: 'Avatar' })).toBeVisible();

  // Without a picture the cover is drawn; its colour is the owner's choice.
  await expect(page.getByTestId('cover-generated')).toBeVisible();
  await page.getByTestId('cover-color').fill('#2c6e6a');
  await expect(page.getByText('Saved.').last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Random colour' })).toBeVisible();

  await page.getByTestId('avatar-input').setInputFiles(SAMPLE_IMAGE);
  await expect(page.getByTestId('avatar-preview')).toHaveAttribute(
    'src',
    /\/avatar-[0-9a-f]+\.jpg$/,
  );
  await page.getByTestId('cover-input').setInputFiles(SAMPLE_IMAGE);
  await expect(page.getByTestId('cover-preview')).toHaveAttribute('src', /\/cover-[0-9a-f]+\.jpg$/);
  // The cover stays off the page until the owner turns it on.
  await page.getByLabel('Show the cover on my page').check();
  await expect(page.getByText('Saved.').last()).toBeVisible();
  await page.getByLabel('Layout').click();
  // "Saved." of the previous change may still be on screen: wait for this save itself.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/page') && r.request().method() !== 'GET' && r.ok(),
  );
  await page.getByRole('option', { name: 'List' }).click();
  await saved;

  // The own page shows the images and the "view as visitor" preview uses the list layout.
  await page.goto(`/@${user.username}`);
  await expect(page.getByTestId('avatar')).toBeVisible();
  await expect(page.getByTestId('cover')).toBeVisible();
  await expect(tile(page, /^sample/i)).toBeVisible();
  await page.getByRole('button', { name: 'View as visitor' }).click();
  await expect(page.getByTestId('section-PRIVATE')).toBeVisible();
  await expect(page.getByTestId('section-PRIVATE').locator('a')).toHaveClass(/items-center/);
  await page.screenshot({
    path: process.env['VS_SHOT'] ?? 'test-results/page-settings.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Back to my view' }).click();
  await expect(tile(page, /^sample/i)).toBeVisible();
  await page.screenshot({
    path: process.env['VS_SHOT_LIB'] ?? 'test-results/library.png',
    fullPage: true,
  });

  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/@${user.username}`);
  await expect(guest.getByTestId('avatar')).toBeVisible();
  await expect(guest.getByTestId('section-PRIVATE').locator('a')).toHaveClass(/items-center/);
  await guest.context().close();
});

/** Settings open over the page: what is saved there shows on the page at once, no reload. */
test('the page under the settings takes their changes at once', async ({ page }) => {
  const owner = newUser('live');
  await registerAndVerify(page, owner);
  await page.goto(`/@${owner.username}`);
  await expect(page.getByTestId('exchange-prefs')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByLabel('Display name').fill('Live Shelf');
  await page.getByLabel('About you').fill('Tapes from the attic.');
  await page.getByTestId('prefs-wants').fill('Old cartoons');
  await page.getByTestId('prefs-avoid').fill('Trailers');
  await page.getByLabel('Show these on my shelf too').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Under the panel, without a reload: the name, the bio, both side by side.
  await expect(page.getByRole('heading', { level: 1, name: 'Live Shelf' })).toBeAttached();
  await expect(page.getByText('Tapes from the attic.')).toBeAttached();
  await expect(page.getByTestId('exchange-prefs')).toContainText('Old cartoons');
  await expect(page.getByTestId('exchange-prefs')).toContainText('Trailers');
});

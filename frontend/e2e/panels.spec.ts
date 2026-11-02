import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { uploadSampleAndWaitReady } from './videos';

/**
 * Side panels: settings, messages, requests and friends slide in over the page; the
 * page under them is never reloaded; back, Esc and the close button close them; their old page
 * addresses open the same screen as a panel over the own shelf.
 */
test('panels open over the shelf and close without touching it', async ({ page }) => {
  const user = newUser('pan');
  await registerAndVerify(page, user);
  await uploadSampleAndWaitReady(page);
  const shelf = `/@${user.username}`;
  // A marker on the shelf's DOM: it survives only if the page under the panels is never rebuilt.
  await page.locator('app-profile-page').evaluate((el) => el.setAttribute('data-kept', 'yes'));

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByTestId('panel')).toBeVisible();
  await expect(page).toHaveURL(`${shelf}(panel:settings/profile)`);
  await expect(page).toHaveTitle('Settings · tapeshelf');
  await page.getByRole('link', { name: 'My page' }).click();
  await expect(page).toHaveURL(`${shelf}(panel:settings/page)`);
  await page.goBack();
  await page.goBack();
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page).toHaveURL(shelf);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: /Messages/ }).click();
  await expect(page).toHaveURL(`${shelf}(panel:messages)`);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel')).toBeHidden();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: /Requests/ }).click();
  await expect(page).toHaveURL(`${shelf}(panel:exchange)`);
  await page.getByTestId('panel-close').click();
  await expect(page.getByTestId('panel')).toBeHidden();
  await expect(page).toHaveURL(shelf);

  await page
    .getByRole('link', { name: /Followers/i })
    .first()
    .click();
  await expect(page).toHaveURL(`${shelf}(panel:friends/${user.username})?list=followers`);
  await page.getByTestId('panel-close').click();
  await expect(page.locator('app-profile-page')).toHaveAttribute('data-kept', 'yes');

  // The old page addresses still work: the same screen, as a panel over the own shelf.
  await page.goto('/settings/plan');
  await expect(page).toHaveURL(`${shelf}(panel:settings/plan)`);
  await expect(page.getByTestId('panel')).toBeVisible();
});

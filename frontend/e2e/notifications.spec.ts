import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { codeOf, uploadSampleAndWaitReady } from './videos';

const user = newUser('ntf');

/** A processed upload becomes an in-app notification pushed live to the bell. */
test('the bell shows a processed video, opening it marks it read; settings list the channels', async ({
  page,
}) => {
  await registerAndVerify(page, user);
  await expect(page.getByTestId('notification-badge')).toHaveCount(0);
  const videoId = await uploadSampleAndWaitReady(page);

  await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 15_000 });
  await page.getByTestId('notification-bell').click();
  const menu = page.getByTestId('notification-menu');
  await expect(menu).toContainText('“Sample” is ready to watch.');
  if (process.env['VS_SHOT_BELL']) await page.screenshot({ path: process.env['VS_SHOT_BELL'] });
  await menu.getByText('“Sample” is ready to watch.').click();
  await expect(page).toHaveURL(`/${await codeOf(page, videoId)}`);
  await expect(page.getByTestId('notification-badge')).toHaveCount(0);

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.locator('app-notification-item')).toHaveCount(1);
  await expect(page.locator('app-notification-item[data-unread]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\(panel:settings\/notifications\)$/);
  const emailFailed = page.getByLabel('Email: A video of mine could not be processed');
  await expect(emailFailed).toBeChecked();
  if (process.env['VS_SHOT_PREFS']) await page.screenshot({ path: process.env['VS_SHOT_PREFS'] });
  await emailFailed.uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Email: A video of mine could not be processed')).not.toBeChecked();
});

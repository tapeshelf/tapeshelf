import { type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { newUser, registerAndVerify } from './account';
import { uploadSampleAndWaitReady } from './videos';

/** The main screens, light and dark, desktop and phone width (see a11y.ts). */
async function setTheme(page: Page, theme: 'DARK' | 'LIGHT'): Promise<void> {
  const res = await page.request.patch('/api/me', {
    data: { theme },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(res.ok()).toBeTruthy();
  await page.reload();
}

test('main screens have no serious accessibility problems', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await audit(page, 'landing');
  await page.goto('/login');
  await audit(page, 'login');
  await page.goto('/register');
  await audit(page, 'register');

  const user = newUser('a11y');
  await registerAndVerify(page, user);
  const videoId = await uploadSampleAndWaitReady(page);
  await page.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();

  for (const theme of ['LIGHT', 'DARK'] as const) {
    await setTheme(page, theme);
    await page.goto(`/@${user.username}`);
    await expect(page.getByRole('button', { name: /^sample/i })).toBeVisible();
    await audit(page, `library ${theme}`);
    await page.goto(`/@${user.username}/v/${videoId}`);
    await expect(page.locator('app-video-player')).toBeVisible();
    await audit(page, `video ${theme}`);
    await page.goto('/settings/profile');
    await audit(page, `settings ${theme}`);
    await page.goto('/settings/security');
    await audit(page, `security ${theme}`);
    await page.goto('/support/new');
    await audit(page, `support ${theme}`);
    await page.goto('/exchange');
    await audit(page, `exchange ${theme}`);
    await page.goto('/notifications');
    await audit(page, `notifications ${theme}`);
  }

  await setTheme(page, 'LIGHT');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/@${user.username}`);
  await expect(page.getByRole('button', { name: /^sample/i })).toBeVisible();
  await audit(page, 'library phone');
});

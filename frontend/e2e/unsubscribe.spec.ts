import { expect, test } from '@playwright/test';

test('a link from a mail asks first, then stops the email, and it can be undone', async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route('**/api/mail/**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    await route.fulfill({
      json: url.pathname.endsWith('/info') ? { type: 'NEW_MESSAGE', email: true } : { ok: true },
    });
  });
  await page.goto('/unsubscribe?t=abc');
  await expect(page.getByTestId('unsubscribe-what')).toContainText('New chat message');
  // Opening it changed nothing: mail scanners follow links.
  expect(calls).toEqual(['GET /api/mail/unsubscribe/info']);

  await page.getByTestId('unsubscribe-stop').click();
  await expect(page.getByTestId('unsubscribe-undo')).toBeVisible();
  expect(calls).toContain('POST /api/mail/unsubscribe');
  await page.getByTestId('unsubscribe-undo').click();
  await expect(page.getByTestId('unsubscribe-stop')).toBeVisible();
  expect(calls).toContain('POST /api/mail/resubscribe');
});

test('a link that does not work says so', async ({ page }) => {
  await page.goto('/unsubscribe?t=broken');
  await expect(page.getByTestId('unsubscribe-invalid')).toBeVisible();
});

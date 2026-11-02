import { type Browser, type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { makeAdmin, newUser, registerAndVerify } from './account';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/** Design-review screenshots, only with VS_SHOTS_DIR. */
async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env['VS_SHOTS_DIR'];
  if (dir) await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** yyyy-mm-dd, local time, `days` from today (what the admin's date field takes). */
function dayFromToday(days: number): string {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Settings → Plan shows the tier and its limits from the API;
 * an admin grants Pro until a date and the user sees the new limits and the end.
 */
test('plan settings: Free by default, Pro until a date after an admin grants it', async ({
  browser,
}) => {
  const user = newUser('plan');
  const adminUser = newUser('padm');
  const page = await freshPage(browser);
  const admin = await freshPage(browser);
  await registerAndVerify(page, user);
  await registerAndVerify(admin, adminUser);
  makeAdmin(adminUser.username);

  await page.goto('/settings/plan');
  await expect(page.getByTestId('plan-tier')).toHaveText('Free');
  await expect(page.getByTestId('plan-file')).toHaveText('up to 1.0 GB');
  await expect(page.getByTestId('plan-shelf')).toHaveText('0 B of 20.0 GB');
  await expect(page.getByTestId('plan-until')).toHaveCount(0);
  await shot(page, 'plan-01-free');
  await audit(page, 'plan settings');

  await admin.goto('/admin/users');
  await admin.getByTestId('admin-users-search').fill(user.username);
  const found = admin.getByTestId('admin-users').getByRole('link');
  await expect(found).toHaveCount(1); // the search is debounced
  await found.click();
  await admin.getByTestId('admin-user-tier').click();
  await admin.getByRole('option', { name: 'Pro' }).click();
  const until = admin.getByTestId('admin-user-tier-until');
  await expect(until).toHaveValue('');
  await until.fill(dayFromToday(30));
  await expect(until).toHaveValue(dayFromToday(30));
  await shot(admin, 'plan-02-admin-user');

  await page.reload();
  await expect(page.getByTestId('plan-tier')).toHaveText('Pro');
  await expect(page.getByTestId('plan-file')).toHaveText('up to 5.0 GB');
  await expect(page.getByTestId('plan-shelf')).toHaveText('0 B of 200 GB');
  // The end is the midnight after the chosen day.
  await expect(page.getByTestId('plan-until')).toContainText(
    String(new Date(Date.now() + 31 * 24 * 3600 * 1000).getFullYear()),
  );
  await shot(page, 'plan-03-pro');
});

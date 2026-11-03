import { type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify, runSql, seedVideos } from './account';
import { SAMPLE_VIDEO } from './global-setup';
import { tile, uploadSampleAndWaitReady } from './videos';

const sender = newUser('nomail');

/** This browser sees an instance whose mail is off, whatever the test server does. */
async function withoutMail(page: Page): Promise<void> {
  await page.route('**/api/site', async (route) => {
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      json: { ...(await res.json()), emailEnabled: false },
    });
  });
}

const lockedLink = (needsPassword: boolean) => ({
  sender: { username: 'someone', displayName: 'Someone', avatarUrl: null, pageHidden: false },
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  expiresInSec: 3600,
  count: 1,
  access: 'locked',
  needsPassword,
  needsCode: true,
  emailHint: 'f•••@example.com',
  own: false,
  videos: [],
  totalBytes: 0,
  zipBytes: 0,
});

test('without mail a link for one person is not offered', async ({ page }) => {
  await registerAndVerify(page, sender);
  seedVideos(sender.username, 'Extra', 1, 'PRIVATE');
  await withoutMail(page);
  await page.goto(`/@${sender.username}`);
  await tile(page, /^extra/i).click({ button: 'right' });
  await page.getByTestId('action-copy-link').hover();
  await page.getByTestId('action-temporary-link').click();
  const dialog = page.getByTestId('link-dialog');
  await expect(dialog.getByTestId('link-create')).toBeEnabled();
  await expect(dialog.getByTestId('link-for-email')).toHaveCount(0);
});

test('an old link for one person says why it cannot open, with no code to ask for', async ({
  page,
}) => {
  await withoutMail(page);
  await page.route('**/api/links/oldlink00001', (route) =>
    route.fulfill({ json: lockedLink(false) }),
  );
  await page.goto('/t/oldlink00001');
  await expect(page.getByTestId('link-gate-code-off')).toContainText('Ask the sender');
  await expect(page.getByTestId('link-send-code')).toHaveCount(0);
  await expect(page.getByTestId('link-unlock')).toHaveCount(0);
});

test('its password can still be tried, and the code stays out of reach', async ({ page }) => {
  await withoutMail(page);
  await page.route('**/api/links/oldlink00001', (route) =>
    route.fulfill({ json: lockedLink(true) }),
  );
  await page.goto('/t/oldlink00001');
  await expect(page.getByTestId('link-gate-password')).toBeVisible();
  await expect(page.getByTestId('link-gate-code-off')).toBeVisible();
  await expect(page.getByTestId('link-send-code')).toHaveCount(0);
  await expect(page.getByTestId('link-unlock')).toBeVisible();
});

test('the notification settings speak only of the bell', async ({ page }) => {
  const user = newUser('nomset');
  await registerAndVerify(page, user);
  await withoutMail(page);
  await page.goto('/settings/notifications');
  await expect(page.getByText('Choose which events show under the bell.')).toBeVisible();
  await expect(page.getByLabel('In-app: Someone requests my video')).toBeChecked();
  await expect(page.getByLabel('In-app: New chat message', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Email: /)).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0);
});

test('a guest is not asked for an address, and is told to keep the deal’s link', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = newUser('nomown');
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

  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await withoutMail(guest);
  await guest.goto(`/x/${code}`);
  await guest.getByTestId('trade-file').setInputFiles(SAMPLE_VIDEO);
  await expect(guest).toHaveURL(/\/deal\/[0-9a-f-]{36}$/);
  const dealId = guest.url().split('/').pop()!;
  await expect(guest.getByTestId('trade-send')).toBeEnabled({ timeout: 120_000 });
  await expect(guest.getByTestId('trade-email')).toHaveCount(0);
  await guest.getByTestId('trade-send').click();
  await expect(guest.getByTestId('trade-state')).toHaveText(`Waiting for ${owner.displayName}`);
  await expect(guest.getByTestId('trade-keep-link')).toContainText('only way back');
  await expect(guest.getByTestId('trade-email-set')).toHaveCount(0);
  await expect(guest.locator('input[type="email"]')).toHaveCount(0);

  // Another browser: only the link can open it, and no email is spoken of.
  const elsewhere = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await withoutMail(elsewhere);
  await elsewhere.goto(`/deal/${dealId}`);
  await expect(elsewhere.getByTestId('trade-gone')).toHaveText(
    'This deal does not open in this browser. Open it with the link you copied.',
  );
});

import { type Page, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify, seedVideos, setTier } from './account';
import { tile, uploadSampleAndWaitReady } from './videos';

const sender = newUser('tlsend');
const friend = newUser('tlfrnd');

/** The types of the notifications a signed-in page has (the worker delivers them). */
const notificationTypes = async (page: Page) =>
  (
    (await (await page.request.get('/api/notifications')).json()) as { items: { type: string }[] }
  ).items.map((n) => n.type);

/** Temporary links: made on the shelf, opened by a guest, kept by a friend. */
test.describe.serial('temporary links', () => {
  let url = '';
  let password = '';

  test('Free makes one too, a password is Pro’s; Pro sends two videos with a made-up password', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await registerAndVerify(page, sender);
    await uploadSampleAndWaitReady(page);
    seedVideos(sender.username, 'Extra', 1, 'PRIVATE');
    await page.reload();

    // The only item about links, its kinds on hover.
    await tile(page, /^sample/i).click({ button: 'right' });
    await page.getByTestId('action-copy-link').hover();
    await page.getByTestId('action-temporary-link').click();
    const free = page.getByTestId('link-dialog');
    await expect(free.getByTestId('link-protect-pro')).toContainText('Pro');
    await free.getByTestId('link-protect-pro').click();
    await expect(page).toHaveURL(/\(panel:pro\)$/);

    setTier(sender.username, 'PREMIUM');
    await page.goto(`/@${sender.username}`);
    await tile(page, /^sample/i).click({ modifiers: ['ControlOrMeta'] });
    await tile(page, /^extra/i).click({ modifiers: ['ControlOrMeta'] });
    const bulk = page.getByTestId('bulk-temporary-link');
    await expect(bulk).not.toContainText('Pro');
    await bulk.click();
    const dialog = page.getByTestId('link-dialog');
    await expect(dialog).toContainText('2 videos');
    await expect(dialog.getByTestId('link-ttl-3d')).toHaveAttribute('aria-checked', 'true');
    await dialog.getByTestId('link-ttl-1d').click();
    await dialog.getByTestId('link-protect').check();
    // Empty until generated; "Generate" also copies it.
    await expect(dialog.getByTestId('link-password')).toHaveValue('');
    await dialog.getByTestId('link-generate').click();
    await expect(dialog.getByTestId('link-password-copied')).toBeVisible();
    password = await dialog.getByTestId('link-password').inputValue();
    expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);
    await dialog.getByTestId('link-create').click();
    await expect(dialog.getByTestId('link-ready')).toBeVisible();
    url = await dialog.getByTestId('link-url').inputValue();
    expect(url).toMatch(/\/t\/[A-Za-z0-9_-]{12}$/);
    await expect(dialog.getByTestId('link-password-result')).toHaveValue(password);
    await dialog.getByTestId('link-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    await dialog.getByTestId('link-my-links').click();
    await expect(page).toHaveURL(/\(panel:links\)$/);
    await expect(page.getByTestId('my-link')).toHaveCount(1);
    await expect(page.getByTestId('my-link')).toContainText('2 videos');
  });

  test('a guest opens it with the password, sees the time run out, watches and downloads', async ({
    browser,
  }) => {
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(url);
    await expect(guest.getByTestId('link-title')).toContainText(
      `@${sender.username} shares videos with you`,
    );
    await expect(guest.getByTestId('link-warning')).toContainText('The link works until');
    await expect(guest.getByTestId('link-countdown')).toContainText(/23:5\d:\d\d/);
    // A device whose clock runs two days ahead still sees it alive: counted by the server.
    const ahead = await (await browser.newContext()).newPage();
    await ahead.clock.setSystemTime(new Date(Date.now() + 2 * 24 * 3600_000));
    await ahead.goto(url);
    await expect(ahead.getByTestId('link-countdown')).toContainText(/23:5\d:\d\d/);
    await ahead.context().close();
    await expect(guest.getByTestId('link-video')).toHaveCount(0);
    await guest.getByTestId('link-gate-password').fill('wrong');
    await guest.getByTestId('link-unlock').click();
    await expect(guest.getByText('Wrong password.')).toBeVisible();
    await guest.getByTestId('link-gate-password').fill(password);
    await guest.getByTestId('link-unlock').click();
    await expect(guest.getByTestId('link-video')).toHaveCount(2);
    await expect(guest.getByTestId('link-zip')).toHaveAttribute('href', /\/api\/links\/.+\/zip$/);
    await expect(guest.getByTestId('link-guest')).toBeVisible();

    const sample = guest.getByTestId('link-video').filter({ hasText: /sample/i });
    // The player opens in the card itself, not over the page.
    await sample.getByTestId('link-watch').click();
    await expect(sample.getByTestId('player')).toBeVisible();
    await expect
      .poll(() => sample.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await expect(guest.getByTestId('player')).toHaveCount(1);

    // This browser remembers the password.
    await guest.reload();
    await expect(guest.getByTestId('link-video')).toHaveCount(2);
    const [download] = await Promise.all([
      guest.waitForEvent('download'),
      sample.getByTestId('link-download').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.(mp4|webm|mov)$/i);
    await guest.context().close();
  });

  test('a friend keeps them on their shelf; the sender hears and takes the link back', async ({
    page,
    browser,
  }) => {
    await registerAndVerify(page, friend);
    await page.goto(url);
    await page.getByTestId('link-gate-password').fill(password);
    await page.getByTestId('link-unlock').click();
    await page.getByTestId('link-save-all').click();
    await expect(page.getByTestId('link-on-shelf')).toHaveCount(2);
    await expect(page.getByTestId('link-save-all')).toContainText('All on your shelf');

    const senderPage = await (await browser.newContext()).newPage();
    await login(senderPage, sender);
    await expect
      .poll(() => notificationTypes(senderPage), { timeout: 15_000 })
      .toEqual(expect.arrayContaining(['LINK_OPENED', 'LINK_SAVED']));
    await senderPage.goto(`/@${sender.username}(panel:links)`);
    await senderPage.getByTestId('my-link-revoke').click();
    await senderPage.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
    await expect(senderPage.getByTestId('my-link')).toHaveCount(0);

    await page.goto(url);
    await expect(page.getByText(/404/)).toBeVisible();
    // What was added stays.
    await page.goto(`/@${friend.username}`);
    await expect(tile(page, /^sample/i)).toBeVisible();
    await expect(tile(page, /^extra/i)).toBeVisible();
    await senderPage.context().close();
  });
});

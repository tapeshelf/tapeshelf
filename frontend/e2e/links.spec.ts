import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, runSql, seedVideos } from './account';
import { linkFromMail, waitForMailText } from './mailpit';

const owner = newUser('lnkown');

/** No dead ends before the email is confirmed; links ready to send. */
test.describe.serial('links and the unconfirmed email', () => {
  test('the owner copies the shelf’s address and a video’s short link', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await registerAndVerify(page, owner);
    seedVideos(owner.username, 'Wanted', 1, 'PRIVATE');
    await page.reload();
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await page.getByTestId('copy-shelf-link').click();
    await expect(page.getByText('Link copied.')).toBeVisible();
    expect(await clipboard()).toBe(`${new URL(page.url()).origin}/@${owner.username}`);
    const tile = page.locator('app-library-tile').first();
    await tile.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy link' }).hover();
    await page.getByRole('menuitem', { name: 'Plain link' }).click();
    // The short link, not /v/<uuid>.
    expect(await clipboard()).toMatch(/\/[a-z0-9]{7}$/);
    // For an exchange: a link of its own, the same one again for the same video.
    await tile.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy link' }).hover();
    await page.getByRole('menuitem', { name: 'For an exchange' }).click();
    await expect(page.getByText('The exchange link is copied.')).toBeVisible();
    const exchange = await clipboard();
    expect(exchange).toMatch(/\/x\/[A-Za-z0-9_-]{12}$/);
    await tile.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy link' }).hover();
    await page.getByRole('menuitem', { name: 'For an exchange' }).click();
    await expect.poll(clipboard).toBe(exchange);
  });

  test('signed up from a video: requests and uploads wait for the email, whose link leads back', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const visitor = newUser('lnkvis');
    const context = await browser.newContext({ locale: 'en-US' });
    const g = await context.newPage();
    // An owner who takes no exchanges from guests: a guest is asked to sign in, as before.
    runSql(`UPDATE "User" SET "acceptGuestExchanges" = false WHERE username = $1`, [
      owner.username,
    ]);
    try {
      await g.goto(`/@${owner.username}`);
      await g
        .getByRole('link', { name: /Wanted 01/ })
        .first()
        .click();
      await expect(g).toHaveURL(/\/[a-z0-9]{7}$/);
      await expect(g.getByRole('button', { name: 'Request this video' })).toBeVisible();
      const videoPath = new URL(g.url()).pathname;
      await g.getByRole('button', { name: 'Request this video' }).click();
      await expect(g.getByText('Sign in to request videos')).toBeVisible();
      await g
        .getByRole('link', { name: /sign up|create/i })
        .first()
        .click();
      await g.getByLabel('Email').fill(visitor.email);
      await g.getByLabel('Username').fill(visitor.username);
      await g.getByLabel('Password', { exact: true }).fill(visitor.password);
      await g.getByRole('button', { name: 'Sign up' }).click();
      await expect(g).toHaveURL(videoPath);

      // Not confirmed yet: the request says so at once, no hint to click through first.
      await g.getByRole('button', { name: 'Request this video' }).click();
      // A toast in the live region, next to the same words in the banner above the header.
      await expect(
        g
          .locator('[aria-live="polite"]')
          .getByText('Confirm your email to unlock uploads, requests and messages.'),
      ).toBeVisible();
      await expect(g.getByText('How requests work')).toHaveCount(0);
      // Own shelf: uploading waits too.
      await g.goto(`/@${visitor.username}`);
      await expect(g.getByRole('button', { name: 'Upload' }).first()).toBeDisabled();
      await expect(g.locator('app-empty-state')).toContainText('Confirm your email');

      // The email's link: back to the video.
      const link = linkFromMail(await waitForMailText(visitor.email, 'Confirm'), '/verify-email');
      await g.goto(link.replace(/^https?:\/\/[^/]+/, ''));
      await expect(g.getByText('Your email is confirmed')).toBeVisible();
      await g.getByRole('button', { name: 'Back to where you were' }).click();
      await expect(g).toHaveURL(videoPath);
    } finally {
      await context.close();
    }
  });
});

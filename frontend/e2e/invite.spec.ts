import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify, registerViaApi } from './account';
import { linkFromMail, waitForMailText } from './mailpit';

const inviter = newUser('invt');
const friend = newUser('invf');
const newcomer = newUser('invn');

/** A link that makes friends, in one click or once a newcomer's email is confirmed. */
test('an invitation link makes friends: one click for an account, after the confirmed email for a newcomer', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await registerAndVerify(page, inviter);
  await page.getByTestId('invite-friend').click();
  const dialog = page.getByTestId('invite-dialog');
  await expect(dialog.getByTestId('invite-terms')).toContainText('used 0 of 10');
  const link = await dialog.getByTestId('invite-link').inputValue();
  expect(link).toMatch(/\/invite\/[\w-]+$/);
  const path = new URL(link).pathname;
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Someone with an account: one click.
  const friendContext = await registerViaApi(browser, friend);
  const friendPage = await friendContext.newPage();
  await friendPage.goto(path);
  await expect(friendPage.getByTestId('invite-from')).toContainText(
    `${inviter.displayName} invites you to be friends`,
  );
  await friendPage.getByTestId('invite-join').click();
  await expect(friendPage.getByTestId('invite-done')).toContainText('friends now');
  const relation = async (p: typeof page) =>
    (await (await p.request.get(`/api/users/${inviter.username}`)).json()).relation as Record<
      string,
      boolean
    >;
  expect(await relation(friendPage)).toMatchObject({ following: true, friends: true });
  await friendContext.close();

  // Someone new: signs up from the page, comes back, and is a friend once the email is confirmed.
  const fresh = await (await browser.newContext({ locale: 'en-US' })).newPage();
  try {
    await fresh.goto(path);
    await fresh.getByRole('link', { name: 'Create an account' }).click();
    await fresh.getByLabel('Email').fill(newcomer.email);
    await fresh.getByLabel('Username').fill(newcomer.username);
    await fresh.getByLabel('Password', { exact: true }).fill(newcomer.password);
    await fresh.getByLabel('Display name').fill(newcomer.displayName);
    await fresh.getByRole('button', { name: 'Sign up' }).click();
    await expect(fresh.getByTestId('invite-pending')).toBeVisible();
    await expect(fresh).not.toHaveURL(/join=1/);
    expect((await relation(fresh)).following).toBe(false);
    const verify = linkFromMail(await waitForMailText(newcomer.email, 'Confirm'), '/verify-email');
    await fresh.goto(verify.replace(/^https?:\/\/[^/]+/, ''));
    await expect(fresh.getByText('Your email is confirmed')).toBeVisible();
    expect(await relation(fresh)).toMatchObject({ following: true, friends: true });
  } finally {
    await fresh.context().close();
  }
  // The link counted both.
  await page.getByTestId('invite-friend').click();
  await expect(page.getByTestId('invite-terms')).toContainText('used 2 of 10');
});

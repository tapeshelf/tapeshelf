import { type Browser, type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { newUser, registerAndVerify, setTier } from './account';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/**
 * on Free the switch is offered as "· Pro"; on Pro the owner hides
 * the page and still sees it, with a quiet mark and without the shelf link; a visitor, a guest and
 * the owner previewing it as a visitor get "page not found"; switching it back opens it again.
 */
test('hide my page: Pro only, the owner keeps it, everyone else gets 404', async ({ browser }) => {
  const ownerUser = newUser('hid');
  const visitorUser = newUser('vis');
  const owner = await freshPage(browser);
  const visitor = await freshPage(browser);
  await registerAndVerify(owner, ownerUser);
  await registerAndVerify(visitor, visitorUser);

  // Free: the way to it is Pro.
  await owner.goto('/settings/page');
  await expect(owner.getByTestId('page-hidden-pro')).toHaveText(/Hide my page · Pro/);
  await expect(owner.getByTestId('page-hidden')).toHaveCount(0);

  setTier(ownerUser.username, 'PREMIUM');
  await owner.reload();
  await owner.getByTestId('page-hidden').check();
  await expect(owner.getByText('Saved.')).toBeVisible();
  await expect(owner.getByText('When Pro ends, the page becomes visible again.')).toBeVisible();
  await audit(owner, 'settings · hidden page');

  // The owner: the page as usual, a quiet mark, no shelf link to send.
  await owner.goto(`/@${ownerUser.username}`);
  await expect(owner.getByTestId('profile-hidden')).toHaveText('Page hidden');
  // The mark alone, without a hint next to it.
  await expect(owner.getByTestId('profile-head')).not.toContainText('admins see it');
  await expect(owner.getByTestId('copy-shelf-link')).toHaveCount(0);

  // Everyone else: not found.
  await visitor.goto(`/@${ownerUser.username}`);
  await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  // The lists open in the side panel over the page: both say "not found".
  await visitor.goto(`/@${ownerUser.username}/friends`);
  await expect(
    visitor.getByTestId('panel').getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  const guest = await freshPage(browser);
  await guest.goto(`/@${ownerUser.username}`);
  await expect(guest.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  // The owner previewing the page as a visitor sees what a visitor sees, and gets back.
  await owner.getByTestId('view-as-visitor').click();
  await expect(owner.getByTestId('visitor-banner')).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await owner.getByTestId('visitor-exit').click();
  await expect(owner.getByTestId('profile-hidden')).toBeVisible();

  // Switched back: the page is there for everyone again.
  await owner.goto('/settings/page');
  await owner.getByTestId('page-hidden').uncheck();
  await expect(owner.getByText('Saved.')).toBeVisible();
  await visitor.goto(`/@${ownerUser.username}`);
  await expect(visitor.getByTestId('profile-head')).toBeVisible();
  await expect(visitor.getByTestId('profile-hidden')).toHaveCount(0);
});

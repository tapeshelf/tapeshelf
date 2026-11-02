import { type Browser, type Page, expect, test } from '@playwright/test';

import { audit } from './a11y';
import { makeAdmin, newUser, registerAndVerify } from './account';
import { uploadSampleAndWaitReady } from './videos';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

/** Design-review screenshots, only with VS_SHOTS_DIR. */
async function shot(p: Page, name: string): Promise<void> {
  const dir = process.env['VS_SHOTS_DIR'];
  if (dir) await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function confirmPrompt(p: Page, answer?: string): Promise<void> {
  if (answer !== undefined) await p.getByTestId('prompt-input').fill(answer);
  await p.getByTestId('prompt-confirm').click();
}

/**
 * a report reaches the admin queue, the admin deletes the video,
 * erases it from storage in the trash, looks at the site as the author (read-only), and a user
 * deletes their own account.
 */
test('report → admin deletes the video → trash purge; view as; self-service account deletion', async ({
  browser,
}) => {
  const authorUser = newUser('auth');
  const reporterUser = newUser('rep');
  const adminUser = newUser('adm');
  const author = await freshPage(browser);
  const reporter = await freshPage(browser);
  const admin = await freshPage(browser);
  await registerAndVerify(author, authorUser);
  await registerAndVerify(reporter, reporterUser);
  await registerAndVerify(admin, adminUser);
  const videoId = await uploadSampleAndWaitReady(author);

  // A visitor reports the video from its page.
  await reporter.goto(`/@${authorUser.username}/v/${videoId}`);
  await reporter.getByTestId('report-video').click();
  const dialog = reporter.getByTestId('report-dialog');
  await dialog.getByLabel('Spam or advertising').check();
  await dialog.getByTestId('report-comment').fill('Same clip posted everywhere');
  await shot(reporter, 'admin-01-report-dialog');
  await dialog.getByTestId('report-send').click();
  await expect(reporter.getByText('Report sent. Thank you!')).toBeVisible();

  // Ordinary users never see the admin panel: sent home, which for a signed-in user is their page.
  await reporter.goto('/admin');
  await expect(reporter).toHaveURL(`/@${reporterUser.username}`);

  // The admin: the role is read on every request, a reload is enough.
  makeAdmin(adminUser.username);
  await admin.reload();
  await admin.getByRole('button', { name: 'Account menu' }).click();
  await admin.getByTestId('nav-admin').click();
  await expect(admin).toHaveURL('/admin/dashboard');
  // The e2e database is shared by every spec and run: look only at this run's objects.
  await expect(admin.getByTestId('dash-reports')).toBeVisible();
  await expect(admin.getByTestId('admin-reports-badge')).toBeVisible();
  await shot(admin, 'admin-02-dashboard');
  await audit(admin, 'admin dashboard');

  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Reports' }).click();
  const report = admin.getByTestId('admin-report').filter({ hasText: `@${reporterUser.username}` });
  await expect(report).toHaveCount(1);
  await expect(report).toContainText('Same clip posted everywhere');
  await expect(report).toContainText(`@${reporterUser.username}`);
  await shot(admin, 'admin-03-reports');
  await audit(admin, 'admin reports');
  await report.getByTestId('report-delete-video').click();
  // The removal: the reported rule goes to the author with the moderator's words.
  const takedown = admin.getByTestId('takedown-dialog');
  await expect(takedown.getByTestId('takedown-rule-fixed')).toHaveText('Spam or advertising');
  await expect(takedown.getByTestId('takedown-block')).toBeChecked();
  // Blocking is on by default; untick it here: every spec uploads the same sample.mp4 into one
  // shared test database, and a blocked hash would fail all later uploads (the backend e2e covers it).
  await takedown.getByTestId('takedown-block').uncheck();
  await takedown.getByTestId('takedown-message').fill('The same clip, posted many times.');
  await takedown.getByRole('textbox', { name: 'Note' }).fill('duplicate spam');
  await shot(admin, 'admin-03b-takedown');
  await audit(admin, 'admin takedown dialog');
  await takedown.getByTestId('takedown-confirm').click();
  await expect(admin.getByText('Done.')).toBeVisible();
  await expect(report).toHaveCount(0);

  // The author hears why.
  await author.reload();
  await author.getByTestId('notification-bell').click();
  await expect(author.getByTestId('notification-menu')).toContainText(
    'The moderators removed your video “Sample”: Spam or advertising. Note: The same clip, posted many times.',
  );
  await author.keyboard.press('Escape');

  // The video is gone for its author and for the reporter; the reporter hears back.
  await reporter.goto(`/@${authorUser.username}/v/${videoId}`);
  await expect(reporter.getByText('Page not found')).toBeVisible();
  await expect(reporter.getByTestId('notification-badge')).toHaveText('1', { timeout: 15_000 });
  await reporter.getByTestId('notification-bell').click();
  await expect(reporter.getByTestId('notification-menu')).toContainText(
    'We reviewed your report about “Sample” and took action.',
  );
  await reporter.keyboard.press('Escape');

  // Trash: the video with its measured size; erase it from storage for good.
  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Trash' }).click();
  const row = admin.locator(`[data-testid="trash-row"][data-video-id="${videoId}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('deleted by admin');
  await shot(admin, 'admin-04-trash');
  await audit(admin, 'admin trash');
  await row.getByRole('checkbox').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await admin.getByTestId('trash-purge').click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Erase for good' }).click();
  await expect(admin.getByText(/Erased: 1 video,/)).toBeVisible(); // one video, not "1 videos"
  await expect(row).toHaveCount(0);

  // View the site as the author: their page in owner mode, nothing can be changed, then back.
  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Users' }).click();
  await admin.getByTestId('admin-users-search').fill(authorUser.username);
  const found = admin.getByTestId('admin-users').getByRole('link');
  await expect(found).toHaveCount(1); // the search is debounced
  await found.click();
  await expect(admin.getByTestId('admin-user')).toContainText(`@${authorUser.username}`);
  await shot(admin, 'admin-05-user');
  await audit(admin, 'admin user');
  await admin.getByTestId('admin-view-as').click();
  await expect(admin).toHaveURL(`/@${authorUser.username}`);
  await expect(admin.getByTestId('view-as-banner')).toContainText(`@${authorUser.username}`);
  await expect(admin.getByRole('heading', { name: authorUser.displayName })).toBeVisible();
  await shot(admin, 'admin-06-view-as');
  await expect(admin.getByRole('button', { name: 'Account menu' })).toContainText(
    authorUser.displayName,
  );
  await admin.getByTestId('view-as-exit').click();
  await expect(admin).toHaveURL(/\/admin\/users\//);
  await expect(admin.getByTestId('view-as-banner')).toHaveCount(0);

  // Self-service deletion: confirmed with the password, signed out, the username stays taken.
  await reporter.goto('/settings/account');
  await reporter.getByTestId('delete-account-button').click();
  await confirmPrompt(reporter, reporterUser.password);
  await expect(reporter).toHaveURL('/');
  await expect(reporter.getByText('Your account has been deleted.')).toBeVisible();
  await expect(
    reporter.getByRole('banner').getByRole('link', { name: 'Log in', exact: true }),
  ).toBeVisible();

  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Users' }).click();
  await admin.getByTestId('admin-users-search').fill(reporterUser.username);
  await expect(admin.getByTestId('admin-users').getByRole('link')).toHaveCount(1);
  await expect(admin.getByTestId('admin-users')).toContainText('deleted');

  // Every step is in the audit log.
  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Audit log' }).click();
  const auditLog = admin.getByTestId('admin-audit');
  for (const action of [
    'Account deleted',
    'Viewed the site as',
    'Erased from storage',
    'Report resolved',
  ])
    await expect(auditLog).toContainText(action);
  await shot(admin, 'admin-07-audit');
  await audit(admin, 'admin audit');
  await admin.getByTestId('admin-nav').getByRole('link', { name: 'Settings' }).click();
  await expect(admin.getByTestId('admin-settings')).toBeVisible();
  await audit(admin, 'admin settings');

  if (process.env['VS_SHOTS_DIR']) {
    await admin.getByTestId('admin-nav').getByRole('link', { name: 'Videos' }).click();
    await admin.getByTestId('admin-videos').getByRole('link').first().click();
    await expect(admin.getByTestId('admin-video')).toBeVisible();
    await shot(admin, 'admin-08-video');
    await admin.getByTestId('admin-nav').getByRole('link', { name: 'Settings' }).click();
    await expect(admin.getByTestId('admin-settings')).toBeVisible();
    await shot(admin, 'admin-09-settings');
  }
});

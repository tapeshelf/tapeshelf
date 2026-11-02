import { expect, test } from '@playwright/test';

import { audit } from './a11y';
import { makeAdmin, newUser, registerViaApi } from './account';
import { SAMPLE_IMAGE } from './global-setup';

/**
 * Support: a bug report with a screenshot from the account
 * menu; the admin sees it waiting, leaves a note the author never sees, answers; the author is told,
 * reads the answer signed "Support", says the question is solved and that it helped.
 */
test('a bug report with a picture → a note and an answer in the admin → solved and rated', async ({
  browser,
}) => {
  const annUser = newUser('sup');
  const bossUser = newUser('supadm');
  const ann = await (await registerViaApi(browser, annUser)).newPage();
  const boss = await (await registerViaApi(browser, bossUser)).newPage();
  makeAdmin(bossUser.username);

  // Between the requests and the settings in the account menu.
  await ann.goto(`/@${annUser.username}`);
  await ann.getByRole('button', { name: 'Account menu' }).click();
  const items = await ann.getByRole('menuitem').allInnerTexts();
  const at = (re: RegExp) => items.findIndex((t) => re.test(t));
  // Temporary links, everyone's since, sit between the requests and support.
  expect(at(/Support/)).toBe(at(/Temporary links/) + 1);
  expect(at(/Temporary links/)).toBe(at(/Requests/) + 1);
  expect(at(/Settings/)).toBe(at(/Support/) + 1);
  await ann.getByRole('menuitem', { name: /Support/ }).click();
  await expect(ann).toHaveURL(`/@${annUser.username}(panel:support)`);
  await expect(ann.getByText('No requests yet')).toBeVisible();

  await ann.getByTestId('support-new').click();
  await ann.getByTestId('support-topic-BUG').click();
  // What a bug report carries is shown before it is sent; the page is the one under the panel.
  await expect(ann.getByTestId('support-context')).toContainText(`/@${annUser.username}`);
  const subject = `Upload stops at 99 % (${annUser.username})`;
  await ann.getByTestId('support-subject').fill(subject);
  await ann.getByTestId('support-body').fill('Every time, on the last part.');
  await ann.getByTestId('support-pictures').setInputFiles(SAMPLE_IMAGE);
  await audit(ann, 'support new ticket');
  await ann.getByTestId('support-send').click();
  await expect(ann.getByTestId('support-ticket')).toBeVisible();
  await expect(ann.getByTestId('support-status')).toHaveText('waiting for support');
  await expect(ann.getByTestId('support-picture')).toHaveCount(1);
  await ann.getByTestId('panel-close').click();

  // The admin: the counter, the ticket waiting, a note, then the answer.
  await boss.goto('/admin/support');
  await expect(boss.getByTestId('admin-support-badge')).toBeVisible();
  const waiting = Number(await boss.getByTestId('admin-support-badge').innerText());
  await boss.getByRole('link', { name: subject }).click();
  await expect(boss.getByTestId('admin-support-context')).toContainText('browser');
  await expect(boss.getByTestId('admin-support-ticket')).toBeVisible();
  await boss.getByTestId('admin-support-note-tab').click();
  await boss.getByTestId('admin-support-draft').fill('Probably the part size');
  await boss.getByTestId('admin-support-send').click();
  await expect(boss.getByTestId('admin-support-message-NOTE')).toContainText(
    'Probably the part size',
  );
  await boss.getByRole('tab', { name: 'Answer' }).click();
  await boss.getByTestId('admin-support-draft').fill('Fixed — please try once more.');
  await boss.getByTestId('admin-support-send').click();
  await expect(boss.getByTestId('admin-support-status')).toHaveText('Waiting for the author');
  // One fewer waiting for support (other runs' tickets may wait too).
  if (waiting > 1)
    await expect(boss.getByTestId('admin-support-badge')).toHaveText(String(waiting - 1));
  else await expect(boss.getByTestId('admin-support-badge')).toHaveCount(0);
  await audit(boss, 'admin support ticket');

  // The author: told at once by the bell (the capsule repeats nothing), reads the answer
  // signed "Support", never the note.
  await expect(ann.getByTestId('notification-badge')).toHaveText('1');
  await expect(ann.getByTestId('account-badge')).toHaveCount(0);
  await ann.getByRole('button', { name: 'Account menu' }).click();
  await expect(ann.getByTestId('support-badge')).toHaveText('1');
  await ann.getByRole('menuitem', { name: /Support/ }).click();
  await ann.getByTestId('support-row').click();
  await expect(ann.getByTestId('support-message-SUPPORT')).toContainText('please try once more');
  await expect(ann.getByText('Probably the part size')).toHaveCount(0);
  await expect(ann.getByTestId('support-status')).toHaveText('your reply');
  // Opening the ticket dealt with its bell item.
  await expect(ann.getByTestId('notification-badge')).toHaveCount(0);
  await ann.getByTestId('support-resolve').click();
  await expect(ann.getByTestId('support-status')).toHaveText('solved');
  // Solved is over: nothing more to write in it, a new request instead.
  await expect(ann.getByTestId('support-composer')).toHaveCount(0);
  await expect(ann.getByTestId('support-closed')).toContainText('start a new one');
  await audit(ann, 'support ticket');
  await ann.getByTestId('support-helped').click();
  await expect(ann.getByTestId('support-helped')).toHaveAttribute('aria-pressed', 'true');

  // The list shows it solved; the admin sees the rating.
  await ann.getByRole('link', { name: 'All requests' }).click();
  await expect(ann.getByTestId('support-row-status')).toHaveText('solved');
  await boss.reload();
  await expect(boss.getByTestId('admin-support-ticket')).toBeVisible();
  await expect(boss.getByText(/Rating:\s*helped/)).toBeVisible();
});

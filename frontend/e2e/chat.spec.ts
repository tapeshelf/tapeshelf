import { type Browser, type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { uploadSampleAndWaitReady } from './videos';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

async function closeUploads(p: Page): Promise<void> {
  await p.getByTestId('upload-panel').getByRole('button', { name: 'Close' }).click();
  await expect(p.getByTestId('upload-panel')).toHaveCount(0);
}

/**
 * two people become friends, chat in real time (with a video card and
 * read marks), then a block stops the chat while the history stays; unblock from settings.
 */
test('friends chat in real time; a block ends it and can be lifted in settings', async ({
  browser,
}) => {
  const a = newUser('ann');
  const b = newUser('bob');
  const ann = await freshPage(browser);
  const bob = await freshPage(browser);
  await registerAndVerify(ann, a);
  await registerAndVerify(bob, b);
  await uploadSampleAndWaitReady(bob);
  await closeUploads(bob);

  // Ann adds Bob: she follows him, he hears about it.
  await ann.goto(`/@${b.username}`);
  await ann.getByTestId('friend-button').click();
  await expect(ann.getByTestId('friend-button')).toContainText('Following');
  await expect(ann.getByTestId('message-button')).toHaveCount(0);
  await expect(bob.getByTestId('notification-badge')).toHaveText('2', { timeout: 15_000 }); // + "video ready"
  await bob.getByTestId('notification-bell').click();
  await expect(bob.getByTestId('notification-menu')).toContainText(
    `${a.displayName} added you as a friend.`,
  );
  await bob.keyboard.press('Escape');

  // Bob adds her back: friends, counters update, Message appears.
  await bob.goto(`/@${a.username}`);
  await expect(bob.getByTestId('follows-you')).toBeVisible();
  await bob.getByTestId('friend-button').click();
  await expect(bob.getByTestId('friend-button')).toContainText('Friends');
  await expect(bob.getByTestId('profile-counts')).toContainText(/1\s*Friends/);

  // Bob writes, with his video attached.
  await bob.getByTestId('message-button').click();
  await expect(bob).toHaveURL(new RegExp(`\\(panel:messages/${a.username}\\)$`));
  await bob.getByTestId('chat-attach').click();
  await bob
    .getByTestId('video-picker')
    .getByRole('button', { name: /^sample/i })
    .click();
  await expect(bob.getByTestId('chat-attachment')).toContainText('Sample');
  await bob.getByTestId('chat-input').fill('Hi Ann! Look at this one.');
  await bob.getByTestId('chat-input').press('Enter');
  await expect(bob.getByTestId('chat-messages')).toContainText('Hi Ann! Look at this one.');
  await expect(bob.getByTestId('sent-mark')).toBeVisible();

  // Ann gets it live: the bell (the capsule repeats nothing), the menu item, the conversation.
  await ann.goto(`/@${a.username}`);
  await expect(ann.getByTestId('notification-badge')).toBeVisible({ timeout: 15_000 });
  await expect(ann.getByTestId('account-badge')).toHaveCount(0);
  await ann.getByRole('button', { name: 'Account menu' }).click();
  await expect(ann.getByTestId('messages-badge')).toHaveText('1');
  await ann.getByTestId('nav-messages').click();
  await expect(ann).toHaveURL(/\(panel:messages\)$/);
  await expect(ann.getByTestId('conversation-unread')).toHaveText('1');
  await ann.getByTestId('conversation').first().click();
  await expect(ann.getByTestId('chat-messages')).toContainText('Hi Ann! Look at this one.');
  await expect(ann.getByTestId('chat-video')).toContainText('Sample');
  await expect(ann.getByTestId('account-badge')).toHaveCount(0);

  // Bob sees that she read it; her reply reaches him without a reload.
  await expect(bob.getByTestId('read-mark')).toBeVisible({ timeout: 15_000 });
  await ann.getByTestId('chat-input').fill('Hello Bob');
  await ann.getByTestId('chat-send').click();
  await expect(bob.getByTestId('chat-messages')).toContainText('Hello Bob', { timeout: 15_000 });

  // A long thread: the earlier messages come by themselves as Ann scrolls up.
  for (let i = 1; i <= 55; i++) {
    const r = await bob.request.post(`/api/conversations/with/${a.username}/messages`, {
      data: { body: `Line ${i}` },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(r.ok(), `${r.status()} ${await r.text()}`).toBe(true);
  }
  await ann.reload();
  const thread = ann.getByTestId('chat-messages');
  await expect(thread).toContainText('Line 55');
  await expect(thread).not.toContainText('Look at this one');
  await expect(async () => {
    await thread.evaluate((el) => (el.scrollTop = 0));
    await expect(thread).toContainText('Hi Ann! Look at this one.', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // Ann blocks Bob: the friendship ends, he cannot write any more, the history stays.
  await ann.goto(`/@${b.username}`);
  await ann.getByTestId('profile-more').click();
  await ann.getByRole('menuitem', { name: 'Block' }).click();
  await ann.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(ann.getByTestId('friend-button')).toHaveCount(0);
  await bob.reload();
  await expect(bob.getByTestId('chat-blocked')).toBeVisible();
  await expect(bob.getByTestId('chat-messages')).toContainText('Line 55');
  await bob.goto(`/@${a.username}`);
  await expect(bob.getByTestId('profile-more')).toBeVisible();
  await expect(bob.getByTestId('friend-button')).toHaveCount(0);

  // Unblock from settings.
  await ann.goto('/settings/blocked');
  await expect(ann.getByTestId('blocked-list')).toContainText(b.displayName);
  await ann.getByRole('button', { name: 'Unblock' }).click();
  await expect(ann.getByText("You haven't blocked anyone.")).toBeVisible();
});

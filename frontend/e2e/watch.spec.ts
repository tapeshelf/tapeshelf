import { type Browser, type Page, expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { codeOf, setVisibility, tile, uploadSampleAndWaitReady } from './videos';

const author = newUser('auth');
const viewer = newUser('view');
let videoId = '';

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ locale: 'en-US' })).newPage();
}

test.describe.serial('watching, bookmarks and deletion', () => {
  test('author uploads and publishes; a guest can play it', async ({ page, browser }) => {
    await registerAndVerify(page, author);
    videoId = await uploadSampleAndWaitReady(page);

    // 15 minutes later the browser drops the access cookie. The own private video still opens as
    // the owner's, not as a stranger's private one: the app renews the session and asks again.
    await page.context().clearCookies({ name: 'vs_access' });
    await tile(page, /^sample/i).click();
    await expect(page.getByTestId('player')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await page.goBack();

    await setVisibility(page, /^sample/i, 'Public');

    const guest = await freshPage(browser);
    // The short link is the video's own address, named after it in the tab.
    const code = await codeOf(guest, videoId);
    await guest.goto(`/${code.toUpperCase()}`);
    await expect(guest).toHaveURL(`/${code}`);
    await expect(guest.getByRole('heading', { name: 'Sample' })).toBeVisible();
    await expect(guest).toHaveTitle('Sample · tapeshelf');
    await expect(guest.getByText('(1 video)', { exact: true })).toBeVisible(); // not "1 videos"
    await expect(guest.getByRole('link', { name: 'Download' })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Add to collection' })).toHaveCount(0);

    // Playback starts by itself, without sound when the browser insists.
    const player = guest.getByTestId('player');
    await expect(player).toBeVisible();
    await expect
      .poll(() => guest.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0.5);
    await expect
      .poll(() => guest.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBe(640);

    // Links from before /@username (old emails, shared URLs) land on the same pages.
    await guest.goto(`/u/${author.username}/v/${videoId}`);
    await expect(guest).toHaveURL(`/${code}`);
    await guest.goto(`/@${author.username}`);
    await expect(guest).toHaveTitle(`@${author.username} · tapeshelf`);
    await guest.goto(`/u/${author.username}/friends`);
    await expect(guest).toHaveURL(
      new RegExp(`/@${author.username}\\(panel:friends/${author.username}\\)`),
    );
    await guest.context().close();
  });

  test('a registered viewer bookmarks it, sees it on their page, hides it from visitors', async ({
    browser,
  }) => {
    const page = await freshPage(browser);
    await registerAndVerify(page, viewer);
    const code = await codeOf(page, videoId);
    await page.goto(`/v/${videoId}`);
    await expect(page).toHaveURL(`/${code}`);
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByText('In your collection')).toBeVisible();

    // On the own page the bookmark sits in the "From others" folder of the file manager.
    await page.goto(`/@${viewer.username}`);
    await page.getByRole('button', { name: /^From others/ }).click();
    const bookmark = tile(page, /sample/i);
    await expect(bookmark).toBeVisible();
    await expect(bookmark).toContainText(`@${author.username}`);
    await bookmark.click();
    // Opened from the viewer's shelf: same short link, the viewer's copy.
    await expect(page).toHaveURL(`/${code}`);
    await expect(page.getByText(`in the collection of ${viewer.displayName}`)).toBeVisible();
    await page.getByRole('button', { name: 'Hide from visitors' }).click();
    await expect(page.getByText('Hidden from visitors')).toBeVisible();

    const guest = await freshPage(browser);
    await guest.goto(`/@${viewer.username}/v/${videoId}`);
    await expect(guest.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await guest.goto(`/@${viewer.username}`);
    await expect(guest.getByTestId('section-OTHERS')).toHaveCount(0);
    await guest.context().close();
    await page.context().close();
  });

  test('private again: guests get the contact sheet only; the author deletes it', async ({
    page,
    browser,
  }) => {
    const code = await codeOf(page, videoId);
    await page.goto('/login');
    await page.getByLabel('Email').fill(author.email);
    await page.getByLabel('Password').fill(author.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`/@${author.username}`);
    await setVisibility(page, /^sample/i, 'Private');

    const guest = await freshPage(browser);
    await guest.goto(`/@${author.username}/v/${videoId}`);
    await expect(guest.getByTestId('private-preview')).toBeVisible();
    await expect(guest.getByTestId('contact-sheet')).toBeVisible();
    await expect(guest.locator('video')).toHaveCount(0);

    // "Only for me": the author hides it, and visitors neither see nor can request it.
    await page.goto(`/@${author.username}/v/${videoId}`);
    await page.getByRole('button', { name: 'Hide from visitors' }).click();
    await expect(page.getByText('Hidden from visitors')).toBeVisible();
    await guest.goto(`/@${author.username}/v/${videoId}`);
    await expect(guest.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('button', { name: 'Show to visitors' }).click();
    await expect(page.getByText('Hidden from visitors')).toHaveCount(0);
    await guest.goto(`/@${author.username}/v/${videoId}`);
    await expect(guest.getByTestId('private-preview')).toBeVisible();
    await guest.context().close();

    await page.goto(`/@${author.username}/v/${videoId}`);
    await expect(page.getByTestId('player')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByText('Video deleted.')).toBeVisible();
    await expect(page).toHaveURL(`/@${author.username}`);
    await expect(page.getByRole('button', { name: /^sample/i })).toHaveCount(0);

    const after = await freshPage(browser);
    await after.goto(`/v/${videoId}`);
    await expect(after.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await after.goto(`/${code}`);
    await expect(after.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await after.context().close();
  });
});

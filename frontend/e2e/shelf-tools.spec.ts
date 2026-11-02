import { type BrowserContext, expect, test } from '@playwright/test';

import { newUser, registerViaApi, runSql, seedVideos } from './account';
import { tile } from './videos';

const xhr = { 'X-Requested-With': 'XMLHttpRequest' };

/** Categories for the seeded videos whose titles start with each name's key (rows only). */
function file(username: string, categories: Record<string, string>): void {
  for (const [name, prefix] of Object.entries(categories))
    runSql(
      `WITH u AS (SELECT id FROM "User" WHERE username = $1),
       c AS (INSERT INTO "Category" (id, "ownerId", name, position, "createdAt", "updatedAt")
         SELECT gen_random_uuid(), u.id, $2, (SELECT COUNT(*) FROM "Category" x WHERE x."ownerId" = u.id), now(), now()
         FROM u RETURNING id, "ownerId")
       UPDATE "VideoAccess" va SET "categoryId" = c.id FROM c, "Video" v
       WHERE va."holderId" = c."ownerId" AND v.id = va."videoId" AND v.title LIKE $3 || '%'`,
      [username, name, prefix],
    );
}

function videoId(username: string, title: string): string {
  return String(
    runSql(
      `SELECT v.id FROM "Video" v JOIN "User" u ON u.id = v."authorId" WHERE u.username = $1 AND v.title = $2`,
      [username, title],
    )[0]!['id'],
  );
}

async function put(ctx: BrowserContext, url: string, data: unknown): Promise<void> {
  const r = await ctx.request.put(url, { headers: xhr, data });
  expect(r.ok(), `${url}: ${r.status()}`).toBe(true);
}

/** A big shelf for visitors — a search across it, months, categories as cards, groups. */
test('a visitor searches the whole shelf, opens categories from cards and sees them as groups', async ({
  browser,
}) => {
  const owner = newUser('cards');
  const ctx = await registerViaApi(browser, owner);
  seedVideos(owner.username, 'Coast dive', 8, 'PUBLIC', 60 * 24 * 3);
  seedVideos(owner.username, 'Studio take', 8, 'PRIVATE', 60 * 24 * 45);
  seedVideos(owner.username, 'Loose clip', 2, 'PRIVATE', 60 * 24 * 60);
  file(owner.username, { Travel: 'Coast', Studio: 'Studio' });

  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/@${owner.username}`);
  // Newest first, each section is cut by month.
  await expect(guest.getByTestId('section-PUBLIC').getByTestId('month-heading')).toHaveCount(1);
  // A typo still finds it, in the whole shelf, from inside a category, with where each was found.
  await guest
    .getByRole('button', { name: /^Travel/ })
    .first()
    .click();
  await guest.getByTestId('shelf-search').first().fill('studo take 0');
  await expect(guest.getByTestId('search-scope')).toContainText('across the whole shelf');
  await expect(guest.getByTestId('tile-context').first()).toHaveText('Studio');
  await guest.getByTestId('shelf-search').first().fill('');

  // The owner shows the categories first, and groups "All videos" by category.
  await put(ctx, '/api/me/page', { firstView: 'folders', grouping: 'category' });
  await guest.goto(`/@${owner.username}`);
  const cards = guest.getByTestId('folder-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Travel');
  await expect(cards.first()).toContainText('8 videos');
  await cards.nth(1).click();
  await expect(guest).toHaveURL(/[?&]category=/);
  await expect(guest.locator('app-video-card')).toHaveCount(8);
  await guest
    .getByRole('button', { name: /^All videos/ })
    .first()
    .click();
  await expect(cards).toHaveCount(2);
  // The visitor switches to the videos: a group per category, then the rest.
  await guest.getByTestId('view-videos').filter({ visible: true }).click();
  await expect(guest).toHaveURL(/[?&]view=videos/);
  await expect(guest.locator('[data-testid^="section-cat-"]').first()).toContainText('Travel');
  await expect(guest.getByTestId('section-cat-none')).toContainText('Other videos', {
    timeout: 20_000,
  });
  // A category's first rows only, with the rest one click away.
  const studio = String(
    runSql(
      `SELECT c.id FROM "Category" c JOIN "User" u ON u.id = c."ownerId" WHERE u.username = $1 AND c.name = 'Studio'`,
      [owner.username],
    )[0]!['id'],
  );
  const looked = await ctx.request.patch(`/api/me/categories/${studio}`, {
    headers: xhr,
    data: { previewRows: 1, tileScale: 'xs' },
  });
  expect(looked.ok()).toBe(true);
  await guest.reload();
  const showAll = guest.getByTestId(`show-all-cat-${studio}`);
  await expect(showAll).toHaveText('All 8 →');
  const studioTiles = guest.getByTestId(`section-cat-${studio}`).locator('app-video-card');
  expect(await studioTiles.count()).toBeLessThan(8);
  await showAll.click();
  await expect(guest).toHaveURL(new RegExp(`[?&]category=${studio}`));
  await expect(guest.locator('app-video-card')).toHaveCount(8);
  await guest
    .getByRole('button', { name: /^All videos/ })
    .first()
    .click();
  // One feed: no headings of groups at all.
  await put(ctx, '/api/me/page', { grouping: 'none' });
  await guest.reload();
  await expect(guest.getByTestId('section-ALL')).toBeVisible();
  await expect(guest.getByTestId('section-ALL').locator('h2')).toHaveCount(0);
});

/** The owner's tools for a big shelf — the Inbox one by one, tidy titles, duplicates. */
test('the owner sorts the Inbox, tidies titles, keeps one of two alike and is warned on upload', async ({
  browser,
}) => {
  const owner = newUser('tidy');
  const ctx = await registerViaApi(browser, owner);
  seedVideos(owner.username, 'Studio take', 4, 'PUBLIC', 60 * 24);
  seedVideos(owner.username, 'Summer_on_the.lake 1080p', 3, 'PRIVATE', 1);
  file(owner.username, { Studio: 'Studio' });
  runSql(
    `UPDATE "Video" v SET "originalFilename" = lower(replace(v.title, ' ', '_')) || '.mp4',
       "durationSec" = 10 + 37 * right(v.title, 1)::int + length(v.title)
     FROM "User" u WHERE u.id = v."authorId" AND u.username = $1`,
    [owner.username],
  );
  runSql(
    `UPDATE "Video" v SET "uploadedSize" = 123456789 FROM "User" u
     WHERE u.id = v."authorId" AND u.username = $1 AND v.title IN ('Studio take 01', 'Studio take 02')`,
    [owner.username],
  );
  runSql(
    `UPDATE "VideoAccess" va SET inbox = true FROM "User" u
     WHERE u.id = va."holderId" AND u.username = $1 AND va."categoryId" IS NULL`,
    [owner.username],
  );
  const page = await ctx.newPage();
  await page.goto(`/@${owner.username}`);
  const inbox = page.getByRole('button', { name: /^Inbox/ }).first();
  await expect(inbox).toContainText('3');
  await inbox.click();

  // One by one: a tidier title offered, a category in one click, and the next one comes.
  await page.getByTestId('start-triage').click();
  const triage = page.getByTestId('inbox-triage');
  await expect(triage.getByTestId('triage-progress')).toHaveText('1 of 3');
  await expect(triage.getByTestId('triage-tidy')).toContainText('Summer on the lake');
  await triage.getByTestId('triage-tidy').click();
  await triage.getByTestId('triage-category').filter({ hasText: 'Studio' }).click();
  await expect(triage.getByTestId('triage-progress')).toHaveText('2 of 3');
  await triage.getByTestId('triage-keep').click();
  await expect(triage.getByTestId('triage-progress')).toHaveText('3 of 3');
  // Closed with Escape, the shelf still shows what was sorted.
  await page.keyboard.press('Escape');
  await expect(inbox).toContainText('1');
  await expect(page.getByRole('button', { name: /^Studio/ }).first()).toContainText('5');

  // Tidy titles of several at once, before → after first.
  await page
    .getByRole('button', { name: /^All videos/ })
    .first()
    .click();
  // The first was renamed in the triage; the other two still carry the file's words.
  for (const t of [/^Summer_on_the\.lake 1080p 02/, /^Summer_on_the\.lake 1080p 03/])
    await tile(page, t).click({ modifiers: ['ControlOrMeta'] });
  await page.getByTestId('bulk-titles').click();
  const cleanup = page.getByTestId('title-cleanup');
  await expect(cleanup.getByTestId('cleanup-preview')).toContainText('Summer on the lake 02');
  await cleanup.getByTestId('cleanup-apply').click();
  await expect(tile(page, /^Summer on the lake 03/)).toBeVisible();
  await page.keyboard.press('Escape');

  // The same file twice: keep one, the other goes to the trash.
  await page.getByTestId('open-duplicates').click();
  const dups = page.getByTestId('duplicates');
  await expect(dups.getByTestId('duplicate-group')).toHaveCount(1);
  await dups.getByTestId('duplicate-keep').first().click();
  await page.getByRole('button', { name: 'Remove the others' }).click();
  await expect(dups.getByTestId('duplicates-none')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^All videos/ }).first()).toContainText('6');

  // An upload of a file the shelf has: held back with a word, skipped on request.
  await page.getByTestId('upload-input').setInputFiles({
    name: 'studio_take_03.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.alloc(4096),
  });
  await expect(page.getByTestId('upload-duplicate')).toContainText('Studio take 03');
  await page.getByTestId('upload-skip').click();
  await expect(page.getByTestId('upload-duplicate')).toHaveCount(0);
});

/** Pinned on top of "All videos", the owner's table, a category's cover. */
test('the owner pins videos on top, sorts the table by a column and picks a category cover', async ({
  browser,
}) => {
  const owner = newUser('pins');
  const ctx = await registerViaApi(browser, owner);
  seedVideos(owner.username, 'Clip', 6, 'PUBLIC', 60);
  file(owner.username, { Best: 'Clip 0' });
  runSql(
    `UPDATE "Video" v SET "durationSec" = 10 * right(v.title, 1)::int, "thumbnailKey" = 'seeded/t.jpg'
     FROM "User" u WHERE u.id = v."authorId" AND u.username = $1`,
    [owner.username],
  );
  const page = await ctx.newPage();
  await page.goto(`/@${owner.username}`);
  await tile(page, /^Clip 03/).click({ button: 'right' });
  await page.getByTestId('pin').click();
  const strip = page.getByTestId('featured');
  await expect(strip.getByRole('button', { name: /^Clip 03/ })).toBeVisible();
  // Visitors see it on top too.
  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/@${owner.username}`);
  await expect(guest.getByTestId('featured')).toContainText('Clip 03');
  // Unpinned from the strip's own menu.
  await strip.getByRole('button', { name: /^Clip 03/ }).click({ button: 'right' });
  await page.getByTestId('unpin').click();
  await expect(strip).toHaveCount(0);

  // The table: a header per column, the longest first, then the other way.
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByTestId('table-head')).toBeVisible();
  const rows = page.locator('app-library-tile');
  await page.getByTestId('sort-duration').click();
  await expect(rows.first()).toContainText('Clip 06');
  await expect(page.getByTestId('sort-duration')).toHaveAttribute('aria-sort', 'descending');
  await page.getByTestId('sort-duration').click();
  await expect(rows.first()).toContainText('Clip 01');
  await expect(rows.first().getByTestId('tile-category')).toHaveText('Best');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();

  // A category's card shows the picture its owner picks.
  await page.getByRole('button', { name: /^Best/ }).first().click();
  await tile(page, /^Clip 02/).click({ button: 'right' });
  await page.getByTestId('category-cover').click();
  await expect(page.getByText('The category’s cover is set')).toBeVisible();
  const folders = await (
    await guest.request.get(`/api/users/${owner.username}/collection/folders`)
  ).json();
  expect(folders.folders[0].pictures.map((p: { videoId: string }) => p.videoId)).toEqual([
    videoId(owner.username, 'Clip 02'),
  ]);
});

/**
 * A category's rows are counted in tiles — a stack is one tile, however many videos it
 * holds. Ten stacks of twelve used to show as the three the first 32 videos folded into.
 */
test('a category of stacks fills its rows: the preview counts tiles, not videos', async ({
  browser,
}) => {
  const owner = newUser('stkrow');
  const ctx = await registerViaApi(browser, owner);
  seedVideos(owner.username, 'Pack', 120, 'PUBLIC', 60);
  file(owner.username, { Packs: 'Pack' });
  const ids = (
    runSql(
      `SELECT v.id FROM "Video" v JOIN "User" u ON u.id = v."authorId" WHERE u.username = $1 ORDER BY v."createdAt" DESC`,
      [owner.username],
    ) as { id: string }[]
  ).map((r) => r.id);
  for (let i = 0; i < 10; i++) {
    const r = await ctx.request.post('/api/me/collection/stacks', {
      headers: xhr,
      data: { videoIds: ids.slice(i * 12, i * 12 + 12) },
    });
    expect(r.ok(), `stack ${i}: ${r.status()}`).toBe(true);
  }
  await put(ctx, '/api/me/page', { grouping: 'category', firstView: 'videos', categoryRows: 2 });

  const guest = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await guest.goto(`/@${owner.username}`);
  const packs = guest.locator('[data-testid^="section-cat-"]').filter({ hasText: 'Packs' });
  await expect(packs.locator('app-stack-tile').first()).toBeVisible();
  // More than the three stacks the first page of videos held: the rows are filled with tiles.
  await expect.poll(() => packs.locator('app-stack-tile').count()).toBeGreaterThan(3);
});

import { type Page, expect, test } from '@playwright/test';

import { login, markProcessing, newUser, registerAndVerify, seedVideos, setTier } from './account';
import { GRAY_VIDEO } from './global-setup';
import {
  type Box,
  type Luma,
  apart,
  boundsOf,
  grow,
  screenshotLuma,
  videoFrameLuma,
} from './pictures';
import { codeOf, tile, tileAction, uploadAndWaitReady, uploadSampleAndWaitReady } from './videos';

const author = newUser('edit');
let videoId = '';

/** What the editor's API says of the video: its source and the edit it shows. */
async function editState(page: Page, id: string) {
  const res = await page.request.get(`/api/videos/${id}/edit`);
  return { status: res.status(), body: res.ok() ? await res.json() : null };
}

// On grey (~128): a timer's plate is black, a caption's ~67, the text ~245.
const DARK = (v: number) => v < 60;
const PLATE = (v: number) => v < 100;
const INK = (v: number) => v > 176;

/** A plate in a picture: its own edges, and those of its text. */
function plateIn(l: Luma, near: Box, plate: (v: number) => boolean) {
  const box = boundsOf(l, grow(near, 8), plate);
  return { box, ink: boundsOf(l, box, INK) };
}

/**
 * The timer's and the caption's plates as the editor's stage shows them, in pixels of the result
 * (`out` wide): from the page's layout, and from what is on the screen.
 */
async function stagePlates(page: Page, out: number) {
  const stage = page.getByTestId('editor-stage');
  const at = (await stage.boundingBox())!;
  const rects = await page.evaluate(() => {
    const r = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    };
    const timer = document.querySelector('[data-testid="stage-timer-0"]')!;
    const caption = document.querySelector('[data-testid="stage-caption-0"]')!;
    return { frame: r(timer.parentElement!), timer: r(timer), caption: r(caption) };
  });
  const k = (rects.frame.right - rects.frame.left) / out;
  // Page pixels → result pixels; screenshot pixels → result pixels.
  const toOut = (b: Box): Box => ({
    left: (b.left - rects.frame.left) / k,
    top: (b.top - rects.frame.top) / k,
    right: (b.right - rects.frame.left) / k,
    bottom: (b.bottom - rects.frame.top) / k,
  });
  const onShot = (b: Box): Box => ({
    left: b.left - at.x,
    top: b.top - at.y,
    right: b.right - at.x,
    bottom: b.bottom - at.y,
  });
  const fromShot = (b: Box): Box =>
    toOut({
      left: b.left + at.x,
      top: b.top + at.y,
      right: b.right + at.x,
      bottom: b.bottom + at.y,
    });
  const shot = await screenshotLuma(page, await stage.screenshot());
  const seen = (b: Box, plate: (v: number) => boolean) => {
    const found = plateIn(shot, onShot(b), plate);
    return { box: fromShot(found.box), ink: fromShot(found.ink) };
  };
  return {
    timer: { layout: toOut(rects.timer), ...seen(rects.timer, DARK) },
    caption: { layout: toOut(rects.caption), ...seen(rects.caption, PLATE) },
  };
}

/** The picture the watch page's player shows, once it plays. */
async function playerSize(page: Page): Promise<string> {
  return page
    .getByTestId('player')
    .locator('video')
    .evaluate((v: HTMLVideoElement) => `${v.videoWidth}x${v.videoHeight}`);
}

// The sample clip: 640×360, 4 s, with sound.
test.describe.serial('video editor', () => {
  test.setTimeout(240_000);

  test('Free is offered Pro; on Pro a vertical cut-down edit is saved and played', async ({
    page,
  }) => {
    await registerAndVerify(page, author);
    videoId = await uploadSampleAndWaitReady(page);

    await tile(page, /^sample/i).click();
    await expect(page.getByTestId('player')).toBeVisible();
    await expect(page.getByTestId('edit-video-pro')).toBeVisible();
    await expect(page.getByTestId('edit-video')).toHaveCount(0);

    setTier(author.username, 'PREMIUM');
    await page.reload();
    await page.getByTestId('edit-video').click();
    await expect(page).toHaveURL(`/edit/${videoId}`);
    const stage = page.getByTestId('editor-stage');
    await expect(stage).toBeVisible();
    // The editor plays the original, not what the viewers see.
    await expect
      .poll(() => stage.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), {
        timeout: 20_000,
      })
      .toBe(640);

    // A horizontal clip becomes vertical.
    await page.getByTestId('aspect-9:16').click();
    await expect(page.getByTestId('result-size')).toHaveText('Result: 202 × 360');
    await expect(page.getByTestId('stage-crop')).toBeVisible();

    // A piece out of the middle: 1 s → 3 s.
    await page.getByTestId('editor-tab-time').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('editor-time')).toContainText('0:01.0 /');
    await page.getByTestId('add-cut').click();
    await expect(page.getByText('The result is 0:02.0 long')).toBeVisible();

    // A timer, a caption and a blurred area from the start.
    await page.keyboard.press('ArrowLeft');
    await page.getByTestId('editor-tab-timer').click();
    await page.getByTestId('add-timer').click();
    await expect(page.getByTestId('stage-timer-0')).toBeVisible();
    await page.getByTestId('editor-tab-caption').click();
    await page.getByTestId('add-caption').click();
    await page.getByTestId('caption-text-0').fill('Привет, world');
    await expect(page.getByTestId('stage-caption-0')).toContainText('Привет, world');
    await page.getByTestId('editor-tab-blur').click();
    await page.getByTestId('add-blur').click();
    const area = page.getByTestId('stage-blur-0');
    await expect(area).toBeVisible();
    // It moves where it is dragged: the crop's frame over it does not take the pointer.
    const at = (await area.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 24, at.y + at.height / 2 + 12, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await area.boundingBox())!.x).toBeGreaterThan(at.x + 12);
    await page.getByTestId('editor-tab-sound').click();
    await page.getByTestId('normalize').check();

    // Undo takes back the last step, redo puts it back.
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('normalize')).not.toBeChecked();
    await page.keyboard.press('Control+Shift+Z');
    await expect(page.getByTestId('normalize')).toBeChecked();

    // Into the same video, for good: said once more.
    await page.getByTestId('editor-save').click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('The previous one can’t be brought back');
    await confirm.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('editor-job')).toBeVisible();
    await expect(page.getByText('The edit is ready: everyone sees it now.')).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByTestId('editor-job')).toHaveCount(0);
    await expect(page.getByTestId('editor-save')).toBeDisabled();

    // The editor starts again on the new version: vertical, two seconds, nothing left to undo.
    const { body } = await editState(page, videoId);
    expect(body).not.toHaveProperty('applied');
    expect(body.source).toMatchObject({ width: 202, height: 360 });
    await expect
      .poll(
        () =>
          page
            .getByTestId('editor-stage')
            .locator('video')
            .evaluate((v: HTMLVideoElement) => v.videoWidth),
        { timeout: 20_000 },
      )
      .toBe(202);
    await expect(page.getByTestId('editor-time')).toContainText('/ 0:02');
    await expect(page.getByTestId('stage-caption-0')).toHaveCount(0);
    await expect(page.getByTestId('undo')).toBeDisabled();

    // The watch page plays the edit: vertical and two seconds long.
    await page.getByRole('link', { name: 'Back to the video' }).click();
    await expect(page.getByTestId('video-specs')).toContainText('202×360');
    await expect(page.getByTestId('video-specs')).toContainText('0:02');
    await expect.poll(() => playerSize(page), { timeout: 20_000 }).toBe('202x360');
  });

  test('a square copy from the library, made from the edited version', async ({
    page,
    context,
  }) => {
    await login(page, author);
    // From the own shelf's context menu. The video is its edit now: nothing to go back to.
    await page.goto(`/@${author.username}`);
    await tileAction(page, /^sample/i, 'Edit video…');
    await expect(page).toHaveURL(`/edit/${videoId}`);
    await expect(page.getByTestId('editor-stage')).toBeVisible();
    await expect(page.getByTestId('editor-save')).toBeDisabled();
    await page.getByTestId('aspect-1:1').click();
    await expect(page.getByTestId('result-size')).toHaveText('Result: 202 × 202');
    // The shelf, open in another tab: the copy comes onto it at once, being made, right after
    // the original.
    const shelf = await context.newPage();
    await shelf.goto(`/@${author.username}`);
    await expect(tile(shelf, /^sample$/i)).toBeVisible();
    await page.getByTestId('editor-save-copy').click();
    const making = tile(shelf, /^sample \(edited\)/i);
    await expect(making).toContainText('Editing', { timeout: 20_000 });
    const labels = await shelf
      .locator('[data-video-id]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    const at = labels.findIndex((l) => /^sample(, |$)/i.test(l));
    expect(labels[at + 1]).toMatch(/^sample \(edited\)/i);
    await shelf.close();
    const toast = page.getByTestId('toast-with-action');
    await expect(toast).toContainText('The copy is ready', { timeout: 120_000 });
    await toast.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: /^sample/i })).toBeVisible();

    // The copy is a video of its own, processed like an upload; the original is untouched.
    // /v/<id> lands on the copy's own short link.
    await expect(page).not.toHaveURL(/\/v\//);
    const code = new URL(page.url()).pathname.slice(1);
    const ctx = await page.request.get(`/api/videos/code/${code}`);
    const copyId = ((await ctx.json()) as { id: string }).id;
    expect(copyId).not.toBe(videoId);
    await expect
      .poll(async () => (await editState(page, copyId)).body?.source?.width ?? null, {
        timeout: 90_000,
      })
      .toBe(202);
    expect((await editState(page, copyId)).body.source.height).toBe(202);
    expect((await editState(page, videoId)).body.source).toMatchObject({ width: 202, height: 360 });
  });

  test('timer and caption in the editor are where the video has them, to the pixel; the page may go meanwhile', async ({
    page,
    context,
  }) => {
    await login(page, author);
    await page.goto(`/@${author.username}`);
    const id = await uploadAndWaitReady(page, GRAY_VIDEO, /^gray/i);
    // Opened from the shelf, back leads to the shelf.
    await tileAction(page, /^gray/i, 'Edit video…');
    await expect(page).toHaveURL(`/edit/${id}`);
    await expect(page.getByTestId('editor-back')).toHaveText('Back to the shelf');
    const stage = page.getByTestId('editor-stage');
    await expect
      .poll(() => stage.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), {
        timeout: 20_000,
      })
      .toBe(640);
    await page.getByTestId('aspect-1:1').click();
    await expect(page.getByTestId('result-size')).toHaveText('Result: 360 × 360');
    await page.getByTestId('editor-tab-timer').click();
    await page.getByTestId('add-timer').click();
    await page.getByTestId('editor-tab-caption').click();
    await page.getByTestId('add-caption').click();
    await page.getByTestId('caption-text-0').fill('HH\nHH');
    // The playhead to 1.2 s: the timer reads 0:01.
    await page.getByTestId('editor-time').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('editor-time')).toContainText('0:01.2 /');
    await page.getByTestId('editor-result').click();
    await expect(page.getByTestId('stage-timer-0')).toContainText('0:01');
    await page.waitForTimeout(300);
    const preview = await stagePlates(page, 360);
    // What the stage shows is what its layout says.
    for (const p of [preview.timer, preview.caption])
      expect(apart(p.box, p.layout)).toBeLessThan(1);

    // Leaving by the header with changes not saved asks first, as "Back" does.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'My page' }).click();
    const leave = page.getByRole('alertdialog');
    await expect(leave).toContainText('Leave without saving?');
    await leave.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(`/edit/${id}`);

    // Saved, then the page left at once and the tab closed: the server finishes alone.
    await page.getByTestId('editor-save').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('editor-leave-hint')).toContainText(
      'No need to wait on this page',
    );
    await page.getByTestId('editor-back').click();
    await expect(page).toHaveURL(`/@${author.username}`);
    // On the shelf it is being edited: it says so and does not open.
    const busy = tile(page, /^gray/i);
    await expect(busy).toContainText('Editing');
    await busy.click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(`/@${author.username}`);
    await page.close();
    const again = await context.newPage();
    await expect
      .poll(
        async () => {
          const { body } = await editState(again, id);
          return !!body && body.job === null && body.source.width === 360;
        },
        { timeout: 120_000 },
      )
      .toBe(true);

    // The saved video at the same moment: its plates are the stage's.
    await again.goto(`/${await codeOf(again, id)}`);
    const video = again.getByTestId('player').locator('video');
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
      .toBe(360);
    await video.evaluate(async (v: HTMLVideoElement) => {
      v.muted = true;
      v.pause();
      const seeked = new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      v.currentTime = 1.2;
      await seeked;
    });
    const frame = await videoFrameLuma(video);
    const timer = plateIn(frame, preview.timer.layout, DARK);
    const caption = plateIn(frame, preview.caption.layout, PLATE);
    expect(apart(timer.box, preview.timer.layout)).toBeLessThanOrEqual(1);
    expect(apart(caption.box, preview.caption.layout)).toBeLessThanOrEqual(1);
    expect(apart(timer.ink, preview.timer.ink)).toBeLessThanOrEqual(1.5);
    expect(apart(caption.ink, preview.caption.ink)).toBeLessThanOrEqual(1.5);
    await again.close();
  });

  test('a video still processing does not open from the shelf', async ({ page }) => {
    await login(page, author);
    seedVideos(author.username, 'Busy clip', 1, 'PRIVATE');
    markProcessing(author.username, 'Busy clip 01');
    await page.goto(`/@${author.username}`);
    const busy = tile(page, /^Busy clip 01/);
    await expect(busy).toBeVisible();
    await busy.click();
    await busy.press('Enter');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`/@${author.username}`);
    // The menu offers what can be done with it, but not "Open".
    await busy.click({ button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Open', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    // A ready one next to it opens as before.
    await tile(page, /^sample$/i)
      .first()
      .click();
    await expect(page.getByTestId('player')).toBeVisible();
  });
});

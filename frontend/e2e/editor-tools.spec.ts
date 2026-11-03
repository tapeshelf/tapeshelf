import { type Page, expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify, setTier } from './account';
import { uploadSampleAndWaitReady } from './videos';

const author = newUser('tools');
let videoId = '';

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${videoId}`);
  await expect
    .poll(
      () =>
        page
          .getByTestId('editor-stage')
          .locator('video')
          .evaluate((v: HTMLVideoElement) => v.videoWidth),
      { timeout: 20_000 },
    )
    .toBe(640);
}

const seconds = (text: string): number => {
  const [m, s] = text.trim().split(' / ')[0]!.split(':');
  return Number(m) * 60 + Number(s);
};

// The sample clip: 640×360, 4 s.
test.describe.serial('the editor’s timeline and keys', () => {
  test.setTimeout(180_000);

  test('frames along the track; closer, a click still lands on its moment', async ({ page }) => {
    await registerAndVerify(page, author);
    videoId = await uploadSampleAndWaitReady(page);
    setTier(author.username, 'PREMIUM');
    await openEditor(page);

    const film = page.getByTestId('timeline-film').locator('img');
    await expect(film).toHaveCount(16);
    await expect
      .poll(() => film.first().evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBeGreaterThan(0);

    const track = page.getByTestId('timeline');
    const was = (await track.boundingBox())!;
    await page.getByTestId('timeline-zoom-in').click();
    const now = (await track.boundingBox())!;
    expect(now.width).toBeCloseTo(was.width * 2, 0);

    // A point of the track at three quarters, wherever it has scrolled to.
    await page.getByTestId('timeline-scroller').evaluate((s) => (s.scrollLeft = s.scrollWidth));
    const box = (await track.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect
      .poll(async () => seconds(await page.getByTestId('editor-time').innerText()))
      .toBeCloseTo(3, 0);

    await page.getByTestId('timeline-zoom-out').click();
    expect((await track.boundingBox())!.width).toBeCloseTo(was.width, 0);
    await expect(page.getByTestId('timeline-zoom-out')).toBeDisabled();
  });

  test('I and O set the trim, comma and period step by a frame, in any keyboard layout', async ({
    page,
  }) => {
    await login(page, author);
    await openEditor(page);
    const time = page.getByTestId('editor-time');
    await page.keyboard.press('ArrowRight');
    await expect(time).toContainText('0:01.0 /');
    await page.keyboard.press('KeyI');
    await page.getByTestId('editor-tab-time').click();
    await expect(page.getByText('The result is 0:03.0 long')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('KeyO');
    await expect(page.getByText('The result is 0:01.0 long')).toBeVisible();

    const at = seconds(await time.innerText());
    await page.keyboard.press('Period');
    await expect.poll(async () => seconds(await time.innerText())).toBeGreaterThanOrEqual(at);
    await page.keyboard.press('Comma');
    await page.keyboard.press('Comma');
    await expect.poll(async () => seconds(await time.innerText())).toBeLessThan(at + 0.05);

    // Undo goes by the key's place: Ctrl+Z in a Cyrillic layout gives "я".
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true }),
      );
    });
    await expect(page.getByText('The result is 0:03.0 long')).toBeVisible();
  });

  test('each blur, timer and caption has a layer of its own; dragging one moves only it', async ({
    page,
  }) => {
    await login(page, author);
    await openEditor(page);
    await page.getByTestId('editor-tab-blur').click();
    await page.getByTestId('add-blur').click();
    await page.getByTestId('add-blur').click();
    await page.getByTestId('editor-tab-timer').click();
    await page.getByTestId('add-timer').click();
    await page.getByTestId('add-timer').click();

    const lanes = ['lane-blur-0', 'lane-blur-1', 'lane-timer-0', 'lane-timer-1'];
    const boxes = await Promise.all(lanes.map((l) => page.getByTestId(l).boundingBox()));
    // Each lower than the one before: none shares a row with another.
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);

    // The first blur, shortened from its end: the second, on the same moments, stays as it was.
    const first = page.getByTestId('lane-blur-0').locator('.bar');
    const second = page.getByTestId('lane-blur-1').locator('.bar');
    await page.getByTestId('lane-timer-1').scrollIntoViewIfNeeded();
    const before = (await second.boundingBox())!;
    const bar = (await first.boundingBox())!;
    await page.mouse.move(bar.x + bar.width - 4, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2, { steps: 4 });
    await page.mouse.up();
    expect((await first.boundingBox())!.width).toBeLessThan(bar.width - 20);
    expect(await second.boundingBox()).toEqual(before);
    const shots = process.env['VS_EDITOR_SHOTS'];
    if (shots) await page.screenshot({ path: `${shots}/editor-layers.png`, fullPage: true });
  });

  test('unsaved changes outlive a reload and can be thrown away', async ({ page }) => {
    await login(page, author);
    await openEditor(page);
    await page.getByTestId('aspect-1:1').click();
    await expect(page.getByTestId('result-size')).toHaveText('Result: 360 × 360');
    await page.waitForTimeout(700); // the draft is written a moment after the last change

    page.on('dialog', (d) => void d.accept());
    await openEditor(page);
    await expect(page.getByTestId('result-size')).toHaveText('Result: 360 × 360');
    await expect(page.getByTestId('editor-save')).toBeEnabled();
    const toast = page.getByTestId('toast-with-action');
    await expect(toast).toContainText('Your unsaved changes are back.');
    await toast.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByTestId('result-size')).toHaveText('Result: 640 × 360');
    await expect(page.getByTestId('editor-save')).toBeDisabled();

    // Thrown away, it does not come back.
    await page.waitForTimeout(700);
    await openEditor(page);
    await expect(page.getByTestId('result-size')).toHaveText('Result: 640 × 360');
    await expect(page.getByTestId('toast-with-action')).toHaveCount(0);
  });
});

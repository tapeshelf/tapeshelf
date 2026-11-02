import { closeSync, ftruncateSync, openSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { login, newUser, registerAndVerify } from './account';
import { FIXTURES_DIR, SAMPLE_VIDEO } from './global-setup';
import { tile, tileAction } from './videos';

const user = newUser('up');

test.describe.serial('upload and processing', () => {
  test('uploads a clip, sees it processed, picks a frame and renames it', async ({ page }) => {
    await registerAndVerify(page, user);
    await expect(page.getByRole('heading', { name: 'My videos' })).toBeVisible();
    await expect(page.getByText(/of .* used/)).toBeVisible();

    // Upload straight to S3 through presigned URLs, then the worker processes it.
    await page.getByTestId('upload-input').setInputFiles(SAMPLE_VIDEO);
    const panel = page.getByTestId('upload-panel');
    await expect(panel).toContainText('Uploaded, now processing', { timeout: 30_000 });

    const sample = tile(page, /^sample/i);
    await expect(sample).toBeVisible();
    // The tile's small copy, not the full-size JPEG the live event used to swap in.
    await expect(sample.locator('img[data-thumb]')).toHaveAttribute('src', /\/s07\.webp$/, {
      timeout: 90_000,
    });
    await expect(sample).toContainText('0:04');
    // The picture takes the video's own shape, 640×360.
    const picture = (await sample.locator('[data-morph]').boundingBox())!;
    expect(picture.width / picture.height).toBeCloseTo(640 / 360, 1);

    // Details via the context menu: thumbnail from a frame, the sensitive mark, rename.
    await tileAction(page, /^sample/i, 'Edit');
    const dialog = page.getByRole('dialog', { name: 'Video details' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/Mark as sensitive/)).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Frame at 0:00', exact: true }).first().click();
    await expect(dialog.getByTestId('edit-thumbnail')).toHaveAttribute('src', /f00\.jpg$/);

    await dialog.getByLabel('Title').fill('Renamed clip');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(tile(page, /^Renamed clip/)).toBeVisible();
    // Frame 0 is the picture now: the small tile copy, or the full one an event brought.
    await expect(tile(page, /^Renamed clip/).locator('img[data-thumb]')).toHaveAttribute(
      'src',
      /\/(f00\.jpg|s00\.webp)$/,
    );

    // The upload panel shows the name once, not the file's name again, and renames in place.
    const expand = panel.getByRole('button', { name: 'Expand' });
    if (await expand.isVisible()) await expand.click(); // tucked away a moment after the upload
    const name = panel.getByRole('textbox', { name: 'Rename' });
    await expect(name).toHaveValue('Renamed clip');
    await expect(panel).not.toContainText('sample.mp4');
    await name.fill('From the panel');
    await name.press('Enter');
    await expect(tile(page, /^From the panel/)).toBeVisible();

    // The panel can be closed once nothing is in flight; the list survives a reload.
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await expect(tile(page, /^From the panel/)).toBeVisible();
  });

  test('a file over the plan’s size limit never starts uploading', async ({ page }) => {
    await login(page, user);
    // The cloud edition's Free tier (.env.test) has a size limit; a self-hosted instance may not.
    const quota = (await (await page.request.get('/api/uploads/quota')).json()) as {
      maxFileBytes: number;
    };
    expect(quota.maxFileBytes).toBeGreaterThan(0);
    // A sparse file one byte over the limit: it takes no disk space and nothing reads it.
    const huge = join(FIXTURES_DIR, 'too-large.mp4');
    const fd = openSync(huge, 'w');
    ftruncateSync(fd, quota.maxFileBytes + 1);
    closeSync(fd);

    const uploadCalls: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/uploads(?!\/quota)/.test(r.url())) uploadCalls.push(`${r.method()} ${r.url()}`);
    });
    await page.getByTestId('upload-input').setInputFiles(huge);
    // Refused in the browser: a toast, no upload session, no panel.
    await expect(page.getByText(/too-large\.mp4 is larger than the .+ limit\./)).toBeVisible();
    await expect(page.getByTestId('upload-panel')).toHaveCount(0);
    expect(uploadCalls).toEqual([]);
  });
});

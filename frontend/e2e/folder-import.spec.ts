import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { newUser, registerAndVerify } from './account';
import { SAMPLE_VIDEO, SAMPLE_VIDEO_2 } from './global-setup';
import { tile } from './videos';

const owner = newUser('fold');

/** Importing a folder makes each subfolder a stack with its name. */
test('a folder is imported: its own files stay single, a subfolder becomes a stack of its name', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await registerAndVerify(page, owner);
  const root = test.info().outputPath('Trip');
  mkdirSync(join(root, 'Day 1', 'Late'), { recursive: true });
  copyFileSync(SAMPLE_VIDEO, join(root, 'arrival.mp4'));
  copyFileSync(SAMPLE_VIDEO_2, join(root, 'Day 1', 'beach.mp4'));
  copyFileSync(SAMPLE_VIDEO, join(root, 'Day 1', 'Late', 'dinner.mp4'));

  await page.getByTestId('upload-folder-input').setInputFiles(root);
  const panel = page.getByTestId('upload-panel');
  await expect(panel.getByText('Uploaded, now processing')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Day 1, 2 videos' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(tile(page, /^arrival/i)).toBeVisible();
  // The subfolder's videos are inside the stack, not loose on the shelf.
  await expect(tile(page, /^beach/i)).toHaveCount(0);
});

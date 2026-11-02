import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

import {
  SHEET_WIDTH,
  configureSheetFonts,
  formatBytes,
  formatDuration,
  renderContactSheet,
} from './contact-sheet.js';

async function frame(i: number, w = 320, h = 180): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: (i * 16) % 256, g: 80, b: 160 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('contact sheet', () => {
  beforeAll(() => {
    configureSheetFonts(
      resolve('assets'),
      mkdtempSync(join(tmpdir(), 'vs-sheet-')),
    );
  });

  it('renders a 1920 px wide 4×4 sheet with a header', async () => {
    const frames = await Promise.all(
      Array.from({ length: 16 }, (_, i) => frame(i)),
    );
    const result = await renderContactSheet({
      frames,
      title: 'Holiday <in> "Norway" & friends',
      sizeBytes: 734_003_200,
      durationSec: 3725,
      width: 1920,
      height: 1080,
      link: 'http://localhost:4200/v/0199d1c0-1111-7000-8000-000000000001',
      siteName: 'tapeshelf',
    });
    const meta = await sharp(result.jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(SHEET_WIDTH);
    // header 176 + padding 27 + 4 × 260 (462 × 180/320) + 3 × 6 + padding 27
    expect(meta.height).toBe(1288);
    expect(result.height).toBe(1288);
  }, 20_000);

  it('fills missing frames with empty tiles', async () => {
    const frames = await Promise.all(
      Array.from({ length: 10 }, (_, i) => frame(i, 180, 320)),
    );
    const result = await renderContactSheet({
      frames,
      title: 'Portrait',
      sizeBytes: 1024,
      durationSec: 5,
      width: 1080,
      height: 1920,
      link: 'http://localhost:4200/v/x',
      siteName: 'tapeshelf',
    });
    const meta = await sharp(result.jpeg).metadata();
    expect(meta.width).toBe(SHEET_WIDTH);
    expect(meta.height).toBeGreaterThan(3000); // tall tiles for portrait sources
  }, 20_000);

  it('formats sizes and durations like the reference sheet', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(67_764_634)).toBe('64.6 MiB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GiB');
    expect(formatBytes(123 * 1024 ** 2)).toBe('123 MiB');
    expect(formatDuration(123)).toBe('02:03');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

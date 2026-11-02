import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { SETTING_DEFAULTS } from '../settings/settings.defaults.js';
import {
  ThrottleStream,
  attachmentHeader,
  downloadMode,
  monthWindow,
} from './download-rules.js';

describe('download rules', () => {
  const { BASIC, PREMIUM } = SETTING_DEFAULTS.tiers;

  it('Free goes through the wait page, Pro and admins straight to storage', () => {
    expect(downloadMode('USER', BASIC)).toBe('limited');
    expect(downloadMode('USER', PREMIUM)).toBe('direct');
    expect(downloadMode('ADMIN', BASIC)).toBe('direct');
    // Any one limit left on a tier keeps it limited (a self-hosted admin may set just one).
    expect(
      downloadMode('USER', {
        ...PREMIUM,
        downloadConcurrency: 2,
      }),
    ).toBe('limited');
    expect(
      downloadMode('USER', {
        ...BASIC,
        downloadsPerMonth: 0,
        downloadSpeedBytesPerSec: 0,
        downloadConcurrency: 0,
      }),
    ).toBe('direct');
  });

  it.each([
    ['2026-10-14T12:00:00Z', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'],
    ['2026-12-31T23:59:59Z', '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z'],
    ['2027-01-01T00:00:00Z', '2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z'],
  ])('the month of %s starts %s and resets %s (UTC)', (now, start, reset) => {
    expect(monthWindow(new Date(now))).toEqual({
      start: new Date(start),
      resetAt: new Date(reset),
    });
  });

  it('names the file for every browser, keeping the original name', () => {
    expect(attachmentHeader('Отпуск 2026.mp4')).toBe(
      `attachment; filename="_ 2026.mp4"; filename*=UTF-8''%D0%9E%D1%82%D0%BF%D1%83%D1%81%D0%BA%202026.mp4`,
    );
    expect(attachmentHeader('a"b\';(c).mov')).toBe(
      `attachment; filename="a_b_c_.mov"; filename*=UTF-8''a%22b%27%3B%28c%29.mov`,
    );
    expect(attachmentHeader('***')).toContain('filename="video"');
  });

  it('throttles to the given speed without changing the bytes', async () => {
    const data = Buffer.alloc(96 * 1024, 7);
    const chunks: Buffer[] = [];
    const started = Date.now();
    await pipeline(
      Readable.from(
        Array.from({ length: 6 }, (_, i) =>
          data.subarray(i * 16 * 1024, (i + 1) * 16 * 1024),
        ),
      ),
      new ThrottleStream(192 * 1024), // 96 KiB at 192 KiB/s: about half a second
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      }),
    );
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(1500);
    expect(Buffer.concat(chunks).equals(data)).toBe(true);
  });
});

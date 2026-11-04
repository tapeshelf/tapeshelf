import { describe, expect, it } from 'vitest';

import { monthKey, playbackSize } from './traffic-rules.js';

describe('playbackSize', () => {
  it('counts what the player streams', () => {
    expect(
      playbackSize({
        playbackBytes: 100n,
        renderBytes: 200n,
        sizeBytes: 5000n,
      }),
    ).toBe(100);
  });

  it('falls back on the edited file, then the original, while it was never measured', () => {
    expect(
      playbackSize({
        playbackBytes: null,
        renderBytes: 200n,
        sizeBytes: 5000n,
      }),
    ).toBe(200);
    expect(
      playbackSize({
        playbackBytes: null,
        renderBytes: null,
        sizeBytes: 5000n,
      }),
    ).toBe(5000);
  });
});

describe('monthKey', () => {
  it('is the date of the first day in UTC', () => {
    expect(monthKey(new Date(Date.UTC(2026, 10, 1)))).toBe('2026-11-01');
  });
});

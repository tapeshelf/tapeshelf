import { describe, expect, it } from 'vitest';

import {
  keptFrom,
  monthKey,
  playbackSize,
  trafficNotice,
} from './traffic-rules.js';

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

describe('trafficNotice', () => {
  it('says "used up" from the limit on, "running out" from four fifths, nothing below', () => {
    expect(trafficNotice(79, 100)).toBeNull();
    expect(trafficNotice(80, 100)).toBe('runningOut');
    expect(trafficNotice(99, 100)).toBe('runningOut');
    expect(trafficNotice(100, 100)).toBe('usedUp');
    expect(trafficNotice(150, 100)).toBe('usedUp');
  });

  it('says nothing without a limit', () => {
    expect(trafficNotice(1_000_000, 0)).toBeNull();
  });
});

describe('keptFrom', () => {
  it('keeps this month and the two before it, across a year', () => {
    expect(keptFrom(new Date(Date.UTC(2026, 10, 4)))).toEqual(
      new Date(Date.UTC(2026, 8, 1)),
    );
    expect(keptFrom(new Date(Date.UTC(2027, 0, 15)))).toEqual(
      new Date(Date.UTC(2026, 10, 1)),
    );
  });
});

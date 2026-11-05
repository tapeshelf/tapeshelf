import { describe, expect, it } from 'vitest';

import {
  MIN_CLIENT,
  isOlderThan,
  parseClient,
  requiredUpdate,
} from './client-version.js';

describe('X-Tapeshelf-Client', () => {
  it('reads the platform, the version and keeps the header for the list of sessions', () => {
    expect(parseClient('android/1.2.3 (Pixel 8; Android 15)')).toEqual({
      platform: 'android',
      version: [1, 2, 3],
      raw: 'android/1.2.3 (Pixel 8; Android 15)',
    });
    expect(parseClient('ios/10.0.12')?.version).toEqual([10, 0, 12]);
  });

  it('takes nothing else for an app', () => {
    for (const bad of [
      undefined,
      '',
      ['android/1.0.0'],
      'Android/1.0.0',
      'android/1.0',
      'android/1.0.0-beta',
      'windows/1.0.0',
      'android/1.0.0 (Pixel\n8)',
      'android/1.0.0 (Пиксель)',
      `android/1.0.0 (${'x'.repeat(200)})`,
      'android/1.0.0 extra',
    ]) {
      expect(parseClient(bad), String(bad)).toBeNull();
    }
  });

  it('compares versions by number, not by text', () => {
    expect(isOlderThan([0, 9, 0], '0.10.0')).toBe(true);
    expect(isOlderThan([1, 0, 0], '0.10.0')).toBe(false);
    expect(isOlderThan([1, 2, 3], '1.2.3')).toBe(false);
    expect(isOlderThan([1, 2, 2], '1.2.3')).toBe(true);
    expect(isOlderThan([2, 0, 0], '1.9.9')).toBe(false);
  });

  it('asks an app older than the limit to update, and only then', () => {
    const min = MIN_CLIENT.android!;
    expect(requiredUpdate(parseClient('android/0.0.1')!)).toBe(min);
    expect(requiredUpdate(parseClient(`android/${min}`)!)).toBeNull();
    expect(requiredUpdate(parseClient('android/99.0.0')!)).toBeNull();
    // No limit for a platform: every version is welcome.
    expect(requiredUpdate(parseClient('ios/0.0.1')!)).toBeNull();
  });
});

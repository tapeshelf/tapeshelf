import { describe, expect, it } from 'vitest';

import { normalizeVideoCode } from './video-code.js';

describe('normalizeVideoCode', () => {
  it('accepts codes in any case', () => {
    expect(normalizeVideoCode('k3x9ab2')).toBe('k3x9ab2');
    expect(normalizeVideoCode('K3X9AB2')).toBe('k3x9ab2');
  });

  it('rejects page names, look-alikes and wrong lengths', () => {
    for (const raw of [
      'securit',
      'aboutus',
      'k3x9ab0',
      'k3x9abl',
      'k3x9ab',
      'k3x9ab22',
      '',
    ])
      expect(normalizeVideoCode(raw)).toBeNull();
  });
});

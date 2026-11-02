import { describe, expect, it } from 'vitest';

import { qualityLabel } from './quality.pipe';

describe('qualityLabel', () => {
  it('names the usual sizes as YouTube does', () => {
    expect(qualityLabel(3840, 2160)).toBe('4K');
    expect(qualityLabel(2560, 1440)).toBe('1440p');
    expect(qualityLabel(1920, 1080)).toBe('1080p');
    expect(qualityLabel(1280, 720)).toBe('720p');
    expect(qualityLabel(854, 480)).toBe('480p');
    expect(qualityLabel(640, 360)).toBe('360p');
    expect(qualityLabel(320, 240)).toBe('240p');
    expect(qualityLabel(256, 144)).toBe('144p');
  });

  it('vertical, wide and cropped frames by their 16:9 equivalent', () => {
    expect(qualityLabel(1080, 1920)).toBe('1080p');
    expect(qualityLabel(1920, 804)).toBe('1080p');
    expect(qualityLabel(1920, 1036)).toBe('1080p');
    expect(qualityLabel(1080, 1080)).toBe('1080p');
    expect(qualityLabel(404, 720)).toBe('360p');
  });

  it('nothing while the size is unknown', () => {
    expect(qualityLabel(null, 1080)).toBeNull();
    expect(qualityLabel(1920, 0)).toBeNull();
  });
});

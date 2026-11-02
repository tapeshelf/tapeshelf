import { formatBytes } from './bytes.pipe';
import { formatDuration } from './duration.pipe';

describe('format pipes', () => {
  it('formats bytes with one decimal below 100', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
    expect(formatBytes(123 * 1024 ** 2)).toBe('123 MB');
    expect(formatBytes(null)).toBe('');
  });

  it('formats durations as m:ss or h:mm:ss', () => {
    expect(formatDuration(4.4)).toBe('0:04');
    expect(formatDuration(123)).toBe('2:03');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(undefined)).toBe('');
  });
});

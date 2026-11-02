import { FormControl } from '@angular/forms';

import { TITLE_MAX, titleOr } from './limits';
import { notBlank } from './validation';

describe('titleOr', () => {
  it('keeps a title that fits', () => {
    expect(titleOr('  My holiday ', 'file.mp4')).toBe('My holiday');
  });

  it('falls back to the file name, cut to a title’s length', () => {
    const name = `${'a'.repeat(240)}.mp4`;
    const title = titleOr('   ', name);
    expect(title).toHaveLength(TITLE_MAX);
    expect(title.startsWith('aaa')).toBe(true);
  });

  it('never cuts an emoji in half', () => {
    const title = titleOr('x'.repeat(TITLE_MAX - 1) + '🎬🎬', 'f');
    expect(Array.from(title)).toHaveLength(TITLE_MAX);
    expect(title.endsWith('🎬')).toBe(true);
  });

  it('is never blank', () => {
    expect(titleOr('', '  ')).toBe('Video');
  });
});

describe('notBlank', () => {
  it('takes a name of spaces alone for no name', () => {
    expect(notBlank(new FormControl('   '))).toEqual({ required: true });
    expect(notBlank(new FormControl(''))).toEqual({ required: true });
    expect(notBlank(new FormControl(' Ann '))).toBeNull();
  });
});

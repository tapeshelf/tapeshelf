import { DEFAULT_CLEANUP, cleanTitle } from './clean-title';

describe('cleanTitle', () => {
  it('turns a file name into a title', () => {
    expect(cleanTitle('Anna Berg_Summer-on-the-lake-shore-1080p')).toBe(
      'Anna Berg Summer on the lake shore',
    );
    expect(cleanTitle('my.holiday.2025.mp4')).toBe('My holiday 2025');
    expect(cleanTitle('sunset_at_sea [YTS.MX] x264 WEB-DL')).toBe('Sunset at sea');
    expect(cleanTitle('garden_party (720p).mov')).toBe('Garden party');
  });

  it('leaves numbers and plain titles alone, and is never empty', () => {
    expect(cleanTitle('2-25')).toBe('2-25');
    expect(cleanTitle('Anna returns')).toBe('Anna returns');
    expect(cleanTitle('1080p')).toBe('1080p');
    expect(cleanTitle('Озеро_Байкал-зимой')).toBe('Озеро Байкал зимой');
  });

  it('does only what is asked, with a find and replace of its own', () => {
    expect(cleanTitle('foo_bar', { ...DEFAULT_CLEANUP, separators: false })).toBe('Foo_bar');
    expect(cleanTitle('foo bar', { ...DEFAULT_CLEANUP, capitalize: false })).toBe('foo bar');
    expect(
      cleanTitle('Clip by SomeSite – part 1', {
        ...DEFAULT_CLEANUP,
        find: 'by somesite',
        replace: '',
      }),
    ).toBe('Clip – part 1');
  });
});

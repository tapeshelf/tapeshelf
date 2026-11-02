import { stripArgs } from './source-metadata.js';

describe('stripArgs', () => {
  it('copies video (no covers), sound and subtitles, drops every tag, chapter and mark', () => {
    const args = stripArgs('/w/original.mp4', '/w/clean.mp4', 2).join(' ');
    expect(args).toContain('-i /w/original.mp4');
    expect(args).toContain('-map 0:V -map 0:a? -map 0:s? -c copy');
    expect(args).toContain(
      '-map_metadata -1 -map_chapters -1 -fflags +bitexact -f mp4 /w/clean.mp4',
    );
  });

  it('names the container outright (an .m4v is no raw MPEG-4 stream); MKV for the fallback', () => {
    expect(stripArgs('a.m4v', 'clean.m4v').join(' ')).toContain(
      '-f mp4 clean.m4v',
    );
    expect(stripArgs('a.mp4', 'clean.mkv').join(' ')).toContain(
      '-f matroska clean.mkv',
    );
    expect(stripArgs('a.flv', 'clean.flv')).not.toContain('-f');
  });
});

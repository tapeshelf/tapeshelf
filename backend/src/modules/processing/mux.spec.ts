import { muxArgs } from './mux.js';

describe('muxing two tracks', () => {
  it('takes the video of the first file and the audio of the second, copied, into the container asked', () => {
    const args = muxArgs('/w/v.mp4', '/w/a.m4a', '/w/muxed.mp4', 2);
    expect(args).toEqual(
      expect.arrayContaining([
        '-i',
        '/w/v.mp4',
        '-i',
        '/w/a.m4a',
        '-c',
        'copy',
      ]),
    );
    expect(args.join(' ')).toContain('-map 0:V:0 -map 1:a:0');
    expect(args.slice(-3)).toEqual(['-f', 'mp4', '/w/muxed.mp4']);
    expect(muxArgs('/w/v.webm', '/w/a.webm', '/w/muxed.mkv').slice(-3)).toEqual(
      ['-f', 'matroska', '/w/muxed.mkv'],
    );
  });
});

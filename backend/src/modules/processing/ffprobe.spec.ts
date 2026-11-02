import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  analyzeProbe,
  demoRejection,
  probeFile,
  type FfprobeJson,
  type FfprobeStream,
} from './ffprobe.js';

function video(over: Partial<FfprobeStream> = {}): FfprobeStream {
  return {
    codec_type: 'video',
    codec_name: 'h264',
    profile: 'High',
    level: 40,
    pix_fmt: 'yuv420p',
    width: 1920,
    height: 1080,
    avg_frame_rate: '30/1',
    r_frame_rate: '30/1',
    ...over,
  };
}

function audio(over: Partial<FfprobeStream> = {}): FfprobeStream {
  return {
    codec_type: 'audio',
    codec_name: 'aac',
    channels: 2,
    sample_rate: '48000',
    ...over,
  };
}

function probe(streams: FfprobeStream[], duration = 120): FfprobeJson {
  return { format: { duration: String(duration) }, streams };
}

function ok(json: FfprobeJson, kf: number | null = 2) {
  const r = analyzeProbe(json, kf);
  if (!r.ok) throw new Error(`unexpected reject ${r.reason}`);
  return r.summary;
}

describe('analyzeProbe', () => {
  it('remuxes a compatible h264/aac file', () => {
    const s = ok(probe([video(), audio()]));
    expect(s.decision).toBe('remux');
    expect(s.reasons).toEqual([]);
    expect(s.audioNeedsTranscode).toBe(false);
    expect(s.displayWidth).toBe(1920);
    expect(s.displayHeight).toBe(1080);
    expect(s.durationSec).toBe(120);
  });

  it('keeps portrait 1080x1920 on the remux path (long side rule)', () => {
    expect(ok(probe([video({ width: 1080, height: 1920 })])).decision).toBe(
      'remux',
    );
  });

  it('full-range 8-bit (yuvj420p) is repackaged, not converted', () => {
    expect(ok(probe([video({ pix_fmt: 'yuvj420p' })])).decision).toBe('remux');
    expect(ok(probe([video({ pix_fmt: 'yuv422p' })])).decision).toBe(
      'transcode',
    );
  });

  it.each([
    ['vp9', video({ codec_name: 'vp9' }), /codec vp9/],
    [
      'High 10',
      video({ profile: 'High 10', pix_fmt: 'yuv420p10le' }),
      /profile High 10/,
    ],
    ['level 5.1', video({ level: 51 }), /level 51/],
    ['4K', video({ width: 3840, height: 2160 }), /resolution 3840x2160/],
    [
      'rotation',
      video({ side_data_list: [{ rotation: -90 }] }),
      /rotation 270/,
    ],
    ['hdr', video({ color_transfer: 'smpte2084' }), /hdr smpte2084/],
  ])('transcodes: %s', (_name, v, reason) => {
    const s = ok(probe([v, audio()]));
    expect(s.decision).toBe('transcode');
    expect(s.reasons.join('; ')).toMatch(reason);
  });

  it('swaps display dimensions for rotated sources', () => {
    const s = ok(probe([video({ side_data_list: [{ rotation: 90 }] })]));
    expect([s.displayWidth, s.displayHeight]).toEqual([1080, 1920]);
    expect(s.video.rotation).toBe(90);
  });

  it('transcodes when keyframes are too far apart, and only checks that for remux candidates', () => {
    expect(ok(probe([video()]), 30).decision).toBe('transcode');
    expect(ok(probe([video()]), 30).reasons[0]).toMatch(
      /keyframe interval 30.0s/,
    );
    expect(ok(probe([video()]), null).decision).toBe('remux');
  });

  it('remuxes video but re-encodes non-AAC audio', () => {
    const s = ok(probe([video(), audio({ codec_name: 'mp3' })]));
    expect(s.decision).toBe('remux');
    expect(s.audioNeedsTranscode).toBe(true);
  });

  it('ignores cover-art streams when looking for the video stream', () => {
    const cover = video({
      codec_name: 'mjpeg',
      disposition: { attached_pic: 1 },
    });
    const r = analyzeProbe(probe([cover, audio()]), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('noVideoStream');
  });

  it('takes a source faster than 60 fps and encodes it; 59.94 and 60.03 still count as 60', () => {
    const fast = ok(probe([video({ avg_frame_rate: '75/1' })]));
    expect(fast.decision).toBe('transcode');
    expect(fast.reasons).toContain('fps 75.00');
    for (const rate of ['60000/1001', '6003/100', '60/1'])
      expect(ok(probe([video({ avg_frame_rate: rate })])).decision).toBe(
        'remux',
      );
  });

  it.each([
    ['noVideoStream', probe([audio()])],
    ['zeroDuration', probe([video()], 0)],
    ['tooLong', probe([video()], 13 * 3600)],
    ['tooLarge', probe([video({ width: 8192, height: 4320 })])],
    [
      'tooManyStreams',
      probe([video(), ...Array.from({ length: 20 }, () => audio())]),
    ],
    ['corrupted', probe([video({ width: 0, height: 0 })])],
  ])('rejects: %s', (reason, json) => {
    const r = analyzeProbe(json, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe('demoRejection', () => {
  it('takes up to ten minutes of 1080p, portrait included', () => {
    expect(demoRejection(ok(probe([video(), audio()], 600)))).toBeNull();
    expect(
      demoRejection(ok(probe([video({ width: 1080, height: 1920 })]))),
    ).toBeNull();
  });

  it('refuses a longer video and a larger frame', () => {
    expect(demoRejection(ok(probe([video()], 601)))).toBe('duration 601s');
    expect(
      demoRejection(ok(probe([video({ width: 2560, height: 1440 })]))),
    ).toBe('frame 2560x1440');
    expect(
      demoRejection(ok(probe([video({ width: 1440, height: 1440 })]))),
    ).toBe('frame 1440x1440');
  });
});

describe('probeFile on what someone uploaded', () => {
  it('refuses a playlist named like a video: it would open other files on this machine', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'probe-'));
    const fake = join(dir, 'movie.mp4');
    await writeFile(
      fake,
      '#EXTM3U\n#EXTINF:6,\n/etc/hostname\n#EXT-X-ENDLIST\n',
    );
    const outcome = await probeFile(fake, {
      ffprobe: process.env['FFPROBE_PATH'] ?? 'ffprobe',
    });
    expect(outcome.ok).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

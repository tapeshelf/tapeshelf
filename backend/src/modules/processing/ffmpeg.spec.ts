import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SCALE_FILTER,
  TONEMAP_FILTER,
  buildHlsArgs,
  extractFrame,
  runHls,
  threadArgs,
} from './ffmpeg.js';

const summary = {
  audio: { codec: 'aac', channels: 2, sampleRate: 48000 },
  audioNeedsTranscode: false,
  hdr: false,
};

describe('ffmpeg threads', () => {
  it('a transcode is held to the budget: decoder and filters before the input, encoder after', () => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'transcode',
      summary,
      tonemap: true,
      threads: 2,
    });
    const input = args.indexOf('-i');
    expect(args.slice(input - 6, input)).toEqual(threadArgs(2));
    expect(args.slice(input + 2, input + 4)).toEqual(['-threads', '2']);
  });

  it('no budget given: ffmpeg decides, as before', () => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'remux',
      summary,
      tonemap: false,
    });
    expect(args).not.toContain('-threads');
    expect(threadArgs(0)).toEqual([]);
  });
});

describe('metadata', () => {
  it('the packaged stream carries none of the source tags or chapters', () => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'remux',
      summary,
      tonemap: false,
    });
    expect(args.join(' ')).toContain(
      '-map 0:v:0 -map_metadata -1 -map_chapters -1',
    );
  });
});

describe('transcode preset', () => {
  it('veryfast: the server converts on two shared cores', () => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'transcode',
      summary,
      tonemap: false,
    });
    expect(args[args.indexOf('-preset') + 1]).toBe('veryfast');
  });
});

describe('faster than 60 fps', () => {
  const vf = (fps: number) => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'transcode',
      summary: { ...summary, video: { fps } },
      tonemap: false,
    });
    return args[args.indexOf('-vf') + 1]!;
  };
  it('is dropped to 60 before anything else works on the frames', () => {
    expect(vf(75)).toMatch(/^fps=60,scale=/);
    expect(vf(240)).toMatch(/^fps=60,/);
  });
  it('60 and its near rates are left as they are', () => {
    expect(vf(60.03)).not.toContain('fps=');
    expect(vf(59.94)).not.toContain('fps=');
  });
});

describe('HDR', () => {
  it('is tone-mapped after the scaling: on at most 1080p, not on the whole 4K frame', () => {
    const args = buildHlsArgs('in.mp4', '/out', {
      mode: 'transcode',
      summary: { ...summary, hdr: true, video: { fps: 75 } },
      tonemap: true,
    });
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toBe(`fps=60,${SCALE_FILTER},${TONEMAP_FILTER}`);
  });
});

/** A stand-in for ffmpeg: a script that prints progress lines as told, then waits or ends. */
async function fakeFfmpeg(dir: string, body: string): Promise<string> {
  const path = join(dir, 'ffmpeg');
  await writeFile(path, `#!/usr/bin/env node\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

describe('slow encodes are let finish, stuck ones are stopped', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ffmpeg-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a run that keeps moving outlives the stall window', async () => {
    // Three seconds in all, twice the window, a step every 0.3 s: five times the room a busy
    // machine needs to start the stand-in (at 0.1 s steps in a 0.4 s window it failed under load).
    const ffmpeg = await fakeFfmpeg(
      dir,
      `let t = 0; const i = setInterval(() => { t += 6e5; console.log('out_time_us=' + t); if (t >= 6e6) { clearInterval(i); } }, 300);`,
    );
    const seen: number[] = [];
    await runHls([], {
      ffmpeg,
      durationSec: 6,
      stallMs: 1500,
      onProgress: (f) => seen.push(f),
    });
    expect(seen.at(-1)).toBe(1);
  });

  it('a run that stops moving is killed with a clear reason', async () => {
    const ffmpeg = await fakeFfmpeg(
      dir,
      `console.log('out_time_us=2000000'); setInterval(() => console.log('out_time_us=2000000'), 50);`,
    );
    await expect(
      runHls([], { ffmpeg, durationSec: 60, stallMs: 400 }),
    ).rejects.toThrow('no progress for 0 min at 2.0s');
  });
});

describe('a frame for the contact sheet', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'frame-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to the nearest keyframe when the exact one does not come in time', async () => {
    // Hangs on an exact seek, writes the picture with -noaccurate_seek.
    const ffmpeg = await fakeFfmpeg(
      dir,
      `const a = process.argv; if (!a.includes('-noaccurate_seek')) setInterval(() => {}, 1000); else require('fs').writeFileSync(a[a.length - 1], 'jpg');`,
    );
    const out = join(dir, 'f0.jpg');
    await extractFrame('in.mp4', 16.1, out, { ffmpeg, timeoutMs: 500 });
  });
});

import { execa } from 'execa';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { FPS_CAP, type ProbeSummary, overFpsCap } from './ffprobe.js';
import { TOOL_ENV } from './untrusted-input.js';

export const HLS_SEGMENT_SEC = 6;
export const FRAME_MAX_WIDTH = 1280;

const BASE_ARGS = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];

/** Long side ≤ 1920, aspect kept, even dimensions (portrait videos are not squashed). */
export const SCALE_FILTER =
  "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'";

/** HDR (PQ/HLG) → SDR BT.709; needs an ffmpeg built with zimg, so callers fall back without it. */
export const TONEMAP_FILTER =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

export interface FfmpegOptions {
  ffmpeg: string;
  /** Threads for decoding, filters and encoding; unset = ffmpeg's own (the machine's cores). */
  threads?: number;
}

/**
 * `-threads` before an input sets its decoder's threads, after the inputs the encoder's; filters
 * have their own. Without them ffmpeg sizes everything by the host's cores, whatever the
 * container's CPU quota (cpu-budget.ts).
 */
export function threadArgs(
  threads: number | undefined,
  where: 'input' | 'output' = 'input',
): string[] {
  if (!threads) return [];
  return where === 'input'
    ? [
        '-threads',
        String(threads),
        '-filter_threads',
        String(threads),
        '-filter_complex_threads',
        String(threads),
      ]
    : ['-threads', String(threads)];
}

/**
 * One JPEG frame at `timestampSec`, scaled to at most `maxWidth` wide; ffmpeg applies rotation
 * metadata itself. The exact frame first; when that does not come in time (a starved CPU, keyframes
 * minutes apart) the nearest keyframe instead, then the very start: one picture never fails a video.
 */
export async function extractFrame(
  input: string,
  timestampSec: number,
  outPath: string,
  opts: FfmpegOptions & { maxWidth?: number; timeoutMs?: number },
): Promise<void> {
  const run = (t: number, nearKeyframe: boolean) =>
    execa(
      opts.ffmpeg,
      [
        ...BASE_ARGS,
        ...threadArgs(opts.threads),
        ...(nearKeyframe ? ['-noaccurate_seek'] : []),
        '-ss',
        t.toFixed(3),
        '-i',
        input,
        '-frames:v',
        '1',
        // No encoder comment in the picture.
        '-fflags',
        '+bitexact',
        '-flags:v',
        '+bitexact',
        '-vf',
        `scale='min(${opts.maxWidth ?? FRAME_MAX_WIDTH},iw)':-2`,
        '-q:v',
        '3',
        outPath,
      ],
      { timeout: opts.timeoutMs ?? FRAME_TIMEOUT_MS, ...TOOL_ENV },
    );
  const attempts: [number, boolean][] = [
    [timestampSec, false],
    [timestampSec, true],
    ...(timestampSec > 0 ? ([[0, true]] as [number, boolean][]) : []),
  ];
  let failure: unknown = null;
  for (const [t, near] of attempts) {
    try {
      await run(t, near);
    } catch (err) {
      failure = err;
    }
    if (await exists(outPath)) return;
  }
  throw failure ?? new Error(`no frame produced at ${timestampSec}s`);
}

/** How long one try at a frame may take before the quicker way is tried. */
const FRAME_TIMEOUT_MS = 3 * 60_000;

export interface HlsArgsOptions {
  mode: 'remux' | 'transcode';
  threads?: number;
  summary: Pick<ProbeSummary, 'audio' | 'audioNeedsTranscode' | 'hdr'> & {
    video?: Pick<ProbeSummary['video'], 'fps'>;
  };
  /** Apply the HDR tonemap chain (transcode only). */
  tonemap: boolean;
}

/** Pure: the ffmpeg command line for packaging a source into plain (unencrypted) MPEG-TS HLS. */
export function buildHlsArgs(
  input: string,
  outDir: string,
  opts: HlsArgsOptions,
): string[] {
  const args = [
    ...BASE_ARGS,
    '-progress',
    'pipe:1',
    ...threadArgs(opts.threads),
    '-i',
    input,
    ...threadArgs(opts.threads, 'output'),
    '-map',
    '0:v:0',
    // Nothing of the source's tags (its title became the segments' service name) or chapters.
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
  ];
  if (opts.summary.audio) args.push('-map', '0:a:0');
  if (opts.mode === 'remux') {
    args.push('-c:v', 'copy');
    if (opts.summary.audio)
      args.push(
        ...(opts.summary.audioNeedsTranscode
          ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']
          : ['-c:a', 'copy']),
      );
  } else {
    // Scaled before the tone mapping, which then runs on at most 1080p instead of the whole 4K frame:
    // about half the CPU and a third less memory, the same picture.
    const filters = [SCALE_FILTER];
    if (opts.tonemap && opts.summary.hdr) filters.push(TONEMAP_FILTER);
    // Faster than 60 fps: dropped to 60 first, so nothing after it works on frames that go.
    if (overFpsCap(opts.summary.video?.fps ?? 0))
      filters.unshift(`fps=${FPS_CAP}`);
    args.push(
      '-c:v',
      'libx264',
      // veryfast: one and a half to two times quicker than faster for a tenth more bytes;
      // the server converts on two shared cores.
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-profile:v',
      'high',
      '-level',
      '4.1',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      filters.join(','),
      '-force_key_frames',
      'expr:gte(t,n_forced*4)',
      '-sc_threshold',
      '0',
      '-max_muxing_queue_size',
      '1024',
    );
    if (opts.summary.audio)
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
  }
  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(HLS_SEGMENT_SEC),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'mpegts',
    '-hls_flags',
    'independent_segments',
    '-hls_list_size',
    '0',
    '-hls_segment_filename',
    join(outDir, 'seg_%05d.ts'),
    join(outDir, 'index.m3u8'),
  );
  return args;
}

export interface RunHlsOptions extends FfmpegOptions {
  durationSec: number;
  onProgress?: (fraction: number) => void;
  timeoutMs?: number;
  /** How long ffmpeg may report no progress before it is stopped; HLS_STALL_MS by default. */
  stallMs?: number;
  /** Stops ffmpeg (an editor render that was cancelled). */
  signal?: AbortSignal;
}

/**
 * Runs the packaging command, reporting `out_time / duration` from `-progress pipe:1`. A slow
 * encode is let finish (the worker has a fraction of a small server, and the host may cap it
 * further): ffmpeg is stopped when it has not moved for `stallMs`, or past a generous ceiling.
 */
export async function runHls(
  args: string[],
  opts: RunHlsOptions,
): Promise<void> {
  const proc = execa(opts.ffmpeg, args, {
    ...TOOL_ENV,
    // 20× the video's length, at least two hours: only a ceiling, the stall watch ends a stuck run.
    timeout:
      opts.timeoutMs ?? Math.max(2 * 3600_000, opts.durationSec * 20_000),
    buffer: { stdout: false },
    ...(opts.signal ? { cancelSignal: opts.signal } : {}),
  });
  let last = -1;
  let furthest = -1;
  let movedAt = Date.now();
  let stalled = false;
  const stallMs = opts.stallMs ?? HLS_STALL_MS;
  const watch = setInterval(
    () => {
      if (Date.now() - movedAt < stallMs) return;
      stalled = true;
      proc.kill('SIGKILL');
    },
    Math.min(30_000, stallMs / 4),
  );
  proc.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const m = /^out_time_(us|ms)=(\d+)/.exec(line);
      if (!m) continue;
      const seconds = Number(m[2]) / 1e6; // both keys are microseconds in ffmpeg ≥ 5
      if (seconds > furthest) {
        furthest = seconds;
        movedAt = Date.now();
      }
      if (!(opts.durationSec > 0)) continue;
      const fraction = Math.min(1, seconds / opts.durationSec);
      if (fraction - last >= 0.01) {
        last = fraction;
        opts.onProgress?.(fraction);
      }
    }
  });
  try {
    await proc;
  } catch (err) {
    if (stalled)
      throw new Error(
        `ffmpeg made no progress for ${Math.round(stallMs / 60_000)} min at ${Math.max(0, furthest).toFixed(1)}s`,
      );
    throw err;
  } finally {
    clearInterval(watch);
  }
}

/** No progress for this long and the run is taken for stuck. */
export const HLS_STALL_MS = 15 * 60_000;

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then((s) => s.size > 0)
    .catch(() => false);
}

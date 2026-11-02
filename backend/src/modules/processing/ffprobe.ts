import { execa } from 'execa';
import { TOOL_ENV, UNTRUSTED_INPUT } from './untrusted-input.js';

/** Hard limits: anything beyond is rejected before any work is done. */
export const PROBE_LIMITS = {
  maxDurationSec: 12 * 3600,
  maxDimension: 4096,
  maxStreams: 20,
} as const;

/**
 * The frame rate people watch: a faster source (75, 120, 240 fps) is taken and encoded at
 * 60; its original stays as it was. `FPS_SLACK` lets 59.94, 60.03 and the like count as 60.
 */
export const FPS_CAP = 60;
export const FPS_SLACK = 0.5;

/** Whether a source is faster than the cap and its copy for watching is brought down to it. */
export function overFpsCap(fps: number): boolean {
  return fps > FPS_CAP + FPS_SLACK;
}

/**
 * What the public demo takes: a few minutes, at most 1080p. Everyone shares one
 * account and one machine there; hours of 4K would keep its worker busy for the evening.
 */
export const DEMO_INPUT = {
  maxDurationSec: 10 * 60,
  maxLongSide: 1920,
  maxShortSide: 1080,
} as const;

/** Remux is only allowed when every rule holds. */
export const REMUX_RULES = {
  maxLevel: 42,
  maxLongSide: 1920,
  maxShortSide: 1080,
  maxKeyframeIntervalSec: 8,
} as const;

const H264_PROFILES_OK = new Set([
  'Baseline',
  'Constrained Baseline',
  'Main',
  'High',
]);
const HDR_TRANSFERS = new Set(['smpte2084', 'arib-std-b67']);
const PIX_FMTS_OK = new Set(['yuv420p', 'yuvj420p']);

export type RejectReason =
  | 'corrupted'
  | 'noVideoStream'
  | 'zeroDuration'
  | 'tooLong'
  | 'tooLarge'
  /** No longer given (faster sources are encoded at 60); old failures still carry it. */
  | 'fpsTooHigh'
  | 'tooManyStreams';

export interface VideoStreamInfo {
  codec: string;
  profile: string;
  level: number;
  pixFmt: string;
  /** Coded dimensions (before rotation). */
  width: number;
  height: number;
  fps: number;
  /** 0, 90, 180 or 270. */
  rotation: number;
  colorTransfer: string;
  avgKeyframeIntervalSec: number | null;
}

export interface AudioStreamInfo {
  codec: string;
  channels: number;
  sampleRate: number;
}

export interface ProbeSummary {
  durationSec: number;
  streams: number;
  video: VideoStreamInfo;
  audio: AudioStreamInfo | null;
  /** What the viewer sees: coded size with the rotation applied. */
  displayWidth: number;
  displayHeight: number;
  hdr: boolean;
  decision: 'remux' | 'transcode';
  /** Why a transcode is needed (empty for remux). */
  reasons: string[];
  audioNeedsTranscode: boolean;
}

export type ProbeOutcome =
  | { ok: true; summary: ProbeSummary }
  | { ok: false; reason: RejectReason; detail: string };

/** Subset of `ffprobe -print_format json` we read. */
export interface FfprobeJson {
  format?: { duration?: string | number };
  streams?: FfprobeStream[];
}

export interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  level?: number;
  pix_fmt?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string | number;
  channels?: number;
  sample_rate?: string | number;
  color_transfer?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

function fraction(v: string | undefined): number {
  if (!v) return 0;
  const [a, b] = v.split('/').map(Number);
  return b ? a! / b : a || 0;
}

/** Why the demo refuses a probed file, or null when it fits. */
export function demoRejection(s: ProbeSummary): string | null {
  if (s.durationSec > DEMO_INPUT.maxDurationSec)
    return `duration ${s.durationSec}s`;
  const long = Math.max(s.displayWidth, s.displayHeight);
  const short = Math.min(s.displayWidth, s.displayHeight);
  if (long > DEMO_INPUT.maxLongSide || short > DEMO_INPUT.maxShortSide)
    return `frame ${s.displayWidth}x${s.displayHeight}`;
  return null;
}

/** Pure decision logic over ffprobe output; unit-tested on fixture JSON. */
export function analyzeProbe(
  json: FfprobeJson,
  keyframeIntervalSec: number | null,
): ProbeOutcome {
  const streams = json.streams ?? [];
  const v = streams.find(
    (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1,
  );
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v)
    return { ok: false, reason: 'noVideoStream', detail: 'no video stream' };
  const durationSec = Number(json.format?.duration ?? v.duration ?? 0);
  if (!(durationSec > 0))
    return {
      ok: false,
      reason: 'zeroDuration',
      detail: 'duration is zero or unknown',
    };
  if (durationSec > PROBE_LIMITS.maxDurationSec)
    return { ok: false, reason: 'tooLong', detail: `duration ${durationSec}s` };
  if (streams.length > PROBE_LIMITS.maxStreams)
    return {
      ok: false,
      reason: 'tooManyStreams',
      detail: `${streams.length} streams`,
    };
  const width = Number(v.width ?? 0);
  const height = Number(v.height ?? 0);
  if (!(width > 0 && height > 0))
    return {
      ok: false,
      reason: 'corrupted',
      detail: 'video stream has no dimensions',
    };
  if (width > PROBE_LIMITS.maxDimension || height > PROBE_LIMITS.maxDimension)
    return {
      ok: false,
      reason: 'tooLarge',
      detail: `frame ${width}x${height}`,
    };
  const fps = fraction(v.avg_frame_rate) || fraction(v.r_frame_rate);

  const rawRotation = Number(
    v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      v.tags?.rotate ??
      0,
  );
  const rotation = (((Math.round(rawRotation / 90) * 90) % 360) + 360) % 360;
  const colorTransfer = String(v.color_transfer ?? '');
  const hdr = HDR_TRANSFERS.has(colorTransfer);
  const video: VideoStreamInfo = {
    codec: String(v.codec_name ?? ''),
    profile: String(v.profile ?? ''),
    level: Number(v.level ?? 0),
    pixFmt: String(v.pix_fmt ?? ''),
    width,
    height,
    fps,
    rotation,
    colorTransfer,
    avgKeyframeIntervalSec: keyframeIntervalSec,
  };
  const audio: AudioStreamInfo | null = a
    ? {
        codec: String(a.codec_name ?? ''),
        channels: Number(a.channels ?? 0),
        sampleRate: Number(a.sample_rate ?? 0),
      }
    : null;
  const swap = rotation === 90 || rotation === 270;

  const reasons: string[] = [];
  if (video.codec !== 'h264') reasons.push(`codec ${video.codec}`);
  else {
    if (!H264_PROFILES_OK.has(video.profile))
      reasons.push(`profile ${video.profile}`);
    // Full-range 8-bit (yuvj420p: cameras, phones, screen recorders) plays as it is: repackaged,
    // not re-encoded.
    if (!PIX_FMTS_OK.has(video.pixFmt)) reasons.push(`pix_fmt ${video.pixFmt}`);
    if (video.level > REMUX_RULES.maxLevel)
      reasons.push(`level ${video.level}`);
  }
  if (
    Math.max(width, height) > REMUX_RULES.maxLongSide ||
    Math.min(width, height) > REMUX_RULES.maxShortSide
  )
    reasons.push(`resolution ${width}x${height}`);
  if (overFpsCap(fps)) reasons.push(`fps ${fps.toFixed(2)}`);
  if (rotation !== 0) reasons.push(`rotation ${rotation}°`);
  if (hdr) reasons.push(`hdr ${colorTransfer}`);
  if (
    reasons.length === 0 &&
    keyframeIntervalSec !== null &&
    keyframeIntervalSec > REMUX_RULES.maxKeyframeIntervalSec
  )
    reasons.push(`keyframe interval ${keyframeIntervalSec.toFixed(1)}s`);

  return {
    ok: true,
    summary: {
      durationSec,
      streams: streams.length,
      video,
      audio,
      displayWidth: swap ? height : width,
      displayHeight: swap ? width : height,
      hdr,
      decision: reasons.length ? 'transcode' : 'remux',
      reasons,
      audioNeedsTranscode: !!audio && audio.codec !== 'aac',
    },
  };
}

export interface ProbeOptions {
  ffprobe: string;
  timeoutMs?: number;
}

/** Runs ffprobe with input limits and, when the file could be remuxed, measures the keyframe interval. */
export async function probeFile(
  file: string,
  opts: ProbeOptions,
): Promise<ProbeOutcome> {
  let json: FfprobeJson;
  try {
    const { stdout } = await execa(
      opts.ffprobe,
      [
        '-v',
        'error',
        ...UNTRUSTED_INPUT,
        '-probesize',
        '50M',
        '-analyzeduration',
        '10M',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        file,
      ],
      { timeout: opts.timeoutMs ?? 60_000, ...TOOL_ENV },
    );
    json = JSON.parse(stdout) as FfprobeJson;
  } catch (err) {
    return {
      ok: false,
      reason: 'corrupted',
      detail: `ffprobe failed: ${firstLine(err)}`,
    };
  }
  const first = analyzeProbe(json, null);
  if (!first.ok || first.summary.decision === 'transcode') return first;
  const interval = await keyframeInterval(
    file,
    Math.min(60, first.summary.durationSec),
    opts,
  ).catch(() => null);
  return analyzeProbe(json, interval);
}

/** Average distance between keyframes over the first `windowSec` seconds (decodes keyframes only: fast). */
export async function keyframeInterval(
  file: string,
  windowSec: number,
  opts: ProbeOptions,
): Promise<number | null> {
  const { stdout } = await execa(
    opts.ffprobe,
    [
      '-v',
      'error',
      '-skip_frame',
      'nokey',
      '-select_streams',
      'v:0',
      '-show_entries',
      'frame=pts_time',
      '-of',
      'csv=p=0',
      '-read_intervals',
      `%+${windowSec}`,
      file,
    ],
    { timeout: opts.timeoutMs ?? 60_000, ...TOOL_ENV },
  );
  const times = stdout
    .split('\n')
    .map((l) => Number(l.split(',')[0]))
    .filter((n, i, arr) => Number.isFinite(n) && (i === 0 || n !== arr[i - 1]));
  if (times.length < 2) return times.length === 1 ? windowSec : null;
  return (times[times.length - 1]! - times[0]!) / (times.length - 1);
}

/** Width/height of a media file's first video stream (used on the packaged output). */
export async function probeDimensions(
  file: string,
  opts: ProbeOptions,
): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execa(
      opts.ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        file,
      ],
      { timeout: opts.timeoutMs ?? 30_000, ...TOOL_ENV },
    );
    const [w, h] = stdout.trim().split('\n')[0]!.split(',').map(Number);
    return w && h ? { width: w, height: h } : null;
  } catch {
    return null;
  }
}

export function firstLine(err: unknown): string {
  const text =
    err instanceof Error
      ? (err as { stderr?: string }).stderr || err.message
      : String(err);
  return (
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 500) ?? ''
  );
}

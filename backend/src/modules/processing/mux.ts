import { execa } from 'execa';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { threadArgs } from './ffmpeg.js';
import { TOOL_ENV, UNTRUSTED_INPUT } from './untrusted-input.js';

/**
 * A video uploaded as two files, video and audio (a DASH stream the browser extension saved),
 * made one: the video track of the first and the audio of the second, copied as they are.
 * Into MP4 when the codecs fit it, otherwise MKV, which takes them all.
 */
export function muxArgs(
  video: string,
  audio: string,
  output: string,
  threads?: number,
): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    ...threadArgs(threads),
    ...UNTRUSTED_INPUT,
    '-i',
    video,
    ...UNTRUSTED_INPUT,
    '-i',
    audio,
    '-map',
    '0:V:0',
    '-map',
    '1:a:0',
    '-c',
    'copy',
    '-f',
    output.endsWith('.mkv') ? 'matroska' : 'mp4',
    output,
  ];
}

export async function muxTracks(
  video: string,
  audio: string,
  dir: string,
  opts: { ffmpeg: string; threads?: number; timeoutMs?: number },
): Promise<{ file: string; ext: '.mp4' | '.mkv' }> {
  for (const ext of ['.mp4', '.mkv'] as const) {
    const out = join(dir, `muxed${ext}`);
    try {
      await execa(opts.ffmpeg, muxArgs(video, audio, out, opts.threads), {
        timeout: opts.timeoutMs ?? 30 * 60_000,
        ...TOOL_ENV,
      });
      if ((await stat(out).catch(() => null))?.size) return { file: out, ext };
    } catch {
      // MP4 cannot hold the codecs (VP8, Vorbis…): MKV can.
    }
  }
  throw new Error('the video and audio tracks could not be muxed');
}

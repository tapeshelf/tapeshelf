import { execa } from 'execa';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { threadArgs } from './ffmpeg.js';
import { TOOL_ENV } from './untrusted-input.js';

/**
 * What a source file said about itself, kept for the admin before it is cleaned: every tag
 * of the file, of its streams and chapters, and the streams that are not kept (data tracks, cover
 * pictures, attachments) — these can carry a place, a device, a name.
 */
export interface SourceMetadata {
  entries: { scope: string; key: string; value: string }[];
  removedStreams: { index: number; type: string; codec: string }[];
}

const MAX_ENTRIES = 300;
const MAX_VALUE = 1000;

interface ProbeJson {
  format?: { tags?: Record<string, unknown> };
  streams?: {
    index: number;
    codec_type?: string;
    codec_name?: string;
    codec_tag_string?: string;
    tags?: Record<string, unknown>;
    disposition?: { attached_pic?: number };
  }[];
  chapters?: { tags?: Record<string, unknown> }[];
}

/** Reads the tags of a file: scope `format`, `stream:<i>:<type>`, `chapter:<i>`. */
export async function readSourceMetadata(
  file: string,
  opts: { ffprobe: string; timeoutMs?: number },
): Promise<SourceMetadata> {
  const { stdout } = await execa(
    opts.ffprobe,
    [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      '-of',
      'json',
      file,
    ],
    { timeout: opts.timeoutMs ?? 60_000, ...TOOL_ENV },
  );
  const json = JSON.parse(stdout || '{}') as ProbeJson;
  const entries: SourceMetadata['entries'] = [];
  const add = (scope: string, tags: Record<string, unknown> | undefined) => {
    for (const [key, value] of Object.entries(tags ?? {})) {
      if (entries.length >= MAX_ENTRIES) return;
      entries.push({ scope, key, value: String(value).slice(0, MAX_VALUE) });
    }
  };
  add('format', json.format?.tags);
  const removedStreams: SourceMetadata['removedStreams'] = [];
  for (const s of json.streams ?? []) {
    const type = s.codec_type ?? 'unknown';
    add(`stream:${s.index}:${type}`, s.tags);
    if (!kept(type, s.disposition?.attached_pic === 1))
      removedStreams.push({
        index: s.index,
        type: s.disposition?.attached_pic === 1 ? 'cover' : type,
        codec: s.codec_name ?? s.codec_tag_string ?? 'unknown',
      });
  }
  (json.chapters ?? []).forEach((c, i) => add(`chapter:${i}`, c.tags));
  return { entries, removedStreams };
}

/** Video (not cover pictures), sound and subtitles stay; data tracks and attachments go. */
function kept(type: string, cover: boolean): boolean {
  return (
    (type === 'video' && !cover) || type === 'audio' || type === 'subtitle'
  );
}

/**
 * The file rebuilt without its metadata: the same video, sound and subtitles, copied as they
 * are (no re-encoding; rotation kept), with no tags of the file, its streams or chapters, no
 * chapters, no data tracks or covers, no writing-application mark — the same result for the same
 * file every time (the blocklist knows a file by its hash). Into the same container; one that
 * cannot take it so goes into MKV.
 */
export function stripArgs(
  input: string,
  output: string,
  threads?: number,
): string[] {
  const format = FORMATS[extname(output).toLowerCase()];
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    ...threadArgs(threads),
    '-i',
    input,
    '-map',
    '0:V',
    '-map',
    '0:a?',
    '-map',
    '0:s?',
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-fflags',
    '+bitexact',
    ...(format ? ['-f', format] : []),
    output,
  ];
}

/** Containers named outright: `.m4v` alone would be guessed as raw MPEG-4 video. */
const FORMATS: Record<string, string> = {
  '.mp4': 'mp4',
  '.m4v': 'mp4',
  '.mov': 'mov',
  '.mkv': 'matroska',
  '.webm': 'webm',
  '.avi': 'avi',
};

export async function stripMetadata(
  input: string,
  dir: string,
  opts: { ffmpeg: string; threads?: number; timeoutMs?: number },
): Promise<{ file: string; ext: string; containerChanged: boolean }> {
  const ext = extname(input).toLowerCase();
  const tryInto = async (target: string) => {
    const out = join(dir, `clean${target}`);
    await execa(opts.ffmpeg, stripArgs(input, out, opts.threads), {
      timeout: opts.timeoutMs ?? 30 * 60_000,
      ...TOOL_ENV,
    });
    if (!((await stat(out).catch(() => null))?.size ?? 0))
      throw new Error('the cleaned file is empty');
    return out;
  };
  if (ext)
    try {
      return { file: await tryInto(ext), ext, containerChanged: false };
    } catch {
      // Subtitles or streams this container cannot hold once rebuilt (or a file named for another
      // container than it is): MKV takes them all.
    }
  // So does a file with no extension of its own.
  return {
    file: await tryInto('.mkv'),
    ext: '.mkv',
    containerChanged: ext !== '.mkv',
  };
}

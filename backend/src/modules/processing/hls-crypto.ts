import {
  type Cipheriv,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
} from 'node:crypto';

export const HLS_KEY_URI_PLACEHOLDER = 'key';

/** Per-video AES-128 key derived from the KEK; never stored. */
export function deriveHlsKey(
  kek: Buffer,
  videoId: string,
  keyVersion: number,
): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      kek,
      'tapeshelf-hls',
      `video:${videoId}:v${keyVersion}`,
      16,
    ),
  );
}

/** HLS implicit IV: 128-bit big-endian media sequence number. */
export function ivForSequence(seq: number): Buffer {
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(seq >>> 0, 12);
  return iv;
}

export function encryptSegment(
  plain: Buffer,
  key: Buffer,
  seq: number,
): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, ivForSequence(seq));
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

/** The same cipher as a stream: a segment is never held in memory whole. */
export function segmentCipher(key: Buffer, seq: number): Cipheriv {
  return createCipheriv('aes-128-cbc', key, ivForSequence(seq));
}

/** The longest segment of a media playlist, in seconds (its #EXTINF durations). */
export function longestSegmentSec(playlist: string): number {
  let max = 0;
  for (const m of playlist.matchAll(/^#EXTINF:([\d.]+)/gm))
    max = Math.max(max, Number(m[1]));
  return max;
}

export function decryptSegment(enc: Buffer, key: Buffer, seq: number): Buffer {
  const decipher = createDecipheriv('aes-128-cbc', key, ivForSequence(seq));
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export interface PlaylistBuild {
  /** Media playlist with the EXT-X-KEY tag; the key URI is replaced at serve time. */
  index: string;
  /** Single-variant master playlist. */
  master: string;
  /** Segment file names in media-sequence order. */
  segments: string[];
}

/** Rewrites ffmpeg's plain media playlist into the encrypted one and builds the master playlist. */
export function buildPlaylists(
  plainIndex: string,
  opts: { bandwidth: number; width: number; height: number },
): PlaylistBuild {
  const out: string[] = [];
  const segments: string[] = [];
  let keyWritten = false;
  for (const raw of plainIndex.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('#EXTINF') && !keyWritten) {
      out.push(`#EXT-X-KEY:METHOD=AES-128,URI="${HLS_KEY_URI_PLACEHOLDER}"`);
      keyWritten = true;
    }
    if (line && !line.startsWith('#')) segments.push(line);
    out.push(line);
  }
  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-STREAM-INF:BANDWIDTH=${Math.max(1, Math.round(opts.bandwidth))},RESOLUTION=${opts.width}x${opts.height}`,
    'index.m3u8',
    '',
  ].join('\n');
  return { index: out.join('\n'), master, segments };
}

/** Where the HLS of one key version of a video lives (its key comes from the same version). */
export function hlsPrefixOf(videoId: string, keyVersion: number): string {
  return `videos/${videoId}/hls/v${keyVersion}`;
}

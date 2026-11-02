import { randomBytes } from 'node:crypto';

import {
  buildPlaylists,
  decryptSegment,
  deriveHlsKey,
  encryptSegment,
  ivForSequence,
  longestSegmentSec,
  segmentCipher,
} from './hls-crypto.js';

const KEK = Buffer.alloc(32, 7);

describe('hls-crypto', () => {
  it('derives a stable 16-byte key per video and key version', () => {
    const a = deriveHlsKey(KEK, 'video-a', 1);
    expect(a).toHaveLength(16);
    expect(deriveHlsKey(KEK, 'video-a', 1).equals(a)).toBe(true);
    expect(deriveHlsKey(KEK, 'video-b', 1).equals(a)).toBe(false);
    expect(deriveHlsKey(KEK, 'video-a', 2).equals(a)).toBe(false);
    expect(deriveHlsKey(Buffer.alloc(32, 8), 'video-a', 1).equals(a)).toBe(
      false,
    );
  });

  it('uses the media sequence number as a big-endian IV', () => {
    const iv = ivForSequence(258);
    expect(iv.toString('hex')).toBe('00000000000000000000000000000102');
  });

  it('round-trips segments and binds them to their sequence number', () => {
    const key = deriveHlsKey(KEK, 'v', 1);
    const plain = randomBytes(188 * 100 + 17);
    const enc = encryptSegment(plain, key, 5);
    expect(enc.length % 16).toBe(0);
    expect(decryptSegment(enc, key, 5).equals(plain)).toBe(true);
    expect(decryptSegment(enc, key, 6).equals(plain)).toBe(false);
  });

  it('inserts one EXT-X-KEY tag and lists segments in order', () => {
    const plain = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      '#EXTINF:6.000000,',
      'seg_00000.ts',
      '#EXTINF:4.500000,',
      'seg_00001.ts',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');
    const { index, master, segments } = buildPlaylists(plain, {
      bandwidth: 2_500_000.4,
      width: 1280,
      height: 720,
    });
    expect(segments).toEqual(['seg_00000.ts', 'seg_00001.ts']);
    expect(index.match(/#EXT-X-KEY/g)).toHaveLength(1);
    expect(index.indexOf('#EXT-X-KEY')).toBeLessThan(index.indexOf('#EXTINF'));
    expect(index).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key"');
    expect(master).toContain('BANDWIDTH=2500000,RESOLUTION=1280x720');
    expect(master.trim().endsWith('index.m3u8')).toBe(true);
  });
});

describe('streamed segments', () => {
  it('the stream cipher writes what encryptSegment writes', async () => {
    const key = Buffer.alloc(16, 7);
    const plain = Buffer.alloc(100_003, 3);
    const cipher = segmentCipher(key, 5);
    const streamed = Buffer.concat([cipher.update(plain), cipher.final()]);
    expect(streamed.equals(encryptSegment(plain, key, 5))).toBe(true);
    expect(decryptSegment(streamed, key, 5).equals(plain)).toBe(true);
  });

  it('the longest segment of a playlist', () => {
    const playlist =
      '#EXTM3U\n#EXTINF:6.006,\nseg_0.ts\n#EXTINF:42.5,\nseg_1.ts\n#EXTINF:2,\nseg_2.ts\n';
    expect(longestSegmentSec(playlist)).toBe(42.5);
    expect(longestSegmentSec('#EXTM3U\n')).toBe(0);
  });
});

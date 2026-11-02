import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  type ZipEntry,
  uniqueNames,
  zipSize,
  zipStream,
} from './zip-writer.js';

function entry(name: string, data: Buffer): ZipEntry {
  return {
    name,
    size: data.length,
    modified: new Date('2026-10-20T12:34:56Z'),
    // Several chunks, as storage gives them.
    open: () =>
      Promise.resolve(
        Readable.from(
          [data.subarray(0, 7), data.subarray(7)].filter((c) => c.length),
        ),
      ),
  };
}

async function build(entries: ZipEntry[], limit?: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zipStream(entries, limit)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Python's zipfile checks the CRCs and reads the names and the contents back. */
function readBack(zip: Buffer): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  try {
    const file = join(dir, 'a.zip');
    writeFileSync(file, zip);
    const out = execFileSync(
      'python3',
      [
        '-c',
        'import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename: z.read(i).decode() for i in z.infolist()}))',
        file,
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(out) as Record<string, string>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('zipStream', () => {
  const files = {
    'first.mp4': 'the first video, more than seven bytes',
    'Видео №2.mov': 'второе',
    'empty.mp4': '',
  };
  const entries = () =>
    Object.entries(files).map(([name, text]) => entry(name, Buffer.from(text)));

  it('makes an archive any unzip reads, of the length said up front', async () => {
    const zip = await build(entries());
    expect(zip.length).toBe(zipSize(entries()));
    expect(readBack(zip)).toEqual(files);
  });

  it('writes big entries and offsets in the ZIP64 form', async () => {
    // A tiny limit puts every entry, offset and the directory over it.
    const zip = await build(entries(), 10);
    expect(zip.length).toBe(zipSize(entries(), 10));
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(true);
    expect(readBack(zip)).toEqual(files);
  });

  it('fails when storage gives other bytes than promised', async () => {
    const broken = { ...entry('x.mp4', Buffer.from('short')), size: 99 };
    await expect(build([broken])).rejects.toThrow('5 bytes instead of 99');
  });
});

describe('uniqueNames', () => {
  it('numbers repeated names and keeps them file names', () => {
    expect(
      uniqueNames([
        'a.mp4',
        'A.mp4',
        'a.mp4',
        'b/c.mov',
        '..',
        'noext',
        'noext',
      ]),
    ).toEqual([
      'a.mp4',
      'A (2).mp4',
      'a (3).mp4',
      'b_c.mov',
      'video',
      'noext',
      'noext (2)',
    ]);
  });
});

import type { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';

/**
 * Over this an entry's size or offset is written in the ZIP64 form; the same cautious limit as
 * Python's zipfile (2 GiB − 1), whose layout this follows so every unzip reads it.
 */
export const ZIP64_LIMIT = 0x7fffffff;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;
/** General purpose flags: sizes and CRC in a data descriptor after the data (bit 3), UTF-8 names (bit 11). */
const FLAGS = 0x0808;
/** Unix regular file, rw-r--r--. */
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0;

export interface ZipEntry {
  name: string;
  /** Exact bytes `open()` gives: the archive's length is known before the first byte. */
  size: number;
  modified: Date;
  open(): Promise<Readable>;
}

interface Placed {
  name: Buffer;
  size: number;
  offset: number;
  zip64: boolean;
  time: number;
  date: number;
  crc: number;
}

/**
 * A ZIP of `entries` as a stream ("download all"): stored, not compressed — videos
 * do not shrink — so the length is known up front (`zipSize`) and the browser shows the progress.
 * Each entry's CRC is counted on the way and written in the data descriptor after it.
 */
export async function* zipStream(
  entries: ZipEntry[],
  limit = ZIP64_LIMIT,
): AsyncGenerator<Buffer> {
  const placed: Placed[] = [];
  let offset = 0;
  for (const entry of entries) {
    const e = place(entry, offset, limit);
    const head = localHeader(e);
    yield head;
    let crc = 0;
    let read = 0;
    const source = await entry.open();
    try {
      for await (const chunk of source as AsyncIterable<Buffer>) {
        crc = crc32(chunk, crc);
        read += chunk.length;
        yield chunk;
      }
    } finally {
      source.destroy();
    }
    if (read !== entry.size)
      throw new Error(`${entry.name}: ${read} bytes instead of ${entry.size}`);
    e.crc = crc >>> 0;
    const tail = descriptor(e);
    yield tail;
    offset += head.length + read + tail.length;
    placed.push(e);
  }
  yield centralDirectory(placed, offset, limit);
}

/** The archive's length in bytes, exactly what `zipStream` gives for the same entries. */
export function zipSize(entries: ZipEntry[], limit = ZIP64_LIMIT): number {
  const placed: Placed[] = [];
  let offset = 0;
  for (const entry of entries) {
    const e = place(entry, offset, limit);
    offset += localHeader(e).length + entry.size + (e.zip64 ? 24 : 16);
    placed.push(e);
  }
  return offset + centralDirectory(placed, offset, limit).length;
}

/** "name.mp4", "name (2).mp4"…: two files of the same name both make it into the archive. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const clean =
      raw
        .replace(/[\\/:*?"<>|]/g, '_')
        .split('')
        .map((c) => (c < ' ' ? '_' : c))
        .join('')
        .replace(/^\.+/, '')
        .trim() || 'video';
    const dot = clean.lastIndexOf('.');
    const [stem, ext] =
      dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
    let name = clean;
    for (let n = 2; taken.has(name.toLowerCase()); n++)
      name = `${stem} (${n})${ext}`;
    taken.add(name.toLowerCase());
    return name;
  });
}

function place(entry: ZipEntry, offset: number, limit: number): Placed {
  const { time, date } = dosTime(entry.modified);
  return {
    name: Buffer.from(entry.name, 'utf8'),
    size: entry.size,
    offset,
    zip64: entry.size > limit,
    time,
    date,
    crc: 0,
  };
}

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (d.getUTCHours() << 11) |
      (d.getUTCMinutes() << 5) |
      (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** CRC and sizes are zero here, they follow the data; a big entry carries a ZIP64 field for them. */
function localHeader(e: Placed): Buffer {
  const extra = e.zip64 ? 20 : 0;
  const b = Buffer.alloc(30 + e.name.length + extra);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(e.zip64 ? 45 : 20, 4);
  b.writeUInt16LE(FLAGS, 6);
  b.writeUInt16LE(0, 8);
  b.writeUInt16LE(e.time, 10);
  b.writeUInt16LE(e.date, 12);
  b.writeUInt16LE(e.name.length, 26);
  b.writeUInt16LE(extra, 28);
  e.name.copy(b, 30);
  if (e.zip64) {
    const x = 30 + e.name.length;
    b.writeUInt16LE(0x0001, x);
    b.writeUInt16LE(16, x + 2);
  }
  return b;
}

function descriptor(e: Placed): Buffer {
  const b = Buffer.alloc(e.zip64 ? 24 : 16);
  b.writeUInt32LE(0x08074b50, 0);
  b.writeUInt32LE(e.crc, 4);
  if (e.zip64) {
    b.writeBigUInt64LE(BigInt(e.size), 8);
    b.writeBigUInt64LE(BigInt(e.size), 16);
  } else {
    b.writeUInt32LE(e.size, 8);
    b.writeUInt32LE(e.size, 12);
  }
  return b;
}

function centralHeader(e: Placed, limit: number): Buffer {
  const extra: number[] = [];
  let size = e.size;
  let offset = e.offset;
  if (e.size > limit) {
    extra.push(e.size, e.size);
    size = MAX32;
  }
  if (e.offset > limit) {
    extra.push(e.offset);
    offset = MAX32;
  }
  const extraLength = extra.length ? 4 + 8 * extra.length : 0;
  const version = e.zip64 || extra.length ? 45 : 20;
  const b = Buffer.alloc(46 + e.name.length + extraLength);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE((3 << 8) | version, 4);
  b.writeUInt16LE(version, 6);
  b.writeUInt16LE(FLAGS, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(e.time, 12);
  b.writeUInt16LE(e.date, 14);
  b.writeUInt32LE(e.crc, 16);
  b.writeUInt32LE(size, 20);
  b.writeUInt32LE(size, 24);
  b.writeUInt16LE(e.name.length, 28);
  b.writeUInt16LE(extraLength, 30);
  b.writeUInt32LE(EXTERNAL_ATTRS, 38);
  b.writeUInt32LE(offset, 42);
  e.name.copy(b, 46);
  if (extra.length) {
    let x = 46 + e.name.length;
    b.writeUInt16LE(0x0001, x);
    b.writeUInt16LE(8 * extra.length, x + 2);
    x += 4;
    for (const value of extra) {
      b.writeBigUInt64LE(BigInt(value), x);
      x += 8;
    }
  }
  return b;
}

function centralDirectory(
  placed: Placed[],
  start: number,
  limit: number,
): Buffer {
  const headers = placed.map((e) => centralHeader(e, limit));
  const size = headers.reduce((n, h) => n + h.length, 0);
  const count = placed.length;
  const parts = [...headers];
  if (count > MAX16 || size > limit || start > limit) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE((3 << 8) | 45, 12);
    record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(size), 40);
    record.writeBigUInt64LE(BigInt(start), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(start + size), 8);
    locator.writeUInt32LE(1, 16);
    parts.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(count, MAX16), 8);
  end.writeUInt16LE(Math.min(count, MAX16), 10);
  end.writeUInt32LE(Math.min(size, MAX32), 12);
  end.writeUInt32LE(Math.min(start, MAX32), 16);
  parts.push(end);
  return Buffer.concat(parts);
}

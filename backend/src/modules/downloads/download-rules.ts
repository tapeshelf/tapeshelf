import { Transform, type TransformCallback } from 'node:stream';

import type { Role } from '../../generated/prisma/enums.js';
import type { TierLimits } from '../settings/settings.defaults.js';

/** The same video again within this window does not count (a dropped connection, a retry). */
export const REPEAT_WINDOW_MS = 3600 * 1000;
/** The wait page counts down this long before a limited download starts. */
export const WAIT_SEC = 5;

/**
 * `direct`: a presigned link straight to storage, at once (admins and tiers without any download
 * limit, Pro by default). `limited`: the wait page, a one-time ticket and the file streamed through
 * the API at the tier's speed, counted per month (Free).
 */
export type DownloadMode = 'direct' | 'limited';

export function downloadMode(role: Role, limits: TierLimits): DownloadMode {
  if (role === 'ADMIN') return 'direct';
  return limits.downloadsPerMonth === 0 &&
    limits.downloadSpeedBytesPerSec === 0 &&
    limits.downloadConcurrency === 0
    ? 'direct'
    : 'limited';
}

/** The calendar month (UTC) the monthly limit counts in, and when the next one starts. */
export function monthWindow(now: Date): { start: Date; resetAt: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1)),
    resetAt: new Date(Date.UTC(y, m + 1, 1)),
  };
}

/**
 * Passes bytes on at no more than `bytesPerSec` on average: after each chunk it waits until the
 * bytes sent so far are due. Backpressure keeps the source (the S3 response) from reading ahead.
 */
export class ThrottleStream extends Transform {
  private sent = 0;
  private readonly started = Date.now();

  constructor(private readonly bytesPerSec: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.sent += chunk.length;
    this.push(chunk);
    const wait =
      this.started + (this.sent / this.bytesPerSec) * 1000 - Date.now();
    if (wait > 0) setTimeout(callback, wait);
    else callback();
  }
}

/** `attachment` with an ASCII fallback and the original UTF-8 name (RFC 6266 / 5987). */
export function attachmentHeader(filename: string): string {
  const cleaned = filename
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 120)
    .trim();
  const ascii = /[A-Za-z0-9]/.test(cleaned) ? cleaned : 'video';
  const utf8 = encodeURIComponent(filename.slice(0, 200)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

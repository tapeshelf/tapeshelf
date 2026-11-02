import type { Locator, Page } from '@playwright/test';

/** A picture's brightness, one number (0–255) per pixel, row by row. */
export interface Luma {
  w: number;
  h: number;
  v: number[];
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A screenshot (PNG) as brightness, decoded by the page itself. */
export function screenshotLuma(page: Page, png: Buffer): Promise<Luma> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const v: number[] = [];
    for (let i = 0; i < d.length; i += 4) v.push((d[i]! + d[i + 1]! + d[i + 2]!) / 3);
    return { w: c.width, h: c.height, v };
  }, png.toString('base64'));
}

/** The frame a video shows now, at the video's own size. */
export function videoFrameLuma(video: Locator): Promise<Luma> {
  return video.evaluate((el: HTMLVideoElement) => {
    const c = document.createElement('canvas');
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const v: number[] = [];
    for (let i = 0; i < d.length; i += 4) v.push((d[i]! + d[i + 1]! + d[i + 2]!) / 3);
    return { w: c.width, h: c.height, v };
  });
}

/** The edges (left/top inclusive, right/bottom exclusive) of the pixels in `area` that `hit` picks. */
export function boundsOf(l: Luma, area: Box, hit: (v: number) => boolean): Box {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let y = Math.max(0, Math.floor(area.top)); y < Math.min(l.h, Math.ceil(area.bottom)); y++)
    for (let x = Math.max(0, Math.floor(area.left)); x < Math.min(l.w, Math.ceil(area.right)); x++)
      if (hit(l.v[y * l.w + x]!)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  return { left, top, right, bottom };
}

export function grow(b: Box, by: number): Box {
  return { left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by };
}

/** The largest distance between two boxes' edges. */
export function apart(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.right - b.right),
    Math.abs(a.bottom - b.bottom),
  );
}

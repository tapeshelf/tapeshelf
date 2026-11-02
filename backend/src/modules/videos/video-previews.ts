import sharp from 'sharp';

/**
 * Small WebP copies of the frames and the thumbnail for tiles, hover scrubbing and timeline
 * previews. The full-size JPEGs stay for the player poster, the contact sheet
 * and the thumbnail picker; tiles never load them.
 */
export const PREVIEW_WIDTH = 640;
const PREVIEW_QUALITY = 70;

/** Tile frame `i` under the video's asset prefix: s00.webp … s15.webp. */
export function smallFrameKey(prefix: string, index: number): string {
  return `${prefix}/s${String(index).padStart(2, '0')}.webp`;
}

/** Small copy of a custom thumbnail `…/thumb-<token>.jpg` → `…/thumb-<token>-s.webp`. */
export function smallThumbKey(thumbKey: string): string {
  return thumbKey.replace(/\.jpg$/, '-s.webp');
}

/** A custom (per-timestamp) thumbnail or its small copy — deleted when replaced; frames are not. */
export function isCustomThumbKey(key: string | null): key is string {
  return !!key && /\/thumb-[0-9a-f]+(\.jpg|-s\.webp)$/.test(key);
}

/** Downscale to PREVIEW_WIDTH wide (never upscale) and re-encode as WebP. */
export function toPreview(image: Buffer | string): Promise<Buffer> {
  return sharp(image)
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer();
}

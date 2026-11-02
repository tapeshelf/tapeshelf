import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

/** Sheet geometry: 1920 px wide, 4×4 tiles on the dark theme canvas. */
export const SHEET_WIDTH = 1920;
export const SHEET_COLUMNS = 4;
export const SHEET_ROWS = 4;
export const SHEET_FRAMES = SHEET_COLUMNS * SHEET_ROWS;
/**
 * The design of the sheet: raised when what it shows changes, so the worker draws the old ones
 * again (`MaintenanceService.refreshSheets`). 1: the short link, tapeshelf.com/<code>.
 */
export const SHEET_VERSION = 1;
const PADDING = 27;
const GAP = 6;
const HEADER_HEIGHT = 176;
const TILE_WIDTH =
  (SHEET_WIDTH - 2 * PADDING - (SHEET_COLUMNS - 1) * GAP) / SHEET_COLUMNS; // 462

/** Dark theme tokens from frontend/src/styles.css (the sheet stays dark). */
const COLORS = {
  canvas: '#131515',
  surface: '#1b1e1e',
  border: '#313636',
  text: '#eeece5',
  muted: '#a2a69f',
  accent: '#fc753e',
  shelf: '#d1e4db',
};

export interface ContactSheetInput {
  /** Up to 16 JPEG/PNG frames in order; missing ones are drawn as empty tiles. */
  frames: Buffer[];
  title: string;
  sizeBytes: number;
  durationSec: number;
  width: number;
  height: number;
  /** Absolute link to the video, printed in the header. */
  link: string;
  /** Instance name next to the logo (SITE_NAME). */
  siteName: string;
}

export interface ContactSheetResult {
  jpeg: Buffer;
  width: number;
  height: number;
}

/** Renders the branded 4×4 contact sheet (frames + header with logo, title, metadata and link). */
export async function renderContactSheet(
  input: ContactSheetInput,
): Promise<ContactSheetResult> {
  const aspect =
    input.width > 0 && input.height > 0 ? input.height / input.width : 9 / 16;
  const tileW = Math.round(TILE_WIDTH);
  const tileH = Math.max(60, Math.round(tileW * aspect));
  const height =
    HEADER_HEIGHT +
    PADDING +
    SHEET_ROWS * tileH +
    (SHEET_ROWS - 1) * GAP +
    PADDING;

  const tiles = await Promise.all(
    Array.from({ length: SHEET_FRAMES }, async (_, i) => {
      const frame = input.frames[i];
      const left = PADDING + (i % SHEET_COLUMNS) * (tileW + GAP);
      const top =
        HEADER_HEIGHT + PADDING + Math.floor(i / SHEET_COLUMNS) * (tileH + GAP);
      const image = frame
        ? await sharp(frame).resize(tileW, tileH, { fit: 'cover' }).toBuffer()
        : await sharp({
            create: {
              width: tileW,
              height: tileH,
              channels: 3,
              background: COLORS.surface,
            },
          })
            .png()
            .toBuffer();
      return { input: image, left, top };
    }),
  );

  const jpeg = await sharp({
    create: {
      width: SHEET_WIDTH,
      height,
      channels: 3,
      background: COLORS.canvas,
    },
  })
    .composite([
      { input: Buffer.from(headerSvg(input)), left: 0, top: 0 },
      ...tiles,
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return { jpeg, width: SHEET_WIDTH, height };
}

function headerSvg(input: ContactSheetInput): string {
  const meta = `${formatBytes(input.sizeBytes)} · ${formatDuration(input.durationSec)} · ${input.width}×${input.height}`;
  const title = truncate(input.title, 72);
  const link = truncate(input.link, 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${HEADER_HEIGHT}" viewBox="0 0 ${SHEET_WIDTH} ${HEADER_HEIGHT}">
  <rect width="${SHEET_WIDTH}" height="${HEADER_HEIGHT}" fill="${COLORS.canvas}"/>
  <g transform="translate(${PADDING - 6} 24) scale(1.5)">
    <polygon points="13,6.6 25.6,14.6 13,22.6" fill="${COLORS.accent}" stroke="${COLORS.accent}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="7.2" y="9.6" width="3.8" height="13.2" rx="0.9" fill="${COLORS.shelf}" transform="rotate(-11 9.1 22.8)"/>
    <polygon points="6,23.9 27.4,23.9 26.1,26.3 4.7,26.3" fill="${COLORS.text}" stroke="${COLORS.text}" stroke-width="0.6" stroke-linejoin="round"/>
  </g>
  <text x="${PADDING + 58}" y="57" font-family="Unbounded, Inter, sans-serif" font-size="26" font-weight="600" fill="${COLORS.text}">${escapeXml(truncate(input.siteName, 24))}</text>
  <text x="${SHEET_WIDTH - PADDING}" y="56" text-anchor="end" font-family="Inter, sans-serif" font-size="20" fill="${COLORS.muted}">${escapeXml(link)}</text>
  <text x="${PADDING}" y="116" font-family="Inter, sans-serif" font-size="34" font-weight="600" fill="${COLORS.text}">${escapeXml(title)}</text>
  <rect x="${PADDING}" y="${HEADER_HEIGHT - 4}" width="${SHEET_WIDTH - 2 * PADDING}" height="4" fill="${COLORS.accent}"/>
  <text x="${PADDING}" y="152" font-family="Inter, sans-serif" font-size="22" fill="${COLORS.muted}">${escapeXml(meta)}</text>
</svg>`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<'
      ? '&lt;'
      : c === '>'
        ? '&gt;'
        : c === '&'
          ? '&amp;'
          : c === "'"
            ? '&apos;'
            : '&quot;',
  );
}

let fontConfigured = false;

/**
 * Points fontconfig (used by librsvg inside sharp) at the bundled Inter and Unbounded fonts so sheets
 * look the same on every machine. Must run before the first SVG render in the process; honours a preset FONTCONFIG_FILE.
 */
export function configureSheetFonts(assetsDir: string, tmpDir: string): void {
  if (fontConfigured) return;
  fontConfigured = true;
  if (process.env['FONTCONFIG_FILE']) return;
  const fontsDir = resolve(assetsDir, 'fonts');
  const cacheDir = resolve(tmpDir, 'fontconfig-cache');
  mkdirSync(cacheDir, { recursive: true });
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(fontsDir)}</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir prefix="xdg">fonts</dir>
  <cachedir>${escapeXml(cacheDir)}</cachedir>
  <alias><family>sans-serif</family><prefer><family>Inter</family></prefer></alias>
</fontconfig>
`;
  const file = join(tmpDir, 'fonts.conf');
  writeFileSync(file, conf);
  process.env['FONTCONFIG_FILE'] = file;
}

import type { EditSourceDto, EditSpecDto, RectDto, TimeRangeDto } from '../../api';

/**
 * The editor's model in the browser, the same rules as the server's
 * `edit-spec.ts`: the frame is the original turned by `rotate`/`flip` ("the turned frame"); crop
 * and blurs are fractions of it; timers and captions are fractions of the output frame; times are
 * seconds of the original, cuts included.
 */
export type EditSpec = EditSpecDto & { crop: RectDto | null };

export const TIMER_HOLD_SEC = 5;
export const MIN_CROP = 0.05;
export const MIN_PIECE_SEC = 0.05;
export const MIN_OUTPUT_SEC = 1;
export const MAX_VOLUME = 2;
export const MAX_ITEMS = 20;
export const CAPTION_MAX = 200;
export const DEFAULT_TEXT_SIZE = 0.06;

/** Crop shapes offered (width / height); null = free. */
export const ASPECTS: { key: string; ratio: number | null }[] = [
  { key: 'free', ratio: null },
  { key: '16:9', ratio: 16 / 9 },
  { key: '9:16', ratio: 9 / 16 },
  { key: '1:1', ratio: 1 },
  { key: '4:5', ratio: 4 / 5 },
];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The blur's strength for an area of w × h pixels, as the render uses it (render-plan.ts). */
export function blurSigma(w: number, h: number): number {
  return Math.max(10, Math.round(Math.min(w, h) / 4));
}

export function emptySpec(source: EditSourceDto): EditSpec {
  return {
    rotate: 0,
    flipH: false,
    flipV: false,
    crop: null,
    trim: { start: 0, end: source.durationSec },
    cuts: [],
    blurs: [],
    timers: [],
    captions: [],
    volume: 1,
    normalize: false,
  };
}

export function cloneSpec(spec: EditSpec): EditSpec {
  return structuredClone(spec);
}

/**
 * A saved edit as the editor works on it (a missing crop is no crop); none: a fresh start on the
 * video as it is now.
 */
export function editable(spec: EditSpecDto | null, source: EditSourceDto): EditSpec {
  return spec ? { ...cloneSpec(spec as EditSpec), crop: spec.crop ?? null } : emptySpec(source);
}

/** The parts of the original that stay, in order: the trim minus the cuts. */
export function keptSegments(spec: EditSpec): TimeRangeDto[] {
  const cuts = spec.cuts
    .map((c) => ({
      start: Math.max(c.start, spec.trim.start),
      end: Math.min(c.end, spec.trim.end),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const out: TimeRangeDto[] = [];
  let at = spec.trim.start;
  for (const c of cuts) {
    if (c.start > at) out.push({ start: at, end: c.start });
    at = Math.max(at, c.end);
  }
  if (spec.trim.end > at) out.push({ start: at, end: spec.trim.end });
  return out.filter((s) => s.end - s.start >= MIN_PIECE_SEC);
}

export function outputDuration(spec: EditSpec): number {
  return keptSegments(spec).reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** Where playback goes from `t` with the cuts applied: `t` itself, the next kept start, or null at the end. */
export function playableFrom(spec: EditSpec, t: number): number | null {
  for (const s of keptSegments(spec)) {
    if (t < s.start) return s.start;
    if (t < s.end - 0.02) return t;
  }
  return null;
}

/** No change at all: saving it into the video is going back to the original. */
export function isIdentity(spec: EditSpec, source: EditSourceDto): boolean {
  const fullCrop =
    !spec.crop || (spec.crop.x <= 0 && spec.crop.y <= 0 && spec.crop.w >= 1 && spec.crop.h >= 1);
  return (
    spec.rotate === 0 &&
    !spec.flipH &&
    !spec.flipV &&
    fullCrop &&
    spec.trim.start <= 0 &&
    spec.trim.end >= source.durationSec - 0.001 &&
    spec.cuts.length === 0 &&
    spec.blurs.length === 0 &&
    spec.timers.length === 0 &&
    spec.captions.length === 0 &&
    spec.volume === 1 &&
    !spec.normalize
  );
}

/** Size of the turned frame. */
export function turnedSize(rotate: number, source: { width: number; height: number }) {
  return rotate === 90 || rotate === 270
    ? { w: source.height, h: source.width }
    : { w: source.width, h: source.height };
}

/** Shape of the result: the crop of the turned frame (width / height). */
export function outputAspect(spec: EditSpec, source: EditSourceDto): number {
  const t = turnedSize(spec.rotate, source);
  const c = spec.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return (c.w * t.w) / Math.max(1, c.h * t.h);
}

/** `m:ss.t` (`h:mm:ss.t` from an hour), as the editor's fields and the timer show time. */
export function formatTime(sec: number, withHours = sec >= 3600): string {
  const s = Math.max(0, sec);
  const tenths = Math.floor(s * 10) % 10;
  const whole = Math.floor(s);
  const ss = String(whole % 60).padStart(2, '0');
  if (withHours) {
    const mm = String(Math.floor(whole / 60) % 60).padStart(2, '0');
    return `${Math.floor(whole / 3600)}:${mm}:${ss}.${tenths}`;
  }
  return `${Math.floor(whole / 60)}:${ss}.${tenths}`;
}

/** Reads `1:23.4`, `83.4`, `1:02:03` back into seconds; null for anything else. */
export function parseTime(text: string): number | null {
  const parts = text.trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((sum, p) => sum * 60 + Number(p), 0);
}

/** What a timer shows at `t` (null: not on screen): from 0 at `start`, still at `end`, 5 s more. */
export function timerAt(timer: TimeRangeDto, t: number): string | null {
  if (t < timer.start || t > timer.end + TIMER_HOLD_SEC) return null;
  return stopwatchText(Math.min(t, timer.end) - timer.start, timer.end - timer.start >= 3600);
}

/** What a timer shows: `m:ss`, `h:mm:ss` when it runs an hour or more (render-plan.ts timerText). */
export function stopwatchText(sec: number, withHours: boolean): string {
  return formatTime(sec, withHours).replace(/\.\d$/, '');
}

/** A rectangle kept inside the frame and at least `min` on each side. */
export function fitRect(r: RectDto, min: number): RectDto {
  const w = clamp(r.w, min, 1);
  const h = clamp(r.h, min, 1);
  return { x: clamp(r.x, 0, 1 - w), y: clamp(r.y, 0, 1 - h), w, h };
}

/**
 * The biggest crop of shape `ratio` (output width / height) centred in the turned frame `t`.
 */
export function centredCrop(ratio: number, t: { w: number; h: number }): RectDto {
  let w = 1;
  let h = t.w / ratio / t.h;
  if (h > 1) {
    h = 1;
    w = (t.h * ratio) / t.w;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

// ---------------------------------------------------------------- the result's frame and plates

/** The render's limit for the long side (backend edit-render.service.ts). */
export const MAX_LONG_SIDE = 1920;
export const MIN_TEXT_SIZE = 0.02;
export const MAX_TEXT_SIZE = 0.3;

const round4 = (v: number) => Math.round(v * 10000) / 10000;
/** A size: even, at least 2. */
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
/** A position: even, from 0. */
const evenPos = (v: number) => Math.round(v / 2) * 2;
const evenBelow = (v: number) => (v % 2 ? v - 1 : v);

/** The crop as the server keeps it (edit-spec.ts normalizeEdit): clamped, four decimals, null when all. */
export function savedCrop(c: RectDto | null): RectDto | null {
  if (!c) return null;
  const x = clamp(c.x, 0, 1);
  const y = clamp(c.y, 0, 1);
  const r = {
    x: round4(x),
    y: round4(y),
    w: round4(clamp(c.w, 0, 1 - x)),
    h: round4(clamp(c.h, 0, 1 - y)),
  };
  return r.x <= 0 && r.y <= 0 && r.w >= 1 && r.h >= 1 ? null : r;
}

/** A timer's or caption's place as the server keeps it. */
export function savedPlace(p: { x: number; y: number; size: number }) {
  return {
    x: round4(clamp(p.x, 0, 1)),
    y: round4(clamp(p.y, 0, 1)),
    size: round4(clamp(p.size, MIN_TEXT_SIZE, MAX_TEXT_SIZE)),
  };
}

export interface OutputGeometry {
  turned: { w: number; h: number };
  /** The crop in pixels of the turned frame (null: all of it). */
  crop: RectDto | null;
  /** The result's size. */
  width: number;
  height: number;
}

/** The result's frame exactly as the render makes it (backend render-plan.ts outputGeometry). */
export function outputGeometry(
  spec: Pick<EditSpec, 'rotate' | 'crop'>,
  source: { width: number; height: number },
): OutputGeometry {
  const turned = turnedSize(spec.rotate, source);
  const c = savedCrop(spec.crop);
  let crop: RectDto | null = null;
  let cw = turned.w;
  let ch = turned.h;
  if (c) {
    cw = Math.min(even(c.w * turned.w), evenBelow(turned.w));
    ch = Math.min(even(c.h * turned.h), evenBelow(turned.h));
    crop = {
      x: Math.min(evenPos(c.x * turned.w), Math.max(0, turned.w - cw)),
      y: Math.min(evenPos(c.y * turned.h), Math.max(0, turned.h - ch)),
      w: cw,
      h: ch,
    };
  }
  const long = Math.max(cw, ch);
  if (long > MAX_LONG_SIDE) {
    const k = MAX_LONG_SIDE / long;
    return { turned, crop, width: even(cw * k), height: even(ch * k) };
  }
  return { turned, crop, width: even(cw), height: even(ch) };
}

/*
 * Where a timer or a caption is drawn, the same code as the render's (backend
 * modules/editor/plate-layout.ts): pixels of the output frame. JetBrains Mono:
 * every glyph 0.6 em wide, its line 1.32 em as FreeType rounds it.
 */
export const GLYPH_ADVANCE = 0.6;
export const PLATE_PAD = 0.32;
export const MIN_FONT_PX = 8;

export type PlateKind = 'timer' | 'caption';

const LINE: Record<PlateKind, { height: number; baseline: number }> = {
  timer: { height: 0.75, baseline: 0.74 },
  caption: { height: 1.12, baseline: 0.92 },
};

export interface PlateLayout {
  font: number;
  x: number;
  y: number;
  w: number;
  h: number;
  textX: number;
  baseline: number;
  lineStep: number;
}

/** A caption's lines as they are drawn: composed characters, a tab as one space. */
export function textLines(text: string): string[] {
  return text.normalize('NFC').replace(/\t/g, ' ').split('\n');
}

export function plateLayout(
  kind: PlateKind,
  at: { x: number; y: number; size: number },
  lines: readonly string[],
  frame: { w: number; h: number },
): PlateLayout {
  const font = Math.max(MIN_FONT_PX, Math.round(at.size * frame.h));
  const pad = Math.max(2, Math.round(font * PLATE_PAD));
  const line = LINE[kind];
  const lineStep = Math.round(line.height * font);
  const chars = Math.max(1, ...lines.map((l) => Array.from(l).length));
  const textW = chars * GLYPH_ADVANCE * font;
  const textH = lineStep * Math.max(1, lines.length);
  const w = even(textW + 2 * pad);
  const h = even(textH + 2 * pad);
  const x = clamp(evenPos(at.x * frame.w), 0, Math.max(0, frame.w - w));
  const y = clamp(evenPos(at.y * frame.h), 0, Math.max(0, frame.h - h));
  return {
    font,
    x,
    y,
    w,
    h,
    textX: x + (w - textW) / 2,
    baseline: y + (h - textH) / 2 + (lineStep - line.height * font) / 2 + line.baseline * font,
    lineStep,
  };
}

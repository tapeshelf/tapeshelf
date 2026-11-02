/**
 * The video editor's description of an edit: what is done to the ORIGINAL, never to
 * an earlier result, so an edit can be changed or undone without losing quality.
 *
 * Coordinates: the frame is the original turned by `rotate` and `flipH/flipV` ("the turned frame");
 * `crop` and the blurs are fractions of it. Timers and captions are fractions of the output frame
 * (after the crop). Times are seconds of the original's timeline, cuts included.
 */

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export type BlurMode = 'blur' | 'box';

export interface BlurItem extends TimeRange {
  rect: Rect;
  mode: BlurMode;
}

/** A stopwatch from 0:00 at `start` that stops at `end`, stays TIMER_HOLD_SEC more, then goes. */
export interface TimerItem extends TimeRange {
  /** Top-left corner of the timer's plate, fractions of the output frame. */
  x: number;
  y: number;
  /** Its font size (the em), a fraction of the output frame's height (plate-layout.ts). */
  size: number;
}

export interface CaptionItem extends TimeRange {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface EditSpec {
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  /** Null: the whole turned frame. */
  crop: Rect | null;
  /** What is kept of the timeline; `cuts` are removed from inside it. */
  trim: TimeRange;
  cuts: TimeRange[];
  blurs: BlurItem[];
  timers: TimerItem[];
  captions: CaptionItem[];
  /** 1 = as recorded, 0 = no sound, up to MAX_VOLUME. */
  volume: number;
  /** Even loudness (EBU R128). */
  normalize: boolean;
}

/** What the editor knows about the original (the turned frame comes from these). */
export interface EditSource {
  /** Display size of the original (its own rotation already applied by the player). */
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
  /** The original is HDR (PQ, HLG): the render brings it to SDR, as its upload was. */
  hdr?: boolean;
}

export const TIMER_HOLD_SEC = 5;
export const MAX_VOLUME = 2;
export const MAX_ITEMS = 20;
export const MAX_CUTS = 50;
export const CAPTION_MAX = 200;
/** The shortest result worth rendering, and the shortest piece kept between two cuts. */
export const MIN_OUTPUT_SEC = 1;
export const MIN_PIECE_SEC = 0.05;
/** The smallest crop, as a fraction of the turned frame's side. */
export const MIN_CROP = 0.05;
export const MIN_TEXT_SIZE = 0.02;
export const MAX_TEXT_SIZE = 0.3;

export class EditSpecError extends Error {}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** No change at all: saving it is going back to the original. */
export function isIdentity(spec: EditSpec, source: EditSource): boolean {
  const fullCrop =
    !spec.crop ||
    (spec.crop.x <= 0 &&
      spec.crop.y <= 0 &&
      spec.crop.w >= 1 &&
      spec.crop.h >= 1);
  const fullTrim =
    spec.trim.start <= 0 && spec.trim.end >= source.durationSec - 0.001;
  return (
    spec.rotate === 0 &&
    !spec.flipH &&
    !spec.flipV &&
    fullCrop &&
    fullTrim &&
    spec.cuts.length === 0 &&
    spec.blurs.length === 0 &&
    spec.timers.length === 0 &&
    spec.captions.length === 0 &&
    spec.volume === 1 &&
    !spec.normalize
  );
}

/** The parts of the original that stay, in order: the trim minus the cuts. */
export function keptSegments(spec: EditSpec): TimeRange[] {
  const cuts = [...spec.cuts]
    .map((c) => ({
      start: Math.max(c.start, spec.trim.start),
      end: Math.min(c.end, spec.trim.end),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
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

/** Size of the turned frame in pixels. */
export function turnedSize(
  spec: Pick<EditSpec, 'rotate'>,
  source: EditSource,
): { w: number; h: number } {
  return spec.rotate === 90 || spec.rotate === 270
    ? { w: source.height, h: source.width }
    : { w: source.width, h: source.height };
}

/**
 * Checks an edit against its original and returns it tidied: numbers clamped into range, ranges in
 * order, nothing outside the timeline. Throws EditSpecError for what cannot be meant (an empty
 * result, a crop smaller than MIN_CROP, too many items).
 */
export function normalizeEdit(input: EditSpec, source: EditSource): EditSpec {
  const D = source.durationSec;
  if (!finite(D) || D <= 0)
    throw new EditSpecError('the original has no duration');
  if (!ROTATIONS.includes(input.rotate))
    throw new EditSpecError('rotate must be 0, 90, 180 or 270');
  const range = (r: TimeRange, what: string): TimeRange => {
    if (!finite(r.start) || !finite(r.end))
      throw new EditSpecError(`${what}: times must be numbers`);
    const start = clamp(r.start, 0, D);
    const end = clamp(r.end, 0, D);
    if (end <= start)
      throw new EditSpecError(`${what}: the end must come after the start`);
    return { start: round3(start), end: round3(end) };
  };
  const rect = (r: Rect, what: string, min: number): Rect => {
    if (![r.x, r.y, r.w, r.h].every(finite))
      throw new EditSpecError(`${what}: not a rectangle`);
    const x = clamp(r.x, 0, 1);
    const y = clamp(r.y, 0, 1);
    const w = clamp(r.w, 0, 1 - x);
    const h = clamp(r.h, 0, 1 - y);
    if (w < min || h < min) throw new EditSpecError(`${what}: too small`);
    return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
  };
  const place = (p: { x: number; y: number; size: number }, what: string) => {
    if (![p.x, p.y, p.size].every(finite))
      throw new EditSpecError(`${what}: bad position`);
    return {
      x: round4(clamp(p.x, 0, 1)),
      y: round4(clamp(p.y, 0, 1)),
      size: round4(clamp(p.size, MIN_TEXT_SIZE, MAX_TEXT_SIZE)),
    };
  };
  const many = <T>(list: T[] | undefined, max: number, what: string): T[] => {
    const items = list ?? [];
    if (items.length > max) throw new EditSpecError(`at most ${max} ${what}`);
    return items;
  };

  const trim = range(input.trim, 'trim');
  const spec: EditSpec = {
    rotate: input.rotate,
    flipH: !!input.flipH,
    flipV: !!input.flipV,
    crop: input.crop ? rect(input.crop, 'crop', MIN_CROP) : null,
    trim,
    cuts: many(input.cuts, MAX_CUTS, 'cuts').map((c) => range(c, 'cut')),
    blurs: many(input.blurs, MAX_ITEMS, 'blurred areas').map((b) => ({
      ...range(b, 'blur'),
      rect: rect(b.rect, 'blur', 0.01),
      mode: b.mode === 'box' ? 'box' : 'blur',
    })),
    timers: many(input.timers, MAX_ITEMS, 'timers').map((t) => ({
      ...range(t, 'timer'),
      ...place(t, 'timer'),
    })),
    captions: many(input.captions, MAX_ITEMS, 'captions').map((c) => {
      const text = String(c.text ?? '')
        .replace(/\r\n?/g, '\n')
        .trim();
      if (!text) throw new EditSpecError('a caption needs text');
      if (text.length > CAPTION_MAX)
        throw new EditSpecError(
          `a caption is at most ${CAPTION_MAX} characters`,
        );
      return { ...range(c, 'caption'), ...place(c, 'caption'), text };
    }),
    volume: finite(input.volume)
      ? round3(clamp(input.volume, 0, MAX_VOLUME))
      : 1,
    normalize: !!input.normalize,
  };
  if (
    spec.crop &&
    spec.crop.x <= 0 &&
    spec.crop.y <= 0 &&
    spec.crop.w >= 1 &&
    spec.crop.h >= 1
  )
    spec.crop = null;
  if (outputDuration(spec) < MIN_OUTPUT_SEC)
    throw new EditSpecError(
      `the result must be at least ${MIN_OUTPUT_SEC} s long`,
    );
  return spec;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** An edit that changes nothing: the editor's starting point for an unedited video. */
export function emptyEdit(source: EditSource): EditSpec {
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

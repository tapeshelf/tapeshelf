/**
 * Where a timer or a caption is drawn: one layout that the render follows
 * and the editor's preview follows too, so the plate in the editor is the plate in the video, to
 * the pixel. All numbers are pixels of the output frame (after the crop and the fit).
 *
 * The font is JetBrains Mono: every glyph is 0.6 em wide, and its line (ascent 1.02 + descent
 * 0.30 em) is rounded to whole pixels by FreeType, which drawtext steps lines by. The text is
 * placed by its baseline, the plate is drawn as a box of its own: neither depends on which glyphs
 * a text happens to have, as drawtext's own box does.
 *
 * The browser has the same code (frontend features/editor/edit-model.ts); both specs check the
 * same numbers.
 */

export const GLYPH_ADVANCE = 0.6;
export const FONT_LINE = 1.32;
export const PLATE_PAD = 0.32;
export const MIN_FONT_PX = 8;

export type PlateKind = 'timer' | 'caption';

/**
 * One line of text, in em: its height and where its baseline lies in it. A timer has digits only
 * (they reach from −0.01 to 0.74 em): its plate is as tight around them as on the sides. A
 * caption's line has room for capitals above and descenders below.
 */
const LINE: Record<PlateKind, { height: number; baseline: number }> = {
  timer: { height: 0.75, baseline: 0.74 },
  caption: { height: 1.12, baseline: 0.92 },
};

export interface PlateLayout {
  /** Font size (the em), px. */
  font: number;
  /** The plate: its corner and size, even numbers, inside the frame whenever it fits. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where every line starts, and the baseline of the first one. */
  textX: number;
  baseline: number;
  /** From one baseline to the next. */
  lineStep: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** A size: even, at least 2. */
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
/** A position: even (the frame's colour is stored for pairs of pixels). */
const evenPos = (v: number) => Math.round(v / 2) * 2;

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
    baseline:
      y +
      (h - textH) / 2 +
      (lineStep - line.height * font) / 2 +
      line.baseline * font,
    lineStep,
  };
}

/**
 * The spans of a timer during which its text keeps one length (`m:ss` grows a digit at 10:00,
 * `h:mm:ss` at 10:00:00): a plate for each. `to` is open but for the last span, which lasts to
 * the end of the hold.
 */
export function timerPhases(
  start: number,
  end: number,
  hold: number,
): { from: number; to: number; chars: number }[] {
  const run = end - start;
  const hours = run >= 3600;
  const unit = hours ? 3600 : 60;
  const fixed = hours ? 6 : 3; // ":mm:ss" or ":ss"
  const out: { from: number; to: number; chars: number }[] = [];
  let from = 0;
  for (let digits = 1; ; digits++) {
    const next = unit * 10 ** digits;
    if (next > run) {
      out.push({ from: start + from, to: end + hold, chars: digits + fixed });
      return out;
    }
    out.push({ from: start + from, to: start + next, chars: digits + fixed });
    from = next;
  }
}

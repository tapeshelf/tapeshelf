/**
 * The shelf's mosaic: justified rows where every video keeps its own shape — a
 * phone clip stands tall, a film lies wide. Only when tiles get small does a tall video widen to a
 * minimum width, its picture cut at the top and bottom, so it never turns into a sliver.
 * The row height follows how many videos there are: one or two fill the screen, a few dozen
 * settle into a dense, even grid.
 */

/** Narrowest and widest shape a tile may take: 9:16 portrait up to a little past 21:9. */
export const MIN_ASPECT = 9 / 16;
export const MAX_ASPECT = 2.4;
export type StackLayoutKind = 'grid' | 'row' | 'column' | 'feature';

export interface StackLayout {
  kind: StackLayoutKind;
  /** Pictures shown: the last says "+N" when the stack holds more. */
  cells: number;
  /** Width over height of the whole tile. */
  aspect: number;
}

/** The label strip and margins take about this share of a stack tile's height. */
const STACK_CHROME = 0.86;

/**
 * How a stack lays out its pictures: no empty cells, as little cut as the shapes allow.
 * Tall videos stand side by side — two, three or four in a row; wide ones lie one above the other
 * (two), a big cover over two small ones (three), or a 2×2 grid (four and more). The tile takes the
 * shape of what it holds.
 */
export function stackLayout(shapes: readonly number[], size: number): StackLayout {
  const shown = shapes.slice(0, 4);
  const cells = Math.max(2, Math.min(4, size, shown.length || size));
  const tall = shown.filter((a) => a < 0.9).length * 2 > shown.length;
  const mean = shown.length ? shown.reduce((s, a) => s + a, 0) / shown.length : DEFAULT_ASPECT;
  const clampAspect = (a: number) => Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, a * STACK_CHROME));
  // Two go one above the other only when both are wide; any tall or square one puts them side by side.
  const bothWide = cells === 2 && [0, 1].every((i) => (shown[i] ?? DEFAULT_ASPECT) > 1);
  if (tall || (cells === 2 && !bothWide)) {
    const a = Math.min(tall ? 0.9 : 1, Math.max(MIN_ASPECT, mean));
    return { kind: 'row', cells, aspect: clampAspect(cells * a) };
  }
  const a = Math.min(MAX_ASPECT, Math.max(1, mean));
  if (cells === 2) return { kind: 'column', cells, aspect: clampAspect(a / 2) };
  if (cells === 3) return { kind: 'feature', cells, aspect: clampAspect(a / 1.5) };
  return { kind: 'grid', cells: 4, aspect: clampAspect(a) };
}
/** Shape of a video whose size is not known yet (still processing). */
export const DEFAULT_ASPECT = 16 / 9;

export interface MosaicOptions {
  /** Width of the container, px. */
  width: number;
  /** Height of the viewport, px: the tallest tile still fits on screen. */
  viewport: number;
  /** Space between tiles, px (horizontal and vertical). */
  gap: number;
  /**
   * How many videos the size is chosen for: the whole shelf, so every section and category of one
   * page shows its videos at the same size. Defaults to the videos laid out here.
   */
  count?: number;
  /** How far a row may grow past the common height to fill the width exactly (0.12 = +12 %). */
  tolerance?: number;
  /**
   * The viewer's own zoom: scales the common height and the smallest sizes; a lonely video
   * still fills the screen and no more. 1 = as the shelf chose.
   */
  zoom?: number;
}

export interface MosaicTile {
  index: number;
  width: number;
  height: number;
}

export interface MosaicRow {
  tiles: MosaicTile[];
  height: number;
  /** Narrower than the container (a last row, or one lonely video): the page decides how to align it. */
  partial: boolean;
}

/** The shape a tile takes for a video of this size. */
export function aspectOf(
  width: number | null | undefined,
  height: number | null | undefined,
): number {
  if (!width || !height) return DEFAULT_ASPECT;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height));
}

/** The tallest a row may grow: a lonely video fills the screen, no more. */
export function maxRowHeight(o: MosaicOptions): number {
  return Math.max(160, Math.round(o.viewport * 0.74));
}

/**
 * The smallest a row should shrink: phones keep two wide tiles a row, desks a calm grid. A little
 * bigger than at first: a big shelf no longer turns into stamps.
 */
export function minRowHeight(o: MosaicOptions): number {
  return Math.round((o.width < 640 ? 124 : 208) * (o.zoom ?? 1));
}

/** The narrowest a tile should be at the shelf's size: a phone's two-tile rows, a desk's grid. */
export function minTileWidth(o: MosaicOptions): number {
  // A phone: three tall videos fill a line at the smallest size.
  return Math.round((o.width < 640 ? 110 : 150) * (o.zoom ?? 1));
}

/**
 * The row height the layout aims for. Few videos → huge tiles; every new one makes the rows a
 * little lower, so the shelf grows from a showcase into a grid without ever jumping a size.
 */
export function targetRowHeight(count: number, o: MosaicOptions): number {
  const max = maxRowHeight(o);
  const min = minRowHeight(o);
  if (count <= 1) return max;
  const natural = (max / Math.pow(count, 0.48)) * (o.zoom ?? 1);
  return Math.round(Math.min(max, Math.max(min, natural)));
}

/**
 * The shapes the tiles take: small tiles none narrower than the minimum width at the common height
 * big ones keep their video's shape.
 */
export function tileShapes(natural: readonly number[], o: MosaicOptions): number[] {
  const target = targetRowHeight(Math.max(1, o.count ?? natural.length), o);
  const floor = Math.max(MIN_ASPECT, minTileWidth(o) / target);
  return natural.map((a) => Math.max(a, floor));
}

/**
 * Breaks the videos into rows of one common height, chosen for the whole shelf (`count`). Every row
 * but the last fills the width exactly: scaled a little (within `tolerance`) when it can,
 * further when it must, so the shelf has no holes; only the last row may stop short, at the common
 * height. The break points come from a small dynamic programme, like justified text, so rows keep
 * close to the common size and an orphan at the end is rare.
 */
export function layoutMosaic(natural: readonly number[], o: MosaicOptions): MosaicRow[] {
  const n = natural.length;
  if (n === 0 || o.width <= 0) return [];
  const width = o.width;
  const tolerance = o.tolerance ?? 0.12;
  const max = maxRowHeight(o);
  const target = targetRowHeight(Math.max(1, o.count ?? n), o);
  const aspects = tileShapes(natural, o);

  const maxPerRow = Math.max(1, Math.min(n, Math.ceil(width / (MIN_ASPECT * minRowHeight(o))) + 1));
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  const narrowAllowed = minTileWidth(o) * 0.9;
  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    let sum = 0;
    let narrowest = Infinity;
    for (let j = i + 1; j <= Math.min(n, i + maxPerRow); j++) {
      sum += aspects[j - 1]!;
      narrowest = Math.min(narrowest, aspects[j - 1]!);
      const gaps = (j - i - 1) * o.gap;
      // A row squeezed to fill its line must not make a tile a sliver again: more tiles
      // would only squeeze it further.
      const fitHeight = (width - gaps) / sum;
      if (
        j - i > 1 &&
        fitHeight <= target * (1 + tolerance) &&
        fitHeight * narrowest < narrowAllowed
      )
        break;
      const cost = rowCost(
        fitHeight,
        target,
        tolerance,
        max,
        j - i,
        j === n,
        sum * target + gaps,
        width,
      );
      if (cost === Infinity) break; // adding more only makes the row longer
      if (best[i]! + cost < best[j]!) {
        best[j] = best[i]! + cost;
        from[j] = i;
      }
    }
  }

  const breaks: number[] = [];
  for (let j = n; j > 0; j = from[j]!) breaks.unshift(j);
  const plans = breaks.map((end, k) => {
    const begin = k === 0 ? 0 : breaks[k - 1]!;
    const indexes = Array.from({ length: end - begin }, (_, i) => begin + i);
    const shapes = indexes.map((i) => aspects[i]!);
    const sum = shapes.reduce((acc, a) => acc + a, 0);
    const fit = (width - (indexes.length - 1) * o.gap) / sum;
    const last = end === n;
    // A row too short to fill its line even at a lonely video's size is cut a little to fill it.
    const cut = !last && fit > max && fit <= max * CUT_LIMIT ? fit / max : 1;
    const justified = fit <= target * (1 + tolerance) || (!last && fit <= max * CUT_LIMIT);
    return { indexes, shapes: shapes.map((a) => a * cut), fit: fit / cut, justified };
  });
  // A row that cannot fill its line (the last, or one no arrangement could fill) takes the size of
  // the rows that do, so the whole page keeps one size; with no full row at all, the common height.
  const filled = plans.filter((p) => p.justified).map((p) => Math.min(max, p.fit));
  const common = filled.length ? median(filled) : target;
  const rows = plans.map((p) => {
    // A row that cannot fill its line keeps the page's size, but not so small that a tall video in
    // it turns into a sliver.
    const keep = Math.max(
      Math.min(common, p.fit),
      Math.min(p.fit, narrowAllowed / Math.min(...p.shapes)),
    );
    const height = Math.min(max, p.justified ? p.fit : keep);
    return row(p.indexes, p.shapes, height, width, o.gap, height < p.fit - 0.5);
  });
  return rows;
}

function rowCost(
  fit: number,
  target: number,
  tolerance: number,
  max: number,
  items: number,
  last: boolean,
  naturalWidth: number,
  width: number,
): number {
  const ratio = fit / target;
  if (ratio < SHRINK_LIMIT) {
    // Too long for the line: only a lonely video wider than the page may shrink to fit it.
    return items === 1 ? 0 : Infinity;
  }
  if (ratio <= 1 + tolerance) return Math.pow(ratio - 1, 2);
  const empty = Math.max(0, 1 - naturalWidth / width);
  // The last row too short to fill its line stays at the common size, the rest of the line empty:
  // cheap, so rows above keep the common size rather than grow to spare it (a month of 30 alike
  // tiles drew rows of 3 among rows of 4).
  if (last) return 0.05 * empty;
  // Any other row fills its line: it grows past the common height, dearer the further...
  if (fit <= max) return grown(ratio, tolerance);
  // ...up to a lonely video's size, then its tiles are cut a little wider; a row that would need
  // more is left short. Both only when nothing else fits.
  if (fit <= max * CUT_LIMIT) return CUT_COST + grown(max / target, tolerance) + (fit / max - 1);
  return LEFT_SHORT + empty;
}

function grown(ratio: number, tolerance: number): number {
  return Math.pow(ratio - 1, 2) + GROW_COST * Math.pow(ratio - 1 - tolerance, 2);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A row may shrink this far below the common height so that videos stand side by side. */
const SHRINK_LIMIT = 0.7;
/** How much dearer growing past the tolerance is than staying within it. */
const GROW_COST = 3;
/** A row cut wider to fill its line: rare, as a tall video in small tiles. */
const CUT_COST = 2;
/** At most this much wider than the videos' own shapes. */
const CUT_LIMIT = 1.35;
/** A short row in the middle of the shelf: a last resort. */
const LEFT_SHORT = 10;

/** Whole-pixel tiles of one row; a full row adds up to the container width exactly. */
function row(
  indexes: number[],
  shapes: number[],
  height: number,
  width: number,
  gap: number,
  partial: boolean,
): MosaicRow {
  const h = Math.round(height);
  const exact = shapes.map((a) => a * height);
  const widths = exact.map((w) => Math.floor(w));
  if (!partial) {
    // Hand out the pixels lost to rounding, largest remainders first.
    let rest = width - (indexes.length - 1) * gap - widths.reduce((s, w) => s + w, 0);
    const order = exact
      .map((w, k) => ({ k, r: w - Math.floor(w) }))
      .sort((a, b) => b.r - a.r)
      .map((x) => x.k);
    for (let i = 0; rest > 0 && order.length; i = (i + 1) % order.length, rest--) {
      const k = order[i]!;
      widths[k] = widths[k]! + 1;
    }
  }
  return {
    tiles: indexes.map((index, k) => ({ index, width: widths[k]!, height: h })),
    height: h,
    partial,
  };
}

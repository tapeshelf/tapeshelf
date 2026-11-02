import {
  DEFAULT_ASPECT,
  MIN_ASPECT,
  aspectOf,
  layoutMosaic,
  maxRowHeight,
  minRowHeight,
  minTileWidth,
  stackLayout,
  targetRowHeight,
} from './mosaic-layout';

const DESK = { width: 1360, viewport: 900, gap: 12 };
const PHONE = { width: 358, viewport: 780, gap: 8 };
const WIDE = 16 / 9;
const TALL = 9 / 16;

function rowWidth(tiles: { width: number }[], gap: number): number {
  return tiles.reduce((s, t) => s + t.width, 0) + (tiles.length - 1) * gap;
}

describe('mosaic layout', () => {
  it('takes the shape from the video and clamps the extremes', () => {
    expect(aspectOf(1920, 1080)).toBeCloseTo(WIDE);
    expect(aspectOf(1080, 1920)).toBeCloseTo(TALL);
    expect(aspectOf(4000, 500)).toBe(2.4);
    expect(aspectOf(100, 1000)).toBe(MIN_ASPECT);
    expect(aspectOf(null, null)).toBe(DEFAULT_ASPECT);
  });

  it('shows one video as large as the screen allows, never wider than the page', () => {
    const [wide] = layoutMosaic([WIDE], DESK);
    expect(wide!.tiles[0]!.height).toBe(maxRowHeight(DESK));
    expect(wide!.tiles[0]!.width).toBeLessThanOrEqual(DESK.width);
    const [tall] = layoutMosaic([TALL], DESK);
    expect(tall!.tiles[0]!.height).toBe(maxRowHeight(DESK));
    expect(tall!.tiles[0]!.width / tall!.tiles[0]!.height).toBeCloseTo(TALL, 2);
    expect(tall!.partial).toBe(true);
    const [phone] = layoutMosaic([WIDE], PHONE);
    expect(phone!.tiles[0]!.width).toBe(PHONE.width); // limited by the width, not the screen
  });

  it('lowers the rows as the shelf fills up, within sensible bounds', () => {
    const heights = [1, 2, 3, 6, 12, 40, 200].map((n) => targetRowHeight(n, DESK));
    for (let i = 1; i < heights.length; i++)
      expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]!);
    expect(heights.at(-1)).toBe(minRowHeight(DESK));
    expect(heights[0]).toBe(maxRowHeight(DESK));
  });

  it('fills every full row to the exact width and keeps every tile in its own shape (tall ones no narrower than the minimum)', () => {
    const shapes = [
      WIDE,
      TALL,
      WIDE,
      4 / 3,
      TALL,
      TALL,
      WIDE,
      1,
      WIDE,
      TALL,
      2.35,
      WIDE,
      TALL,
      WIDE,
    ];
    for (const o of [DESK, PHONE]) {
      const rows = layoutMosaic(shapes, o);
      const floor = Math.max(MIN_ASPECT, minTileWidth(o) / targetRowHeight(shapes.length, o));
      expect(rows.flatMap((r) => r.tiles.map((t) => t.index))).toEqual(shapes.map((_, i) => i));
      for (const r of rows) {
        if (!r.partial) expect(rowWidth(r.tiles, o.gap)).toBe(o.width);
        else expect(rowWidth(r.tiles, o.gap)).toBeLessThanOrEqual(o.width);
        for (const t of r.tiles) {
          // whole pixels: the shape is right to within a pixel or two of rounding
          const shape = Math.max(shapes[t.index]!, floor);
          expect(Math.abs(t.width - shape * t.height)).toBeLessThanOrEqual(2);
          expect(t.height).toBe(r.height);
        }
      }
    }
  });

  it('leaves no hole: every row but the last meets the edge, whatever the shapes', () => {
    const kinds = [WIDE, TALL, 4 / 3, 1, 2.35, 3 / 4, 2.4];
    for (const o of [DESK, PHONE, { ...DESK, width: 1000 }, { ...PHONE, width: 600 }])
      for (const n of [5, 9, 17, 33, 60])
        for (let seed = 0; seed < 12; seed++) {
          const shapes = Array.from(
            { length: n },
            (_, i) => kinds[(i * i * 3 + i * seed + seed) % 7]!,
          );
          for (const count of [undefined, 40, 400]) {
            const rows = layoutMosaic(shapes, { ...o, count });
            for (const r of rows.slice(0, -1)) {
              expect(r.partial).toBe(false);
              expect(rowWidth(r.tiles, o.gap)).toBe(o.width);
            }
          }
        }
  });

  it('alike tiles keep one size; the last row is the one left short', () => {
    for (const n of [30, 50, 41]) {
      const rows = layoutMosaic(Array(n).fill(WIDE), { ...DESK, count: 120 });
      const full = rows.slice(0, -1);
      expect(new Set(full.map((r) => r.tiles.length)).size).toBe(1);
      expect(new Set(full.map((r) => r.height)).size).toBe(1);
    }
  });

  it('keeps the rows of a big shelf close to the target height', () => {
    const shapes = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? TALL : WIDE));
    const rows = layoutMosaic(shapes, DESK);
    const target = targetRowHeight(60, DESK);
    for (const r of rows.slice(0, -1)) {
      expect(r.height).toBeGreaterThan(target * 0.7);
      expect(r.height).toBeLessThan(target * 1.4);
    }
    // A last row that fills its line may grow like any other, within the tolerance (+12 %).
    expect(rows.at(-1)!.height).toBeLessThanOrEqual(Math.ceil(target * 1.12));
  });

  it('the viewer’s zoom makes the tiles bigger or smaller, a lonely video still the screen', () => {
    const shapes = Array(60).fill(WIDE);
    const at = (zoom: number) => layoutMosaic(shapes, { ...DESK, zoom })[0]!.height;
    expect(at(0.6)).toBeLessThan(at(1));
    expect(at(1.7)).toBeGreaterThan(at(1));
    expect(targetRowHeight(60, { ...DESK, zoom: 1.7 })).toBeGreaterThan(targetRowHeight(60, DESK));
    expect(minRowHeight({ ...DESK, zoom: 0.6 })).toBeLessThan(minRowHeight(DESK));
    expect(layoutMosaic([WIDE], { ...DESK, zoom: 1.7 })[0]!.height).toBe(maxRowHeight(DESK));
  });

  it('the smallest tiles are a little bigger than at first', () => {
    expect(minRowHeight(DESK)).toBe(208);
    expect(minRowHeight(PHONE)).toBe(124);
    // A phone still shows two wide videos a row on a big shelf.
    const rows = layoutMosaic(Array(40).fill(WIDE), { ...PHONE, width: 328 });
    expect(rows[0]!.tiles).toHaveLength(2);
  });

  it('puts two wide videos side by side and keeps one size when the third goes below', () => {
    expect(layoutMosaic([WIDE, WIDE], DESK)).toHaveLength(1);
    const three = layoutMosaic([WIDE, WIDE, WIDE], DESK);
    expect(new Set(three.map((r) => r.height)).size).toBe(1);
  });

  it('sizes a small category like the whole shelf it belongs to', () => {
    const alone = layoutMosaic([TALL, WIDE], DESK);
    const ofForty = layoutMosaic([TALL, WIDE], { ...DESK, count: 40 });
    expect(ofForty[0]!.height).toBe(targetRowHeight(40, DESK));
    expect(alone[0]!.height).toBeGreaterThan(ofForty[0]!.height * 1.5);
    // the same videos in two sections of one page come out the same size
    const a = layoutMosaic([WIDE, TALL, WIDE, WIDE, TALL, WIDE, TALL, WIDE], {
      ...DESK,
      count: 12,
    });
    const b = layoutMosaic([TALL, WIDE, WIDE], { ...DESK, count: 12 });
    for (const r of [...a, ...b])
      expect(Math.abs(r.height / targetRowHeight(12, DESK) - 1)).toBeLessThan(0.31);
  });

  it('a tall video in small tiles widens to the minimum width, cut rather than a sliver', () => {
    for (const o of [DESK, PHONE]) {
      const rows = layoutMosaic(Array(60).fill(TALL), o);
      const narrowest = Math.min(...rows.flatMap((r) => r.tiles.map((t) => t.width)));
      // the common height of a full row moves within the tolerance, so a few pixels either way
      expect(narrowest).toBeGreaterThanOrEqual(minTileWidth(o) * 0.9 - 1);
      // before: a 9:16 sliver at the smallest row height
      expect(narrowest).toBeGreaterThan(TALL * minRowHeight(o) * 1.15);
    }
    // Big tiles keep the video's own shape.
    const [few] = layoutMosaic([TALL, TALL], DESK);
    for (const t of few!.tiles) expect(t.width / t.height).toBeCloseTo(TALL, 2);
  });

  it('lays out nothing for an empty shelf or a container not measured yet', () => {
    expect(layoutMosaic([], DESK)).toEqual([]);
    expect(layoutMosaic([WIDE], { ...DESK, width: 0 })).toEqual([]);
  });
});

describe('stack layout', () => {
  it('lays out what the stack holds: no empty cells, as little cut as the shapes allow', () => {
    // Two tall: side by side, a near-square tile.
    expect(stackLayout([TALL, TALL], 2)).toMatchObject({ kind: 'row', cells: 2 });
    expect(stackLayout([TALL, TALL], 2).aspect).toBeCloseTo(2 * TALL * 0.86, 2);
    // Three and four tall in a row; a fifth shows as "+N" in the fourth.
    expect(stackLayout([TALL, TALL, TALL], 3)).toMatchObject({ kind: 'row', cells: 3 });
    expect(stackLayout([TALL, TALL, TALL, TALL], 9)).toMatchObject({ kind: 'row', cells: 4 });
    // Two wide one above the other; a tall or square one with a wide: side by side.
    expect(stackLayout([WIDE, WIDE], 2)).toMatchObject({ kind: 'column', cells: 2 });
    expect(stackLayout([TALL, WIDE], 2)).toMatchObject({ kind: 'row', cells: 2 });
    expect(stackLayout([WIDE, 1], 2)).toMatchObject({ kind: 'row', cells: 2 });
    expect(stackLayout([WIDE], 2)).toMatchObject({ kind: 'column', cells: 2 }); // the other unknown
    // Three as a cover over two, four and more in 2×2.
    expect(stackLayout([WIDE, WIDE, WIDE], 3)).toMatchObject({ kind: 'feature', cells: 3 });
    expect(stackLayout([WIDE, WIDE, WIDE, WIDE], 7)).toMatchObject({ kind: 'grid', cells: 4 });
    // A mix goes by the majority; unknown shapes count as wide.
    expect(stackLayout([TALL, WIDE, TALL], 3).kind).toBe('row');
    expect(stackLayout([], 5)).toMatchObject({ kind: 'grid', cells: 4 });
    // Never a sliver or a banner.
    for (const s of [
      stackLayout([TALL, TALL], 2),
      stackLayout([WIDE, WIDE], 2),
      stackLayout([TALL, TALL, TALL, TALL], 4),
    ]) {
      expect(s.aspect).toBeGreaterThanOrEqual(MIN_ASPECT);
      expect(s.aspect).toBeLessThanOrEqual(2.4);
    }
  });
});

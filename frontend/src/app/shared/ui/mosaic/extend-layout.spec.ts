import { describe, expect, it } from 'vitest';

import { extendLayout } from './mosaic';
import { layoutMosaic } from './mosaic-layout';

const O = { width: 1360, viewport: 900, gap: 8, count: 200 };
const shapes = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => [16 / 9, 9 / 16, 4 / 3, 1, 2.35][(i * 7 + seed) % 5]!);

/** Every video once, in order; every row but the last meets the edge. */
function expectWhole(rows: ReturnType<typeof layoutMosaic>, n: number): void {
  expect(rows.flatMap((r) => r.tiles.map((t) => t.index))).toEqual(
    Array.from({ length: n }, (_, i) => i),
  );
  for (const row of rows.slice(0, -1)) {
    expect(row.partial).toBe(false);
    expect(row.tiles.reduce((w, t) => w + t.width, 0) + (row.tiles.length - 1) * O.gap).toBe(
      O.width,
    );
  }
}

describe('extendLayout', () => {
  it('"Load more" keeps every drawn tile where it was; only new ones follow, and no hole stays', () => {
    for (let seed = 0; seed < 5; seed++) {
      const all = shapes(120, seed);
      const keys = all.map((_, i) => `v${i}`);
      const first = layoutMosaic(all.slice(0, 60), O);
      const last = { keys: keys.slice(0, 60), aspects: all.slice(0, 60), options: O, rows: first };
      const next = extendLayout(last, keys, all, O);
      // The rows drawn before, tile by tile, at the same size; a partial last row only gains tiles
      // or, when none close it, is laid out again with them.
      const tail = first.at(-1)!;
      const closed = tail.tiles.every(
        (t, k) => JSON.stringify(next[first.length - 1]!.tiles[k]) === JSON.stringify(t),
      );
      first.slice(0, closed ? undefined : -1).forEach((row, r) => {
        const now = next[r]!;
        expect(now.height).toBe(row.height);
        row.tiles.forEach((t, k) => expect(now.tiles[k]).toEqual(t));
      });
      expectWhole(next, all.length);
    }
  });

  it('a short last row held back for the next page comes with it: nothing drawn moves', () => {
    for (let seed = 0; seed < 5; seed++) {
      const all = shapes(120, seed);
      const keys = all.map((_, i) => `v${i}`);
      const laid = layoutMosaic(all.slice(0, 60), O);
      const drawn = laid.at(-1)!.partial ? laid.slice(0, -1) : laid;
      const last = { keys: keys.slice(0, 60), aspects: all.slice(0, 60), options: O, rows: drawn };
      const next = extendLayout(last, keys, all, O);
      drawn.forEach((row, r) => expect(next[r]).toEqual(row));
      expectWhole(next, all.length);
      // No next page after all: the rows held back are laid out at once.
      expectWhole(extendLayout(last, keys.slice(0, 60), all.slice(0, 60), O), 60);
    }
  });

  it('anything but growth at the end lays the page out anew', () => {
    const all = shapes(40, 1);
    const keys = all.map((_, i) => `v${i}`);
    const last = { keys, aspects: all, options: O, rows: layoutMosaic(all, O) };
    expect(extendLayout(last, keys, all, O)).toBe(last.rows); // the same shelf again
    const reordered = [...keys].reverse();
    expect(extendLayout(last, reordered, [...all].reverse(), O)).toEqual(
      layoutMosaic([...all].reverse(), O),
    );
    expect(extendLayout(last, keys, all, { ...O, width: 900 })).toEqual(
      layoutMosaic(all, { ...O, width: 900 }),
    );
  });
});

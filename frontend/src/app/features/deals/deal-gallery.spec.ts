import { boardTileHeight } from './deal-gallery';

const WIDE = 16 / 9;
const TALL = 9 / 16;

describe('boardTileHeight', () => {
  it('makes one video alone big, about three times a strip’s tile, within the side', () => {
    expect(boardTileHeight([WIDE], 1000)).toBe(240);
    // A desk's side is about 390 px: a wide video fills it.
    const h = boardTileHeight([WIDE], 390);
    expect(h * WIDE).toBeLessThanOrEqual(390);
    expect(h).toBeGreaterThanOrEqual(200);
    // A tall one stands at full height.
    expect(boardTileHeight([TALL], 390)).toBe(240);
  });

  it('shrinks as the videos grow in number', () => {
    const sizes = [1, 2, 3, 5].map((n) => boardTileHeight(Array(n).fill(WIDE), 390));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(sizes[0]).toBeGreaterThan(sizes[2]!);
    expect(sizes[3]).toBe(88);
  });

  it('puts three and four two a line, shrinking to fit', () => {
    const h = boardTileHeight([WIDE, WIDE, WIDE], 390);
    expect(2 * h * WIDE + 12).toBeLessThanOrEqual(390);
    expect(h).toBeGreaterThan(88);
  });

  it('never goes below the strip’s height, nor guesses before the width is known', () => {
    expect(boardTileHeight(Array(3).fill(WIDE), 300)).toBe(88);
    expect(boardTileHeight([WIDE], 0)).toBe(88);
    expect(boardTileHeight([], 390)).toBe(88);
  });
});

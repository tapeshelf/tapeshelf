import { chunk, columnsFor } from './shelf-grid';

describe('shelf grid layout', () => {
  it('derives the column count from the container width and tile size', () => {
    expect(columnsFor(0, 'md')).toBe(1);
    expect(columnsFor(200, 'md')).toBe(1);
    expect(columnsFor(438, 'md')).toBe(2); // 2 × 210 + 18
    expect(columnsFor(1200, 'sm')).toBe(7);
    expect(columnsFor(1200, 'lg')).toBe(3);
    expect(columnsFor(10_000, 'sm')).toBe(12);
  });

  it('splits items into rows of the column count', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

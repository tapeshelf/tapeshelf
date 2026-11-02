import { applyOrder, moveAround } from './order.js';

describe('applyOrder', () => {
  it('reorders the moved subset within its own slots', () => {
    expect(applyOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual([
      'a',
      'd',
      'c',
      'b',
      'e',
    ]);
  });

  it('is a no-op when the subset order is unchanged', () => {
    expect(applyOrder(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('ignores unknown and duplicate ids', () => {
    expect(applyOrder(['a', 'b', 'c'], ['zzz', 'c', 'c', 'a'])).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('handles the full list', () => {
    expect(applyOrder(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('moveAround', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  it('puts the moved group before or after the anchor, in their own order', () => {
    expect(moveAround(order, new Set(['d', 'b']), 'a', false)).toEqual([
      'b',
      'd',
      'a',
      'c',
      'e',
    ]);
    expect(moveAround(order, new Set(['a']), 'e', true)).toEqual([
      'b',
      'c',
      'd',
      'e',
      'a',
    ]);
    expect(moveAround(order, new Set(['e']), 'c', true)).toEqual([
      'a',
      'b',
      'c',
      'e',
      'd',
    ]);
  });

  it('leaves the order alone when the anchor moves too or is unknown', () => {
    expect(moveAround(order, new Set(['a', 'b']), 'b', true)).toBe(order);
    expect(moveAround(order, new Set(['a']), 'zz', true)).toBe(order);
  });
});

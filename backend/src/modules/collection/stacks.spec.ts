import { describe, expect, it } from 'vitest';

import { gather, stackCategory } from './stacks.js';

describe('stackCategory', () => {
  it('agrees when every video has the same category, or none has one', () => {
    expect(stackCategory(['a', 'a'])).toEqual({ ok: true, categoryId: 'a' });
    expect(stackCategory([null, null])).toEqual({
      ok: true,
      categoryId: null,
    });
    expect(stackCategory([])).toEqual({ ok: true, categoryId: null });
  });

  it('refuses a mix and names the categories involved', () => {
    expect(stackCategory(['a', null])).toEqual({
      ok: false,
      categories: ['a', null],
    });
    expect(stackCategory(['a', 'b', 'a'])).toEqual({
      ok: false,
      categories: ['a', 'b'],
    });
  });

  it('an instruction wins over any mix', () => {
    expect(stackCategory(['a', null], 'b')).toEqual({
      ok: true,
      categoryId: 'b',
    });
    expect(stackCategory(['a', 'b'], null)).toEqual({
      ok: true,
      categoryId: null,
    });
  });
});

describe('gather', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('a new stack lands where the video it was dropped on sat', () => {
    // e dropped on b: the stack [b, e] sits where b was; d moves up.
    expect(gather(order, ['b'], ['e'])).toEqual(['a', 'b', 'e', 'c', 'd', 'f']);
    // a dropped on d: the stack [d, a] sits where d was, minus the slot a left.
    expect(gather(order, ['d'], ['a'])).toEqual(['b', 'c', 'd', 'a', 'e', 'f']);
  });

  it('videos added to a stack line up behind the ones already in it', () => {
    expect(gather(order, ['c', 'd'], ['a', 'f'])).toEqual([
      'b',
      'c',
      'd',
      'a',
      'f',
      'e',
    ]);
  });

  it('ignores ids that are not on the shelf and repeats', () => {
    expect(gather(order, ['b'], ['zz', 'e', 'e'])).toEqual([
      'a',
      'b',
      'e',
      'c',
      'd',
      'f',
    ]);
    expect(gather(order, ['zz'], ['yy'])).toEqual(order);
  });
});

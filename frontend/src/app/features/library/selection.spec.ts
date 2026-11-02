import { describe, expect, it } from 'vitest';

import {
  EMPTY_SELECTION,
  applyClick,
  applyContextClick,
  moveBefore,
  pruneSelection,
  scrubIndex,
  selectAll,
} from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const none = { ctrl: false, shift: false };

describe('selection', () => {
  it('plain click selects one and sets the anchor', () => {
    const s = applyClick(EMPTY_SELECTION, order, 'b', none);
    expect([...s.selected]).toEqual(['b']);
    expect(s.anchor).toBe('b');
  });

  it('ctrl-click toggles without touching the others', () => {
    let s = applyClick(EMPTY_SELECTION, order, 'b', none);
    s = applyClick(s, order, 'd', { ctrl: true, shift: false });
    expect([...s.selected].sort()).toEqual(['b', 'd']);
    s = applyClick(s, order, 'b', { ctrl: true, shift: false });
    expect([...s.selected]).toEqual(['d']);
    expect(s.anchor).toBe('b');
  });

  it('shift-click selects the range from the anchor in either direction', () => {
    let s = applyClick(EMPTY_SELECTION, order, 'd', none);
    s = applyClick(s, order, 'b', { ctrl: false, shift: true });
    expect([...s.selected]).toEqual(['b', 'c', 'd']);
    expect(s.anchor).toBe('d');
    s = applyClick(s, order, 'e', { ctrl: false, shift: true });
    expect([...s.selected]).toEqual(['d', 'e']);
  });

  it('ctrl+shift adds a range to the selection', () => {
    let s = applyClick(EMPTY_SELECTION, order, 'a', none);
    s = applyClick(s, order, 'e', { ctrl: true, shift: false });
    s = applyClick(s, order, 'b', { ctrl: true, shift: true });
    expect([...s.selected].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('context click keeps a selection that contains the tile, else selects only it', () => {
    const s = selectAll(order);
    expect(applyContextClick(s, 'c')).toBe(s);
    expect([...applyContextClick(s, 'zzz').selected]).toEqual(['zzz']);
  });

  it('prunes ids that disappeared', () => {
    const s = pruneSelection(selectAll(order), ['a', 'c']);
    expect([...s.selected]).toEqual(['a', 'c']);
    expect(s.anchor).toBe('a');
  });

  it('maps a pointer position to a frame', () => {
    expect(scrubIndex(0, 200, 16)).toBe(0);
    expect(scrubIndex(199, 200, 16)).toBe(15);
    expect(scrubIndex(100, 200, 16)).toBe(8);
    expect(scrubIndex(50, 0, 16)).toBe(0);
    expect(scrubIndex(50, 200, 0)).toBe(0);
  });

  it('moves a dragged block before or after the target', () => {
    expect(moveBefore(order, ['d', 'e'], 'b', false)).toEqual(['a', 'd', 'e', 'b', 'c']);
    expect(moveBefore(order, ['a'], 'c', true)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(moveBefore(order, ['a', 'c'], 'c', false)).toEqual(order);
    expect(moveBefore(order, ['a'], 'nope', false)).toEqual(order);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { signal } from '@angular/core';

import { RowSelection } from './row-selection';

const click = (init: MouseEventInit = {}) => new MouseEvent('click', { cancelable: true, ...init });

describe('RowSelection', () => {
  const rows = signal(['a', 'b', 'c', 'd']);
  let sel: RowSelection;

  beforeEach(() => {
    rows.set(['a', 'b', 'c', 'd']);
    sel = new RowSelection(() => rows());
  });

  it('a box ticks and unticks its row, keeping the others', () => {
    sel.box('a', click());
    sel.box('c', click());
    expect([...sel.ids()]).toEqual(['a', 'c']);
    sel.box('a', click());
    expect([...sel.ids()]).toEqual(['c']);
  });

  it('Shift ticks the range from the row touched last, added to what is ticked', () => {
    sel.box('d', click());
    sel.box('a', click());
    sel.box('c', click({ shiftKey: true }));
    expect([...sel.ids()].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a plain click on the row leaves it to the link; Ctrl, ⌘ or Shift tick it', () => {
    const plain = click();
    sel.row('b', plain);
    expect(sel.count()).toBe(0);
    expect(plain.defaultPrevented).toBe(false);
    const ctrl = click({ ctrlKey: true });
    sel.row('b', ctrl);
    expect(ctrl.defaultPrevented).toBe(true);
    sel.row('c', click({ metaKey: true }));
    sel.row('a', click({ shiftKey: true }));
    expect([...sel.ids()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('all, some, the header box and pruning after a reload', () => {
    expect(sel.all()).toBe(false);
    sel.toggleAll(true);
    expect(sel.all()).toBe(true);
    expect(sel.some()).toBe(false);
    rows.set(['a', 'b']);
    sel.prune();
    expect([...sel.ids()]).toEqual(['a', 'b']);
    sel.box('a', click());
    expect(sel.some()).toBe(true);
    sel.toggleAll(false);
    expect(sel.count()).toBe(0);
  });
});

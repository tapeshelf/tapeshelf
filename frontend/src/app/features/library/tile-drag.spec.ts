import { dropIntent } from './tile-drag';

const rect = { left: 100, top: 50, width: 200, height: 100 };
const moving = { reorder: true, stack: true, rested: false };
const rested = { reorder: true, stack: true, rested: true };

describe('dropIntent', () => {
  it('a moving pointer means before or after by halves, never a stack', () => {
    expect(dropIntent(rect, 110, 80, 'grid', moving)).toBe('before');
    expect(dropIntent(rect, 199, 80, 'grid', moving)).toBe('before');
    expect(dropIntent(rect, 201, 80, 'grid', moving)).toBe('after');
    expect(dropIntent(rect, 290, 80, 'grid', moving)).toBe('after');
  });

  it('a pointer rested on the middle half means into a stack; the outer quarters still insert', () => {
    expect(dropIntent(rect, 149, 80, 'grid', rested)).toBe('before');
    expect(dropIntent(rect, 151, 80, 'grid', rested)).toBe('into');
    expect(dropIntent(rect, 249, 80, 'grid', rested)).toBe('into');
    expect(dropIntent(rect, 251, 80, 'grid', rested)).toBe('after');
  });

  it('a list runs top to bottom', () => {
    expect(dropIntent(rect, 200, 60, 'list', moving)).toBe('before');
    expect(dropIntent(rect, 200, 100, 'list', rested)).toBe('into');
    expect(dropIntent(rect, 200, 140, 'list', moving)).toBe('after');
  });

  it('without stacking the tile only splits in halves; without reordering only a rested middle counts', () => {
    expect(dropIntent(rect, 190, 80, 'grid', { reorder: true, stack: false, rested: true })).toBe(
      'before',
    );
    expect(dropIntent(rect, 200, 80, 'grid', { reorder: false, stack: true, rested: true })).toBe(
      'into',
    );
    expect(dropIntent(rect, 200, 80, 'grid', { reorder: false, stack: true, rested: false })).toBe(
      null,
    );
    expect(dropIntent(rect, 105, 80, 'grid', { reorder: false, stack: false, rested: true })).toBe(
      null,
    );
  });
});

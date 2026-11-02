import { describe, expect, it } from 'vitest';

import { type MosaicRow, layoutMosaic } from './mosaic-layout';
import { WidthDamper } from './width-damper';

const SCROLLBAR = 10;
const GAP = 8;
const ABOVE = 360; // header, profile head, folders

function pageHeight(rows: MosaicRow[]): number {
  return ABOVE + rows.reduce((h, r) => h + r.height, 0) + GAP * Math.max(0, rows.length - 1);
}

describe('WidthDamper', () => {
  it('takes the first width and real resizes', () => {
    const d = new WidthDamper();
    expect(d.next(1200, 0)).toBe(1200);
    expect(d.next(1200, 10)).toBeNull();
    expect(d.next(900, 20)).toBe(900);
    expect(d.next(1300, 30)).toBe(1300);
  });

  it('stays narrower when the scrollbar comes and goes because of the layout', () => {
    const d = new WidthDamper();
    expect(d.next(1200, 0)).toBe(1200);
    // The shelf made the page scroll: the scrollbar narrows it…
    expect(d.next(1190, 16)).toBe(1190);
    // …the narrower shelf fits the window, the scrollbar goes: ignored, no flicker.
    expect(d.next(1200, 32)).toBeNull();
    expect(d.next(1190, 48)).toBeNull();
    expect(d.next(1200, 64)).toBeNull();
  });

  it('settles after one more turn when it starts with the scrollbar there', () => {
    const d = new WidthDamper();
    expect(d.next(1190, 0)).toBe(1190);
    expect(d.next(1200, 16)).toBe(1200);
    expect(d.next(1190, 32)).toBe(1190);
    expect(d.next(1200, 48)).toBeNull();
  });

  it('a widening long after, or by more than a scrollbar, is a real one', () => {
    const d = new WidthDamper();
    d.next(1200, 0);
    d.next(1190, 16);
    expect(d.next(1200, 5000)).toBe(1200);
    d.next(1150, 6000);
    expect(d.next(1200, 6016)).toBe(1200);
  });

  it('on a real shelf, the scrollbar and the layout no longer feed each other', () => {
    // Justified rows: a narrower shelf is a lower one. A window just tall enough for the narrow
    // layout but not for the wide one made the scrollbar come and go for good.
    const aspects = [16 / 9, 9 / 16, 4 / 3, 16 / 9, 1, 16 / 9, 2.39, 9 / 16, 16 / 9, 4 / 3, 16 / 9];
    const viewport = 900;
    const layout = (width: number) => layoutMosaic(aspects, { width, viewport, gap: GAP });
    // A window width where the scrollbar makes the page lower (narrower rows, same breaks).
    let wide = 0;
    for (let w = 900; w <= 1600 && !wide; w++)
      if (pageHeight(layout(w - SCROLLBAR)) < pageHeight(layout(w))) wide = w;
    expect(wide).toBeGreaterThan(0);
    const tall = pageHeight(layout(wide));
    const low = pageHeight(layout(wide - SCROLLBAR));
    // The window just between the two heights (innerHeight does not change with the scrollbar).
    const windowHeight = Math.round((tall + low) / 2);

    const run = (damped: boolean): number => {
      const damper = new WidthDamper();
      let width = wide;
      let flips = 0;
      let scrollbar = false;
      for (let frame = 0; frame < 20; frame++) {
        const measured: number = scrollbar ? wide - SCROLLBAR : wide;
        const next: number | null = damped ? damper.next(measured, frame * 16) : measured;
        if (next !== null && next !== width) {
          width = next;
          flips++;
        }
        scrollbar = pageHeight(layout(width)) > windowHeight;
      }
      return flips;
    };
    expect(run(false)).toBeGreaterThan(10);
    expect(run(true)).toBeLessThanOrEqual(1);
  });
});

import { plateLayout, textLines, timerPhases } from './plate-layout.js';

// The same numbers are checked in the browser's copy (frontend edit-model.spec.ts): the editor's
// preview and the render lay plates out alike.
const frame = { w: 404, h: 720 };

describe('plate layout', () => {
  it('a timer: font from the frame height, a plate as tight above and below the digits as on the sides', () => {
    const p = plateLayout(
      'timer',
      { x: 0.05, y: 0.05, size: 0.06 },
      ['0:00'],
      frame,
    );
    expect(p).toMatchObject({
      font: 43,
      x: 20,
      y: 36,
      w: 132,
      h: 60,
      lineStep: 32,
    });
    expect(p.textX).toBeCloseTo(34.4, 6);
    expect(p.baseline).toBeCloseTo(81.695, 6);
  });

  it('a caption: room for capitals and descenders, one line step per line', () => {
    const p = plateLayout(
      'caption',
      { x: 0.1, y: 0.8, size: 0.04 },
      ['Привет: 100%'],
      frame,
    );
    expect(p).toMatchObject({
      font: 29,
      x: 40,
      y: 576,
      w: 226,
      h: 50,
      lineStep: 32,
    });
    expect(p.textX).toBeCloseTo(48.6, 6);
    expect(p.baseline).toBeCloseTo(611.44, 6);
    const two = plateLayout(
      'caption',
      { x: 0.1, y: 0.8, size: 0.04 },
      textLines('a\nbb'),
      frame,
    );
    expect([two.w, two.h]).toEqual([52, 82]);
  });

  it('kept inside the frame whenever it fits', () => {
    const p = plateLayout(
      'timer',
      { x: 0.98, y: 0.99, size: 0.06 },
      ['0:00'],
      frame,
    );
    expect([p.x, p.y]).toEqual([404 - 132, 720 - 60]);
    expect(
      plateLayout('timer', { x: 0, y: 0, size: 0.06 }, ['0:00'], frame),
    ).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('a timer grows a digit at 10:00 (and 10:00:00): one plate for each span', () => {
    expect(timerPhases(3, 9, 5)).toEqual([{ from: 3, to: 14, chars: 4 }]);
    expect(timerPhases(0, 700, 5)).toEqual([
      { from: 0, to: 600, chars: 4 },
      { from: 600, to: 705, chars: 5 },
    ]);
    expect(timerPhases(10, 610, 5)).toEqual([
      { from: 10, to: 610, chars: 4 },
      { from: 610, to: 615, chars: 5 },
    ]);
    expect(timerPhases(0, 4000, 5)).toEqual([{ from: 0, to: 4005, chars: 7 }]);
  });

  it('caption text as drawn: composed letters, tabs as spaces', () => {
    expect(textLines('й\tx\nb')).toEqual(['й x', 'b']);
  });
});

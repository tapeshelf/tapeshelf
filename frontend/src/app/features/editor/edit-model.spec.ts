import {
  type EditSpec,
  centredCrop,
  emptySpec,
  formatTime,
  isIdentity,
  keptSegments,
  outputAspect,
  outputGeometry,
  parseTime,
  plateLayout,
  playableFrom,
  textLines,
  timerAt,
} from './edit-model';

const source = { width: 1920, height: 1080, durationSec: 60, hasAudio: true, fps: 30 };
const spec = (patch: Partial<EditSpec>): EditSpec => ({ ...emptySpec(source), ...patch });

describe('editor model', () => {
  it('keeps the trim minus the cuts and plays over the cuts', () => {
    const s = spec({
      trim: { start: 5, end: 50 },
      cuts: [
        { start: 20, end: 25 },
        { start: 22, end: 30 },
      ],
    });
    expect(keptSegments(s)).toEqual([
      { start: 5, end: 20 },
      { start: 30, end: 50 },
    ]);
    expect(playableFrom(s, 0)).toBe(5);
    expect(playableFrom(s, 21)).toBe(30);
    expect(playableFrom(s, 31)).toBe(31);
    expect(playableFrom(s, 50)).toBeNull();
  });

  it('a quarter turn and a crop make the shape of the result', () => {
    expect(outputAspect(spec({ rotate: 90 }), source)).toBeCloseTo(1080 / 1920, 5);
    const vertical = centredCrop(9 / 16, { w: 1920, h: 1080 });
    expect(vertical.h).toBe(1);
    expect(outputAspect(spec({ crop: vertical }), source)).toBeCloseTo(9 / 16, 5);
  });

  it('nothing changed is the original', () => {
    expect(isIdentity(emptySpec(source), source)).toBe(true);
    expect(isIdentity(spec({ normalize: true }), source)).toBe(false);
  });

  it('the stopwatch: from 0 at its start, still at its end, five seconds more', () => {
    const t = { start: 10, end: 13.25 };
    expect(timerAt(t, 9.9)).toBeNull();
    expect(timerAt(t, 11.55)).toBe('0:01');
    expect(timerAt(t, 17)).toBe('0:03');
    expect(timerAt(t, 18.3)).toBeNull();
  });

  it('times read and write as m:ss.t', () => {
    expect(formatTime(83.45)).toBe('1:23.4');
    expect(formatTime(3725)).toBe('1:02:05.0');
    expect(parseTime('1:23.4')).toBeCloseTo(83.4, 5);
    expect(parseTime('83,5')).toBe(83.5);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('abc')).toBeNull();
  });

  // The same numbers as the render's (backend plate-layout.spec.ts): preview and video agree.
  it('lays plates out as the render does, to the pixel', () => {
    const frame = { w: 404, h: 720 };
    const t = plateLayout('timer', { x: 0.05, y: 0.05, size: 0.06 }, ['0:00'], frame);
    expect(t).toMatchObject({ font: 43, x: 20, y: 36, w: 132, h: 60, lineStep: 32 });
    expect(t.textX).toBeCloseTo(34.4, 6);
    expect(t.baseline).toBeCloseTo(81.695, 6);
    const c = plateLayout('caption', { x: 0.1, y: 0.8, size: 0.04 }, ['Привет: 100%'], frame);
    expect(c).toMatchObject({ font: 29, x: 40, y: 576, w: 226, h: 50, lineStep: 32 });
    expect(c.textX).toBeCloseTo(48.6, 6);
    expect(c.baseline).toBeCloseTo(611.44, 6);
    const two = plateLayout('caption', { x: 0.1, y: 0.8, size: 0.04 }, textLines('a\nbb'), frame);
    expect([two.w, two.h]).toEqual([52, 82]);
    const edge = plateLayout('timer', { x: 0.98, y: 0.99, size: 0.06 }, ['0:00'], frame);
    expect([edge.x, edge.y]).toEqual([404 - 132, 720 - 60]);
    expect(textLines('и\u0306\tx\nb')).toEqual(['й x', 'b']);
  });

  it('the result frame as the render makes it: whole even pixels, fitted into 1920', () => {
    expect(
      outputGeometry(spec({ crop: { x: 0.35, y: 0, w: 0.3164, h: 1 } }), {
        width: 1280,
        height: 720,
      }),
    ).toMatchObject({
      crop: { x: 448, y: 0, w: 404, h: 720 },
      width: 404,
      height: 720,
    });
    expect(outputGeometry(spec({ rotate: 90 }), { width: 3840, height: 2160 })).toMatchObject({
      crop: null,
      width: 1080,
      height: 1920,
    });
  });
});

import {
  EditSpecError,
  type EditSource,
  type EditSpec,
  emptyEdit,
  isIdentity,
  keptSegments,
  normalizeEdit,
  outputDuration,
  turnedSize,
} from './edit-spec.js';

const source: EditSource = {
  width: 1920,
  height: 1080,
  durationSec: 60,
  hasAudio: true,
};
const edit = (patch: Partial<EditSpec>): EditSpec => ({
  ...emptyEdit(source),
  ...patch,
});

describe('edit spec', () => {
  it('an empty edit changes nothing', () => {
    expect(isIdentity(emptyEdit(source), source)).toBe(true);
    expect(isIdentity(edit({ volume: 0.5 }), source)).toBe(false);
    expect(isIdentity(edit({ crop: { x: 0, y: 0, w: 1, h: 1 } }), source)).toBe(
      true,
    );
  });

  it('keeps the trim minus the cuts, cuts merged and clipped to it', () => {
    const spec = edit({
      trim: { start: 5, end: 50 },
      cuts: [
        { start: 20, end: 25 },
        { start: 0, end: 7 },
        { start: 22, end: 30 },
        { start: 49.99, end: 60 },
      ],
    });
    expect(keptSegments(spec)).toEqual([
      { start: 7, end: 20 },
      { start: 30, end: 49.99 },
    ]);
    expect(outputDuration(spec)).toBeCloseTo(32.99, 5);
  });

  it('turning by a quarter swaps the sides', () => {
    expect(turnedSize({ rotate: 90 }, source)).toEqual({ w: 1080, h: 1920 });
    expect(turnedSize({ rotate: 180 }, source)).toEqual({ w: 1920, h: 1080 });
  });

  it('tidies numbers into range and refuses what cannot be meant', () => {
    const spec = normalizeEdit(
      edit({
        trim: { start: -3, end: 99 },
        crop: { x: 0.9, y: -1, w: 0.5, h: 2 },
        timers: [{ start: 1, end: 2, x: 1.5, y: 0.1, size: 9 }],
        captions: [
          { start: 3, end: 4, text: '  hi\r\nthere ', x: 0, y: 0, size: 0 },
        ],
        volume: 7,
      }),
      source,
    );
    expect(spec.trim).toEqual({ start: 0, end: 60 });
    expect(spec.crop).toEqual({ x: 0.9, y: 0, w: 0.1, h: 1 });
    expect(spec.timers[0]).toMatchObject({ x: 1, size: 0.3 });
    expect(spec.captions[0]).toMatchObject({ text: 'hi\nthere', size: 0.02 });
    expect(spec.volume).toBe(2);
    // A crop of the whole frame is no crop.
    expect(
      normalizeEdit(edit({ crop: { x: 0, y: 0, w: 1, h: 1 } }), source).crop,
    ).toBeNull();

    const bad: Partial<EditSpec>[] = [
      { trim: { start: 10, end: 10.5 } },
      { cuts: [{ start: 0, end: 60 }] },
      { crop: { x: 0, y: 0, w: 0.01, h: 0.5 } },
      { timers: [{ start: 5, end: 4, x: 0, y: 0, size: 0.1 }] },
      { captions: [{ start: 1, end: 2, text: '   ', x: 0, y: 0, size: 0.1 }] },
      {
        captions: [
          { start: 1, end: 2, text: 'x'.repeat(201), x: 0, y: 0, size: 0.1 },
        ],
      },
      {
        blurs: Array.from({ length: 21 }, () => ({
          start: 1,
          end: 2,
          rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
          mode: 'blur' as const,
        })),
      },
      { rotate: 45 as never },
    ];
    for (const patch of bad)
      expect(() => normalizeEdit(edit(patch), source)).toThrow(EditSpecError);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { type EditSpec, emptyEdit } from '../src/modules/editor/edit-spec.js';
import { plateLayout } from '../src/modules/editor/plate-layout.js';
import { planRender } from '../src/modules/editor/render-plan.js';
import { FIXTURES_DIR } from './utils/fixtures.js';

const ffmpeg = process.env['FFMPEG_PATH'] ?? 'ffmpeg';
const FONT = resolve('assets/fonts/JetBrainsMono-SemiBold.ttf');
const DIR = join(FIXTURES_DIR, 'plates');
const SOURCE = { width: 640, height: 360, durationSec: 3, hasAudio: false };
const FPS = 25;

/**
 * a real ffmpeg draws the plates where the shared layout says, to the pixel — the
 * layout the editor's preview draws by. A flat grey clip, so every plate edge and every glyph can
 * be found in the frame.
 */
describe('editor plates in a real render', () => {
  const timer = { start: 0, end: 2, x: 0.05, y: 0.05, size: 0.06 };
  const edge = { start: 0, end: 2, x: 0.99, y: 0.3, size: 0.08 };
  const caption = {
    start: 0,
    end: 3,
    text: 'HH\nHH',
    x: 0.1,
    y: 0.6,
    size: 0.05,
  };
  const spec: EditSpec = {
    ...emptyEdit(SOURCE),
    crop: { x: 0.2, y: 0, w: 0.5625, h: 1 },
    timers: [timer, edge],
    captions: [caption],
  };
  let frame: { w: number; h: number; luma: Uint8Array };

  beforeAll(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    const plan = planRender(spec, SOURCE, {
      dir: DIR,
      fontFile: FONT,
      maxLongSide: 1920,
    });
    for (const f of plan.files) writeFileSync(join(DIR, f.name), f.content);
    // One frame at 1.2 s: the timers read 0:01.
    const raw = execFileSync(
      ffmpeg,
      [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x808080:s=${SOURCE.width}x${SOURCE.height}:r=${FPS}:d=${SOURCE.durationSec}`,
        '-filter_complex',
        `${plan.graph};\n[vout]select=eq(n\\,${1.2 * FPS})[one]`,
        '-map',
        '[one]',
        '-frames:v',
        '1',
        '-pix_fmt',
        'gray',
        '-f',
        'rawvideo',
        '-',
      ],
      { maxBuffer: 1 << 26 },
    );
    frame = {
      w: plan.output.width,
      h: plan.output.height,
      luma: new Uint8Array(raw),
    };
    expect(raw.length).toBe(frame.w * frame.h);
  });

  /** The smallest rectangle of the pixels in `area` that `hit` picks. */
  const bbox = (
    area: { x: number; y: number; w: number; h: number },
    hit: (v: number) => boolean,
  ) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -1,
      y1 = -1;
    for (
      let y = Math.max(0, area.y);
      y < Math.min(frame.h, area.y + area.h);
      y++
    )
      for (
        let x = Math.max(0, area.x);
        x < Math.min(frame.w, area.x + area.w);
        x++
      )
        if (hit(frame.luma[y * frame.w + x]!)) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const around = (r: { x: number; y: number; w: number; h: number }) => ({
    x: r.x - 8,
    y: r.y - 8,
    w: r.w + 16,
    h: r.h + 16,
  });
  // Grey is luma ~126, black 16, the text ~226, the caption's plate ~73.
  const dark = (v: number) => v < 60;
  const plate = (v: number) => v < 100;
  const ink = (v: number) => v > 176;
  /** Within a pixel and a quarter: a glyph's edge is anti-aliased. */
  const near = (got: number, want: number) =>
    expect(Math.abs(got - want)).toBeLessThanOrEqual(1.25);

  it('a timer: the black plate exactly, the digits on their baseline', () => {
    expect([frame.w, frame.h]).toEqual([360, 360]);
    const p = plateLayout('timer', timer, ['0:01'], frame);
    expect(bbox(around(p), dark)).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
    // "0" starts 0.071 em in, "1" ends 0.549 em into the last cell; digits reach 0.73 em up.
    const text = bbox(p, ink);
    near(text.x, p.textX + 0.071 * p.font);
    near(text.x + text.w, p.textX + (3 * 0.6 + 0.549) * p.font);
    near(text.y, p.baseline - 0.73 * p.font);
    near(text.y + text.h, p.baseline);
  });

  it('a timer put past the edge is drawn against it, as the editor shows it', () => {
    const p = plateLayout('timer', edge, ['0:01'], frame);
    expect(p.x + p.w).toBe(frame.w);
    expect(bbox(around(p), dark)).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
  });

  it('a caption: its see-through plate exactly, two lines one line step apart', () => {
    const p = plateLayout('caption', caption, ['HH', 'HH'], frame);
    expect(bbox(around(p), plate)).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
    // "H" spans 0.081…0.519 em of its cell and 0…0.73 em above the baseline.
    const text = bbox(p, ink);
    near(text.x, p.textX + 0.081 * p.font);
    near(text.x + text.w, p.textX + (0.6 + 0.519) * p.font);
    near(text.y, p.baseline - 0.73 * p.font);
    near(text.y + text.h, p.baseline + p.lineStep);
  });
});

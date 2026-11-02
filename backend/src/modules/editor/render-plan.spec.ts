import { type EditSource, type EditSpec, emptyEdit } from './edit-spec.js';
import { FONT_LINE, plateLayout } from './plate-layout.js';
import {
  outputGeometry,
  planRender,
  renderArgs,
  timerText,
} from './render-plan.js';

const source: EditSource = {
  width: 1920,
  height: 1080,
  durationSec: 30,
  hasAudio: true,
};
const opts = { dir: '/work', fontFile: '/fonts/mono.ttf', maxLongSide: 1920 };
const plan = (patch: Partial<EditSpec>, src = source) =>
  planRender({ ...emptyEdit(src), ...patch }, src, opts);

describe('render plan', () => {
  it('a horizontal video cropped to a vertical one comes out vertical, sides even', () => {
    const p = plan({ crop: { x: 0.3, y: 0, w: 0.3164, h: 1 } });
    expect(p.output).toMatchObject({
      width: 608,
      height: 1080,
      durationSec: 30,
      hasAudio: true,
    });
    expect(p.graph).toContain('crop=608:1080:576:0');
  });

  it('turning a quarter turns a horizontal video vertical; an oversized result is fitted', () => {
    expect(plan({ rotate: 90 }).output).toMatchObject({
      width: 1080,
      height: 1920,
    });
    expect(plan({ rotate: 270, flipH: true }).graph).toContain(
      'transpose=cclock,hflip',
    );
    const big = plan(
      {},
      { width: 3840, height: 2160, durationSec: 30, hasAudio: true },
    );
    expect(big.output).toMatchObject({ width: 1920, height: 1080 });
    expect(big.graph).toContain('scale=1920:1080:flags=lanczos');
  });

  it('cuts join the kept pieces with a short sound fade at every seam', () => {
    const p = plan({
      trim: { start: 2, end: 20 },
      cuts: [{ start: 8, end: 10 }],
    });
    expect(p.output.durationSec).toBe(16);
    expect(p.graph).toContain('[p0]trim=start=2:end=8');
    expect(p.graph).toContain('[p1]trim=start=10:end=20');
    expect(p.graph).toContain('afade=t=out:st=5.98:d=0.02');
    expect(p.graph).toContain('concat=n=2:v=1:a=1[vout][joined]');
  });

  it('no sound: none in the source or the volume at zero', () => {
    for (const p of [
      plan({ volume: 0 }),
      plan({}, { ...source, hasAudio: false }),
    ]) {
      expect(p.output.hasAudio).toBe(false);
      expect(p.graph).not.toContain('[0:a]');
      expect(renderArgs(p, 'in', 'out')).toContain('-an');
      // The result carries none of the source's metadata.
      expect(renderArgs(p, 'in', 'out').join(' ')).toContain(
        '-map_metadata -1 -map_chapters -1 -fflags +bitexact out',
      );
    }
    const loud = plan({ volume: 1.5, normalize: true });
    expect(loud.graph).toContain(
      'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,volume=1.5,alimiter',
    );
  });

  it('blurs and plates only between their times; timers stay five seconds after their end', () => {
    const p = plan({
      blurs: [
        {
          start: 1,
          end: 4,
          rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          mode: 'blur',
        },
        {
          start: 5,
          end: 6,
          rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
          mode: 'box',
        },
      ],
      timers: [{ start: 3, end: 9, x: 0.05, y: 0.05, size: 0.06 }],
      captions: [
        { start: 2, end: 7, text: 'Hello: 100%', x: 0.1, y: 0.8, size: 0.04 },
      ],
    });
    expect(p.graph).toMatch(/overlay=192:108:enable='between\(t,1,4\)'/);
    expect(p.graph).toContain("t=fill:enable='between(t,5,6)'");
    expect(p.graph).toContain("enable='between(t,3,14)'");
    expect(p.files).toEqual([
      { name: 'timer-0.txt', content: timerText(3, 9) },
      { name: 'caption-0.txt', content: 'Hello: 100%' },
    ]);
    // The caption is printed as written; the timer's expressions are expanded.
    expect(p.graph).toContain("textfile='/work/caption-0.txt':expansion=none");
    expect(p.graph).toContain("textfile='/work/timer-0.txt':expansion=normal");
    // The timer on solid black, the caption on a see-through plate.
    expect(p.graph).toMatch(/color=0x000000:t=fill:enable='between\(t,3,14\)'/);
    expect(p.graph).toMatch(
      /color=0x111111@0\.55:t=fill:enable='between\(t,2,7\)'/,
    );
  });

  it('plates and their text are where the editor shows them: the shared layout, to the pixel', () => {
    const timer = { start: 0, end: 4, x: 0.05, y: 0.05, size: 0.06 };
    const caption = {
      start: 0,
      end: 4,
      text: 'Две\nстроки',
      x: 0.98,
      y: 0.9,
      size: 0.05,
    };
    const p = plan({ timers: [timer], captions: [caption] });
    const frame = { w: 1920, h: 1080 };
    const t = plateLayout('timer', timer, ['0:00'], frame);
    expect(p.graph).toContain(
      `drawbox=x=${t.x}:y=${t.y}:w=${t.w}:h=${t.h}:color=0x000000`,
    );
    expect(p.graph).toContain(
      `fontsize=${t.font}:fontcolor=0xF7F5F0:line_spacing=${t.lineStep - Math.round(FONT_LINE * t.font)}:x=${Math.round(t.textX * 1000) / 1000}:y_align=baseline:y=${Math.round(t.baseline * 1000) / 1000}:`,
    );
    // Two lines a line step apart; pushed back inside the frame from its right edge.
    const c = plateLayout('caption', caption, ['Две', 'строки'], frame);
    expect(c.x + c.w).toBe(1920);
    expect(p.graph).toContain(
      `drawbox=x=${c.x}:y=${c.y}:w=${c.w}:h=${c.h}:color=0x111111@0.55`,
    );
    expect(p.graph).toContain(
      `line_spacing=${c.lineStep - Math.round(FONT_LINE * c.font)}:`,
    );
    expect(p.files).toContainEqual({
      name: 'caption-0.txt',
      content: 'Две\nстроки',
    });
  });

  it('a timer past 10:00 gets the wider plate from then on', () => {
    const p = plan(
      { timers: [{ start: 0, end: 700, x: 0.9, y: 0.05, size: 0.06 }] },
      { ...source, durationSec: 800 },
    );
    expect(p.graph).toContain("enable='gte(t,0)*lt(t,600)'");
    expect(p.graph).toContain("enable='between(t,600,705)'");
    const narrow = plateLayout(
      'timer',
      { x: 0.9, y: 0.05, size: 0.06 },
      ['0:00'],
      { w: 1920, h: 1080 },
    );
    const wide = plateLayout(
      'timer',
      { x: 0.9, y: 0.05, size: 0.06 },
      ['00:00'],
      { w: 1920, h: 1080 },
    );
    expect(wide.w).toBeGreaterThan(narrow.w);
    expect(p.graph).toContain(
      `w=${narrow.w}:h=${narrow.h}:color=0x000000:t=fill:enable='gte(t,0)*lt(t,600)'`,
    );
    expect(p.graph).toContain(
      `w=${wide.w}:h=${wide.h}:color=0x000000:t=fill:enable='between(t,600,705)'`,
    );
  });

  it('an HDR original is brought to SDR first and tagged so; never encoded twice after', () => {
    const hdr = plan({ rotate: 90 }, { ...source, hdr: true });
    expect(hdr.graph).toMatch(
      /^\[0:v\]setpts=PTS-STARTPTS,zscale=t=linear.*tonemap=hable.*transpose=clock/,
    );
    expect(hdr.output.tonemapped).toBe(true);
    expect(renderArgs(hdr, 'in', 'out').join(' ')).toContain(
      '-color_trc bt709',
    );
    const plain = planRender(
      { ...emptyEdit(source), rotate: 90 },
      { ...source, hdr: true },
      { ...opts, tonemap: false },
    );
    expect(plain.graph).not.toContain('tonemap');
    expect(renderArgs(plain, 'in', 'out')).not.toContain('-color_trc');
  });

  it('a crop at the very edge stays there (the corner is even, from 0)', () => {
    const g = outputGeometry(
      { rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      source,
      1920,
    );
    expect(g.crop).toEqual({ x: 0, y: 0, w: 960, h: 540 });
    expect(plan({ crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }).graph).toContain(
      'crop=960:540:0:0',
    );
  });

  it('the graph goes as one argument, far below the limit even for the biggest edit', () => {
    const range = (i: number) => ({ start: i * 0.5, end: i * 0.5 + 0.4 });
    const long = { ...source, durationSec: 3 * 3600 };
    const p = plan(
      {
        rotate: 90,
        flipH: true,
        crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
        cuts: Array.from({ length: 50 }, (_, i) => ({
          start: 100 + i * 60,
          end: 130 + i * 60,
        })),
        blurs: Array.from({ length: 20 }, (_, i) => ({
          ...range(i),
          rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          mode: i % 2 ? 'box' : 'blur',
        })),
        timers: Array.from({ length: 20 }, (_, i) => ({
          ...range(i),
          x: 0.1,
          y: 0.1,
          size: 0.05,
        })),
        captions: Array.from({ length: 20 }, (_, i) => ({
          ...range(i),
          text: 'x'.repeat(200),
          x: 0.1,
          y: 0.8,
          size: 0.05,
        })),
        volume: 1.5,
        normalize: true,
      },
      long,
    );
    const args = renderArgs(p, 'in.mp4', 'out.mp4');
    expect(args[args.indexOf('-filter_complex') + 1]).toBe(p.graph);
    // Linux takes at most 128 KiB in one argument (MAX_ARG_STRLEN).
    expect(Buffer.byteLength(p.graph)).toBeLessThan(64 * 1024);
  });

  it('threads: the decoder’s before the input, the encoder’s after it', () => {
    const p = plan({});
    const args = renderArgs(p, 'in.mp4', 'out.mp4', 2);
    const input = args.indexOf('-i');
    expect(args.slice(input - 6, input)).toEqual([
      '-threads',
      '2',
      '-filter_threads',
      '2',
      '-filter_complex_threads',
      '2',
    ]);
    expect(args.slice(input + 2, input + 4)).toEqual(['-threads', '2']);
    expect(renderArgs(p, 'in.mp4', 'out.mp4')).not.toContain('-threads');
  });

  it('the stopwatch reads m:ss, and h:mm:ss from an hour', () => {
    expect(timerText(3, 9)).toBe(
      '%{eif:floor(max(0,min(t,9)-3)/60):d}:%{eif:mod(floor(max(0,min(t,9)-3)),60):d:2}',
    );
    expect(timerText(0, 4000)).toBe(
      '%{eif:floor(max(0,min(t,4000)-0)/3600):d}:%{eif:mod(floor(max(0,min(t,4000)-0)/60),60):d:2}:%{eif:mod(floor(max(0,min(t,4000)-0)),60):d:2}',
    );
    expect(
      timerText(0, 4000).startsWith(
        '%{eif:floor(max(0,min(t,4000)-0)/3600):d}:',
      ),
    ).toBe(true);
  });
});

import { threadArgs, TONEMAP_FILTER } from '../processing/ffmpeg.js';
import {
  type EditSource,
  type EditSpec,
  type Rect,
  TIMER_HOLD_SEC,
  keptSegments,
  turnedSize,
} from './edit-spec.js';
import {
  FONT_LINE,
  type PlateKind,
  type PlateLayout,
  plateLayout,
  textLines,
  timerPhases,
} from './plate-layout.js';

/**
 * Turns an edit into one ffmpeg run over the original. Order, all on the
 * original's timeline so that every time in the edit means what the editor showed:
 *
 *   (HDR to SDR) → turn (rotate, flip) → blurs and plates → crop → fit → timers, captions → split
 *   by the kept pieces → concat (a 20 ms sound fade at every seam: no clicks) → loudness → volume.
 *
 * The result is H.264/AAC in SDR that the regular pipeline only remuxes; nothing here touches the
 * database.
 */

export interface RenderPlan {
  /** The `-filter_complex` graph (one argument; the long texts are in `files`). */
  graph: string;
  /** Text files the graph reads (timers' expressions, captions' text), by file name. */
  files: { name: string; content: string }[];
  output: {
    width: number;
    height: number;
    durationSec: number;
    hasAudio: boolean;
    /** An HDR original was brought to SDR BT.709 (as the pipeline does on upload). */
    tonemapped: boolean;
  };
}

export interface RenderOptions {
  /** Where `files` will be written: the graph refers to them by full path. */
  dir: string;
  fontFile: string;
  /** The longest side of the result (the pipeline's limit, so it remuxes). */
  maxLongSide: number;
  /** Bring an HDR original to SDR; off only to retry on an ffmpeg without zimg. */
  tonemap?: boolean;
}

/** Seam fades, plate looks: small numbers that make the result look finished. */
const SEAM_FADE_SEC = 0.02;
/** Captions: a see-through dark plate. Timers: solid black, no border. */
const PLATE_COLOR = '0x111111@0.55';
const TIMER_PLATE_COLOR = '0x000000';
const TEXT_COLOR = '0xF7F5F0';
const LOUDNESS = 'loudnorm=I=-16:TP=-1.5:LRA=11';

/** A size: even, at least 2. */
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
/** A position: even, from 0. */
const evenPos = (v: number) => Math.round(v / 2) * 2;
const evenBelow = (v: number) => (v % 2 ? v - 1 : v);
const num = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * The result's frame: the crop in pixels of the turned frame and the size it comes out at. The
 * editor computes the same (edit-model.ts outputGeometry) to show the result as it will be.
 */
export function outputGeometry(
  spec: Pick<EditSpec, 'rotate' | 'crop'>,
  source: EditSource,
  maxLongSide: number,
): {
  turned: { w: number; h: number };
  crop: Rect | null;
  width: number;
  height: number;
} {
  const turned = turnedSize(spec, source);
  let crop: Rect | null = null;
  let cw = turned.w;
  let ch = turned.h;
  // Without a crop the frame keeps its size (odd sides are evened by the scale).
  if (spec.crop) {
    cw = Math.min(even(spec.crop.w * turned.w), evenBelow(turned.w));
    ch = Math.min(even(spec.crop.h * turned.h), evenBelow(turned.h));
    crop = {
      x: Math.min(evenPos(spec.crop.x * turned.w), Math.max(0, turned.w - cw)),
      y: Math.min(evenPos(spec.crop.y * turned.h), Math.max(0, turned.h - ch)),
      w: cw,
      h: ch,
    };
  }
  const long = Math.max(cw, ch);
  if (long > maxLongSide) {
    const k = maxLongSide / long;
    return { turned, crop, width: even(cw * k), height: even(ch * k) };
  }
  return { turned, crop, width: even(cw), height: even(ch) };
}

export function planRender(
  spec: EditSpec,
  source: EditSource,
  opts: RenderOptions,
): RenderPlan {
  const geo = outputGeometry(spec, source, opts.maxLongSide);
  const turned = geo.turned;
  const files: RenderPlan['files'] = [];
  const lines: string[] = [];
  let label = 'v0';

  // 1. The turned frame, timeline from zero, in the pixel format everything below expects. An
  // HDR original is brought to SDR first: the editor shows its upload, which was (ffmpeg.ts).
  const tonemapped = !!source.hdr && opts.tonemap !== false;
  const turn: string[] = [];
  if (tonemapped) turn.push(TONEMAP_FILTER);
  if (spec.rotate === 90) turn.push('transpose=clock');
  if (spec.rotate === 270) turn.push('transpose=cclock');
  if (spec.rotate === 180) turn.push('hflip', 'vflip');
  if (spec.flipH) turn.push('hflip');
  if (spec.flipV) turn.push('vflip');
  lines.push(
    `[0:v]setpts=PTS-STARTPTS,${[...turn, 'format=yuv420p', 'setsar=1'].join(',')}[${label}]`,
  );

  // 2. Blurred areas and plates, each only between its times.
  spec.blurs.forEach((b, i) => {
    const w = even(b.rect.w * turned.w);
    const h = even(b.rect.h * turned.h);
    const x = Math.min(evenPos(b.rect.x * turned.w), Math.max(0, turned.w - w));
    const y = Math.min(evenPos(b.rect.y * turned.h), Math.max(0, turned.h - h));
    const when = `enable='between(t,${num(b.start)},${num(b.end)})'`;
    const next = `b${i}`;
    if (b.mode === 'box') {
      lines.push(
        `[${label}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x111111:t=fill:${when}[${next}]`,
      );
    } else {
      // Strong enough that a face or a plate number cannot be read back, whatever the area's size.
      // The editor's preview blurs by the same measure (edit-model.ts blurSigma).
      const sigma = Math.max(10, Math.round(Math.min(w, h) / 4));
      lines.push(`[${label}]split[${next}a][${next}b]`);
      lines.push(
        // The blur itself only runs between its times: outside them it was a full blur of every
        // frame that the overlay then threw away.
        `[${next}b]crop=${w}:${h}:${x}:${y},gblur=sigma=${sigma}:steps=3:${when}[${next}c]`,
      );
      lines.push(`[${next}a][${next}c]overlay=${x}:${y}:${when}[${next}]`);
    }
    label = next;
  });

  // 3. Crop, then fit into the pipeline's limit.
  const ow = geo.width;
  const oh = geo.height;
  const shape: string[] = [];
  const c = geo.crop;
  if (c) shape.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`);
  const cw = c?.w ?? turned.w;
  const ch = c?.h ?? turned.h;
  if (Math.max(cw, ch) > opts.maxLongSide)
    shape.push(`scale=${ow}:${oh}:flags=lanczos`);
  else if (ow !== cw || oh !== ch) shape.push(`scale=${ow}:${oh}`);

  // 4. Timers and captions, on the output frame: a box for the plate, the text on its baseline
  // (plate-layout.ts, the same layout as the editor's).
  const frame = { w: ow, h: oh };
  const texts: string[] = [];
  spec.timers.forEach((t, i) => {
    const name = `timer-${i}.txt`;
    files.push({ name, content: timerText(t.start, t.end) });
    const phases = timerPhases(t.start, t.end, TIMER_HOLD_SEC);
    phases.forEach((p, k) => {
      const layout = plateLayout('timer', t, ['0'.repeat(p.chars)], frame);
      const when =
        k < phases.length - 1
          ? `enable='gte(t,${num(p.from)})*lt(t,${num(p.to)})'`
          : `enable='between(t,${num(p.from)},${num(p.to)})'`;
      texts.push(
        ...drawPlate(`${opts.dir}/${name}`, 'timer', layout, when, opts),
      );
    });
  });
  spec.captions.forEach((c, i) => {
    const name = `caption-${i}.txt`;
    const text = textLines(c.text);
    files.push({ name, content: text.join('\n') });
    const layout = plateLayout('caption', c, text, frame);
    const when = `enable='between(t,${num(c.start)},${num(c.end)})'`;
    texts.push(
      ...drawPlate(`${opts.dir}/${name}`, 'caption', layout, when, opts),
    );
  });
  const post = [...shape, ...texts];
  if (post.length) {
    lines.push(`[${label}]${post.join(',')}[framed]`);
    label = 'framed';
  }

  // 5. The kept pieces, joined.
  const pieces = keptSegments(spec);
  const n = pieces.length;
  const hasAudio = source.hasAudio && spec.volume > 0;
  const vIn = pieces.map((_, i) => `p${i}`);
  lines.push(
    n > 1
      ? `[${label}]split=${n}${vIn.map((l) => `[${l}]`).join('')}`
      : `[${label}]null[p0]`,
  );
  pieces.forEach((p, i) =>
    lines.push(
      `[p${i}]trim=start=${num(p.start)}:end=${num(p.end)},setpts=PTS-STARTPTS[pv${i}]`,
    ),
  );
  if (hasAudio) {
    lines.push(
      n > 1
        ? `[0:a]asetpts=PTS-STARTPTS,aresample=48000,asplit=${n}${pieces.map((_, i) => `[q${i}]`).join('')}`
        : `[0:a]asetpts=PTS-STARTPTS,aresample=48000[q0]`,
    );
    pieces.forEach((p, i) => {
      const len = p.end - p.start;
      const fades =
        len > SEAM_FADE_SEC * 4
          ? `,afade=t=in:st=0:d=${SEAM_FADE_SEC},afade=t=out:st=${num(len - SEAM_FADE_SEC)}:d=${SEAM_FADE_SEC}`
          : '';
      lines.push(
        `[q${i}]atrim=start=${num(p.start)}:end=${num(p.end)},asetpts=PTS-STARTPTS${fades}[pa${i}]`,
      );
    });
    const inputs = pieces.map((_, i) => `[pv${i}][pa${i}]`).join('');
    lines.push(`${inputs}concat=n=${n}:v=1:a=1[vout][joined]`);
    const sound: string[] = [];
    if (spec.normalize) sound.push(LOUDNESS, 'aresample=48000');
    if (spec.volume !== 1) sound.push(`volume=${num(spec.volume)}`);
    if (spec.volume > 1) sound.push('alimiter=limit=0.95');
    lines.push(`[joined]${sound.length ? sound.join(',') : 'anull'}[aout]`);
  } else {
    lines.push(
      `${pieces.map((_, i) => `[pv${i}]`).join('')}concat=n=${n}:v=1:a=0[vout]`,
    );
  }

  const durationSec = pieces.reduce((s, p) => s + (p.end - p.start), 0);
  return {
    graph: lines.join(';\n'),
    files,
    output: { width: ow, height: oh, durationSec, hasAudio, tonemapped },
  };
}

/**
 * The stopwatch: `m:ss` (`h:mm:ss` from an hour), from 0 at `start`, standing still at `end`.
 * drawtext expands it for every frame with `t` = the original's time.
 */
export function timerText(start: number, end: number): string {
  const e = `max(0,min(t,${num(end)})-${num(start)})`;
  const ss = `%{eif:mod(floor(${e}),60):d:2}`;
  if (end - start >= 3600)
    return `%{eif:floor(${e}/3600):d}:%{eif:mod(floor(${e}/60),60):d:2}:${ss}`;
  return `%{eif:floor(${e}/60):d}:${ss}`;
}

/** A plate and its text: drawtext steps its lines by the font's line as FreeType rounds it. */
function drawPlate(
  file: string,
  kind: PlateKind,
  at: PlateLayout,
  when: string,
  opts: RenderOptions,
): string[] {
  const timer = kind === 'timer';
  return [
    `drawbox=x=${at.x}:y=${at.y}:w=${at.w}:h=${at.h}:color=${timer ? TIMER_PLATE_COLOR : PLATE_COLOR}:t=fill:${when}`,
    [
      `drawtext=fontfile='${opts.fontFile}'`,
      `textfile='${file}'`,
      `expansion=${timer ? 'normal' : 'none'}`,
      `fontsize=${at.font}`,
      `fontcolor=${TEXT_COLOR}`,
      `line_spacing=${at.lineStep - Math.round(FONT_LINE * at.font)}`,
      `x=${num(at.textX)}`,
      'y_align=baseline',
      `y=${num(at.baseline)}`,
      when,
    ].join(':'),
  ];
}

/**
 * The ffmpeg command line for a plan: one pass, H.264 + AAC that the pipeline remuxes. The graph
 * goes as an argument, not a script file: `-/filter_complex` needs ffmpeg 7 and
 * newer releases no longer know `-filter_complex_script` (9 does not), while an argument works
 * everywhere. Timer
 * expressions and captions are read from files, so the graph stays far below the argument limit.
 */
export function renderArgs(
  plan: RenderPlan,
  input: string,
  output: string,
  threads?: number,
): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-nostats',
    '-progress',
    'pipe:1',
    ...threadArgs(threads),
    '-i',
    input,
    ...threadArgs(threads, 'output'),
    '-filter_complex',
    plan.graph,
    '-map',
    '[vout]',
    ...(plan.output.hasAudio ? ['-map', '[aout]'] : []),
    '-c:v',
    'libx264',
    // faster: two and a half times quicker than medium on the server's shared cores, the same
    // CRF. Not veryfast as uploads: the render becomes the video for good.
    '-preset',
    'faster',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    // Brought to SDR: say so, or a player would take the old HDR tags for the truth.
    ...(plan.output.tonemapped
      ? [
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-colorspace',
          'bt709',
        ]
      : []),
    // A keyframe every two seconds: the HLS segments of the pipeline cut there.
    '-force_key_frames',
    'expr:gte(t,n_forced*2)',
    ...(plan.output.hasAudio
      ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-ar', '48000']
      : ['-an']),
    '-movflags',
    '+faststart',
    // None of the source's tags or chapters, no writing-application mark.
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-fflags',
    '+bitexact',
    output,
  ];
}

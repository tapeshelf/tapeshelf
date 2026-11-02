import { hashString, seededRandom } from '../stroke/stroke';

/**
 * Ten cover colours picked to sit well next to the brand orange, mint, ink and paper — deep enough
 * for light lines, no yellow. A page without a chosen colour gets one of
 * these, picked by its user id, so every new user starts on a good one.
 */
export const COVER_PALETTE = [
  '#1f3a5f', // navy
  '#45489a', // indigo
  '#2c6e6a', // teal
  '#2f4b45', // pine
  '#4a5d3a', // olive
  '#8a3b2c', // rust
  '#7a2e46', // wine
  '#5b3a5e', // plum
  '#5e4636', // cocoa
  '#3b3f46', // graphite
] as const;

export const COVER_W = 1600;
export const COVER_H = 400;

export interface CoverLine {
  d: string;
  opacity: number;
  width: number;
  /** Drawn in the accent colour instead of the line colour. */
  accent?: boolean;
}

export type CoverStyle = 'flow' | 'ribbons' | 'contours' | 'waves';
export const COVER_STYLES: readonly CoverStyle[] = ['flow', 'ribbons', 'contours', 'waves'];

export interface CoverDesign {
  color: string;
  style: CoverStyle;
  /** Lines in white on dark colours, in ink on light ones. */
  ink: string;
  /** A few lines stand out in orange (or mint on reddish colours). */
  accent: string;
  lighter: string;
  darker: string;
  lines: CoverLine[];
}

/** The colour a page shows when its owner has not picked one. */
export function defaultCoverColor(userId: string): string {
  return COVER_PALETTE[hashString(userId) % COVER_PALETTE.length]!;
}

/** The seed the lines grow from: the owner's chosen pattern, otherwise the user id. */
export function coverSeed(userId: string, pattern: number | null | undefined): string {
  return pattern == null ? userId : `${userId}:${pattern}`;
}

type Point = [number, number];

const r1 = (n: number): number => Math.round(n * 10) / 10;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * A cover drawn from a seed: one of four kinds of generative line work —
 * a flow field, bundles of silk ribbons, topographic contours or stacked waves — with its own
 * parameters, dozens to a hundred-odd fine lines and a few accent lines, over a soft diagonal
 * shade of the colour. Same seed and colour, same picture.
 */
export function coverDesign(seed: string, color: string | null, fallbackSeed = seed): CoverDesign {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : defaultCoverColor(fallbackSeed);
  const rand = seededRandom(hashString(seed) ^ 0x5bd1e995);
  const style = COVER_STYLES[Math.floor(rand() * COVER_STYLES.length)]!;
  const lines = DRAW[style](rand);
  // A handful of lines in the accent colour, spread over the set.
  const accents = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < accents; i++) {
    const line = lines[Math.floor(rand() * lines.length)];
    if (line) {
      line.accent = true;
      line.opacity = 0.85;
      line.width = Math.max(line.width, 1.6 + rand());
    }
  }
  const light = luminance(base) > 0.45;
  const [r, g, b] = rgb(base);
  const reddish = r > g * 1.6 && r > b * 1.4;
  return {
    color: base,
    style,
    ink: light ? '#171717' : '#ffffff',
    accent: reddish ? '#d1e4db' : '#fc753e',
    lighter: mix(base, '#ffffff', 0.16),
    darker: mix(base, '#000000', 0.26),
    lines,
  };
}

const DRAW: Record<CoverStyle, (rand: () => number) => CoverLine[]> = {
  flow: flowField,
  ribbons,
  contours,
  waves,
};

/** Streamlines through a smooth random vector field: long, combed, hair-like curves. */
function flowField(rand: () => number): CoverLine[] {
  const f = Array.from({ length: 3 }, () => ({
    k: 0.0012 + rand() * 0.004,
    p: rand() * Math.PI * 2,
    a: 0.5 + rand() * 1.1,
  }));
  const drift = (rand() - 0.5) * 1.2;
  const angle = (x: number, y: number): number =>
    drift +
    f[0]!.a * Math.sin(x * f[0]!.k + f[0]!.p) +
    f[1]!.a * Math.cos(y * f[1]!.k * 2.2 + f[1]!.p) +
    f[2]!.a * Math.sin((x + y) * f[2]!.k + f[2]!.p);
  const count = 70 + Math.floor(rand() * 60);
  const out: CoverLine[] = [];
  for (let i = 0; i < count; i++) {
    let x = -100 + rand() * (COVER_W + 200);
    let y = -60 + rand() * (COVER_H + 120);
    const steps = 50 + Math.floor(rand() * 90);
    const pts: Point[] = [[x, y]];
    for (let s = 0; s < steps; s++) {
      const a = angle(x, y);
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      pts.push([x, y]);
      if (x < -150 || x > COVER_W + 150 || y < -150 || y > COVER_H + 150) break;
    }
    out.push(line(polyline(pts), 0.1 + rand() * 0.42, 0.7 + rand() * 0.9));
  }
  return out;
}

/** Three to five bundles of fine lines spun between two random curves that may twist. */
function ribbons(rand: () => number): CoverLine[] {
  const out: CoverLine[] = [];
  const bundles = 3 + Math.floor(rand() * 3);
  for (let r = 0; r < bundles; r++) {
    const count = 14 + Math.floor(rand() * 26);
    const strength = 0.2 + rand() * 0.4;
    const y = (): number => -80 + rand() * (COVER_H + 160);
    const a: Point[] = [
      [-140, y()],
      [COVER_W * (0.15 + rand() * 0.25), y()],
      [COVER_W * (0.55 + rand() * 0.25), y()],
      [COVER_W + 140, y()],
    ];
    const spread = 120 + rand() * 340;
    const b = a.map(([x, yy]) => [x + (rand() - 0.5) * 160, yy + (rand() - 0.5) * spread]);
    const width = 0.6 + rand() * 0.8;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const p = a.map((pa, k) => [lerp(pa[0], b[k]![0]!, t), lerp(pa[1], b[k]![1]!, t)]);
      out.push(
        line(
          `M${r1(p[0]![0]!)} ${r1(p[0]![1]!)} C${r1(p[1]![0]!)} ${r1(p[1]![1]!)} ${r1(p[2]![0]!)} ${r1(p[2]![1]!)} ${r1(p[3]![0]!)} ${r1(p[3]![1]!)}`,
          0.06 + strength * Math.sin(Math.PI * t),
          width,
        ),
      );
    }
  }
  return out;
}

/** Topographic map: wobbly concentric rings around two or three hills, some off the edge. */
function contours(rand: () => number): CoverLine[] {
  const out: CoverLine[] = [];
  const hills = 2 + Math.floor(rand() * 2);
  for (let h = 0; h < hills; h++) {
    const cx = COVER_W * (0.05 + rand() * 0.9);
    const cy = COVER_H * (-0.2 + rand() * 1.4);
    const rings = 12 + Math.floor(rand() * 14);
    const gap = 14 + rand() * 16;
    const stretch = 1.2 + rand() * 1.6;
    const waves = Array.from({ length: 3 }, (_, i) => ({
      n: 2 + i + Math.floor(rand() * 3),
      p: rand() * Math.PI * 2,
      a: 0.04 + rand() * 0.08,
    }));
    for (let i = 0; i < rings; i++) {
      const r0 = 24 + i * gap;
      const pts: Point[] = [];
      for (let s = 0; s <= 96; s++) {
        const th = (s / 96) * Math.PI * 2;
        const wob = waves.reduce((acc, w) => acc + w.a * Math.sin(w.n * th + w.p + i * 0.07), 1);
        const r = r0 * wob;
        pts.push([cx + Math.cos(th) * r * stretch, cy + Math.sin(th) * r]);
      }
      out.push(line(polyline(pts) + ' Z', 0.1 + (1 - i / rings) * 0.4, i % 5 === 0 ? 1.5 : 0.8));
    }
  }
  return out;
}

/** Stacked horizontal lines lifted by a few soft hills, like a sound wave seen from the side. */
function waves(rand: () => number): CoverLine[] {
  const count = 34 + Math.floor(rand() * 26);
  const bumps = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({
    x: COVER_W * rand(),
    w: 60 + rand() * 220,
    h: 40 + rand() * 110,
  }));
  const sk = 0.002 + rand() * 0.006;
  const sp = rand() * Math.PI * 2;
  const tilt = (rand() - 0.5) * 0.12;
  const out: CoverLine[] = [];
  const gap = (COVER_H + 160) / count;
  for (let i = 0; i < count; i++) {
    const y0 = -40 + i * gap;
    const phase = i * (0.15 + rand() * 0.05);
    const pts: Point[] = [];
    for (let x = -40; x <= COVER_W + 40; x += 16) {
      let lift = 0;
      for (const b of bumps) {
        const d = (x - b.x - i * 6) / b.w;
        lift += b.h * Math.exp(-d * d) * (0.4 + 0.6 * Math.sin(i * 0.4 + b.x));
      }
      pts.push([x, y0 - lift + Math.sin(x * sk + sp + phase) * 14 + (x - COVER_W / 2) * tilt]);
    }
    out.push(line(polyline(pts), 0.1 + rand() * 0.35, 0.7 + rand() * 0.6));
  }
  return out;
}

function line(d: string, opacity: number, width: number): CoverLine {
  return { d, opacity: Math.round(opacity * 100) / 100, width: r1(width) };
}

/** Points joined by quadratic curves through their midpoints: smooth without extra points. */
function polyline(pts: Point[]): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += ` Q${r1(x)} ${r1(y)} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L${r1(last[0])} ${r1(last[1])}`;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG), 0 for black … 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, with_: string, amount: number): string {
  const a = rgb(hex);
  const b = rgb(with_);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(lerp(v, b[i]!, amount))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

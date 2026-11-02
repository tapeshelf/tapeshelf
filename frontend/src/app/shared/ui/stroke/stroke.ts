import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';

/** Small deterministic PRNG (mulberry32): the same seed always draws the same stroke. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a stable numeric seed from a string (a title, a username). */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Outline of a brush stroke across `width` × `height`: a centre line that waves gently and a
 * thickness that swells from a thin entry to a full body and flicks out thin at the end, with a
 * little pressure noise. Returned as a closed SVG path (top edge forward, bottom edge back),
 * smoothed with Catmull-Rom curves.
 */
export function strokePath(width: number, height: number, seed: number, thickness = 5): string {
  if (!(width > 0) || !(height > 0)) return '';
  const rand = seededRandom(seed);
  const t = Math.min(thickness, height * 0.8);
  const room = Math.max(0, (height - t) / 2);
  const lambda1 = 320 + rand() * 260;
  const lambda2 = 90 + rand() * 70;
  const lambda3 = 140 + rand() * 120;
  const phi1 = rand() * Math.PI * 2;
  const phi2 = rand() * Math.PI * 2;
  const phi3 = rand() * Math.PI * 2;
  const amp1 = room * (0.55 + rand() * 0.35);
  const amp2 = room * 0.18;
  // The body peaks a little left of centre, like a stroke pulled from left to right.
  const skew = 0.75 + rand() * 0.2;
  const steps = Math.max(8, Math.round(width / 12));
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const x = p * width;
    const mid =
      height / 2 +
      amp1 * Math.sin((2 * Math.PI * x) / lambda1 + phi1) +
      amp2 * Math.sin((2 * Math.PI * x) / lambda2 + phi2);
    const body = Math.pow(Math.sin(Math.PI * Math.pow(p, skew)), 0.45);
    const pressure = 1 + 0.12 * Math.sin((2 * Math.PI * x) / lambda3 + phi3);
    const half = (t * (0.12 + 0.88 * body) * pressure) / 2;
    top.push([x, Math.max(0, mid - half)]);
    bottom.push([x, Math.min(height, mid + half)]);
  }
  return `${smooth(top, true)} ${smooth(bottom.reverse(), false)} Z`;
}

/** Catmull-Rom through the points as cubic Béziers; `move` starts a new subpath. */
function smooth(points: [number, number][], move: boolean): string {
  const first = points[0]!;
  let d = `${move ? 'M' : 'L'}${r1(first[0])} ${r1(first[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/**
 * An orange brush stroke as wide as its host (TapeShelf's "shelf": it runs under rows of tiles,
 * under page titles and across the landing). Decorative only. Pass `width` when the parent already
 * measures it; otherwise the stroke measures itself.
 */
@Component({
  selector: 'app-stroke',
  host: { class: 'block leading-none', 'aria-hidden': 'true' },
  template: `
    @if (d(); as path) {
      <svg
        class="block overflow-visible"
        [attr.width]="w()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + w() + ' ' + height()"
        focusable="false"
      >
        <path [attr.d]="path" [attr.fill]="color()" />
      </svg>
    }
  `,
})
export class StrokeComponent {
  readonly seed = input(1);
  readonly height = input(14);
  readonly thickness = input(5);
  readonly color = input('var(--vs-accent)');
  /** Known width in px; when absent the host is measured. */
  readonly width = input<number | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly measured = signal(0);
  protected readonly w = computed(() => Math.round(this.width() ?? this.measured()));
  protected readonly d = computed(() =>
    strokePath(this.w(), this.height(), this.seed(), this.thickness()),
  );

  constructor() {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      if (this.width() !== null) return;
      const w = entries[0]?.contentRect.width;
      if (w) this.measured.set(w);
    });
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}

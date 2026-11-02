import {
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideZoomIn, lucideZoomOut } from '@ng-icons/lucide';

import { type TileScale } from '../../api';

/** The viewer's steps: from smaller to bigger than the shelf would choose; 1 in the middle. */
export const ZOOM_STEPS = [0.6, 0.8, 1, 1.3, 1.7] as const;
const DEFAULT_STEP = 2;
/** The owner's tile sizes, on the same steps: a visitor's zoom goes from them. */
export const TILE_SCALES: readonly TileScale[] = ['xs', 'sm', 'md', 'lg', 'xl'];
export function tileScaleFactor(scale: TileScale | null | undefined): number {
  return ZOOM_STEPS[TILE_SCALES.indexOf(scale ?? 'md')] ?? 1;
}
const STORAGE_KEY = 'tapeshelf.shelfZoom';

/**
 * How big the tiles of a shelf are for this viewer: the same on every shelf they open, kept
 * in this browser only. The mosaic takes `factor` as its zoom.
 */
@Injectable({ providedIn: 'root' })
export class ShelfZoom {
  readonly step = signal(read());
  readonly factor = computed(() => ZOOM_STEPS[this.step()] ?? 1);
  readonly canZoomIn = computed(() => this.step() < ZOOM_STEPS.length - 1);
  readonly canZoomOut = computed(() => this.step() > 0);

  zoomIn(): void {
    this.set(this.step() + 1);
  }

  zoomOut(): void {
    this.set(this.step() - 1);
  }

  private set(step: number): void {
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, step));
    if (next === this.step()) return;
    this.step.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable: the zoom lasts this visit */
    }
  }
}

function read(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(n) &&
      n >= 0 &&
      n < ZOOM_STEPS.length &&
      localStorage.getItem(STORAGE_KEY) !== null
      ? n
      : DEFAULT_STEP;
  } catch {
    return DEFAULT_STEP;
  }
}

/** Two quiet buttons: smaller and bigger tiles. */
@Component({
  selector: 'app-shelf-zoom',
  imports: [NgIcon, TranslocoPipe],
  providers: [provideIcons({ lucideZoomIn, lucideZoomOut })],
  host: { class: 'inline-flex items-center rounded-md border border-border' },
  template: `
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40"
      [disabled]="!zoom.canZoomOut()"
      [attr.aria-label]="'collection.zoom.out' | transloco"
      [attr.title]="'collection.zoom.out' | transloco"
      (click)="zoom.zoomOut()"
      data-testid="zoom-out"
    >
      <ng-icon name="lucideZoomOut" size="16" />
    </button>
    <span class="h-4 w-px bg-border" aria-hidden="true"></span>
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40"
      [disabled]="!zoom.canZoomIn()"
      [attr.aria-label]="'collection.zoom.in' | transloco"
      [attr.title]="'collection.zoom.in' | transloco"
      (click)="zoom.zoomIn()"
      data-testid="zoom-in"
    >
      <ng-icon name="lucideZoomIn" size="16" />
    </button>
  `,
})
export class ShelfZoomComponent {
  protected readonly zoom = inject(ShelfZoom);
}

/** Ctrl + wheel (a trackpad's pinch too) a notch this far, or a pinch this much, is one step. */
const WHEEL_STEP = 80;
const PINCH_STEP = 1.25;

/**
 * Zoom gestures over a shelf: Ctrl + wheel and a trackpad's pinch on a desk, two fingers
 * on a phone. Only over the shelf itself: elsewhere the browser zooms the page as usual.
 */
@Directive({ selector: '[appShelfZoomGestures]' })
export class ShelfZoomGesturesDirective {
  private readonly zoom = inject(ShelfZoom);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private wheel = 0;
  private pinchFrom = 0;

  constructor() {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.wheel += e.deltaY;
      if (Math.abs(this.wheel) < WHEEL_STEP) return;
      const out = this.wheel > 0;
      this.wheel = 0;
      if (out) this.zoom.zoomOut();
      else this.zoom.zoomIn();
    };
    const onTouchStart = (e: TouchEvent) => {
      this.pinchFrom = e.touches.length === 2 ? distance(e.touches) : 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !this.pinchFrom) return;
      e.preventDefault();
      const ratio = distance(e.touches) / this.pinchFrom;
      if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
        this.pinchFrom = distance(e.touches);
        if (ratio > 1) this.zoom.zoomIn();
        else this.zoom.zoomOut();
      }
    };
    const onTouchEnd = () => (this.pinchFrom = 0);
    this.el.addEventListener('wheel', onWheel, { passive: false });
    this.el.addEventListener('touchstart', onTouchStart, { passive: true });
    this.el.addEventListener('touchmove', onTouchMove, { passive: false });
    this.el.addEventListener('touchend', onTouchEnd, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      this.el.removeEventListener('wheel', onWheel);
      this.el.removeEventListener('touchstart', onTouchStart);
      this.el.removeEventListener('touchmove', onTouchMove);
      this.el.removeEventListener('touchend', onTouchEnd);
    });
  }
}

function distance(t: TouchList): number {
  const a = t[0]!;
  const b = t[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

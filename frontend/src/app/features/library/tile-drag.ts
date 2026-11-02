import { signal } from '@angular/core';

import { type PageLayout } from '../../api';

/** Where a dragged group of tiles is hovering (drag onto folders, manual order;: into a stack). */
export type DragTarget =
  | { type: 'category'; id: string | null }
  | { type: 'folder'; kind: 'PUBLIC' | 'PRIVATE' | 'HIDDEN' }
  | { type: 'tile'; id: string; after: boolean }
  /** Onto a tile: into the stack it is, or a new stack with the video it shows (`stackId` null). */
  | { type: 'into'; id: string; stackId: string | null }
  /** Out of the open stack, onto the page around it. */
  | { type: 'out' }
  | null;

/** The card that travels with the pointer: the picture of what is dragged. */
export interface DragPreview {
  url: string | null;
  /** Width over height of the picture. */
  aspect: number;
  /** Width of the tile it was lifted from, px. */
  width: number;
}

export interface DragOptions {
  ids: string[];
  layout: PageLayout;
  /** Whether dropping between tiles may reorder them (manual sort only). */
  reorderable: boolean;
  /** Whether dropping onto a tile may stack them (the owner's shelf, not inside an open stack). */
  stackable: boolean;
  preview: DragPreview;
  onDrop: (target: DragTarget, ids: string[]) => void;
}

const THRESHOLD_PX = 6;
/**
 * Reordering comes first: a drag over a tile means "before" or "after" by its
 * halves, so a video on its way across the shelf never lands in a stack by accident. Only once the
 * pointer has rested on the middle of a tile for this long does the tile offer to stack.
 */
export const INTO_DWELL_MS = 450;
/** The pointer counts as resting while it stays within this many pixels. */
const REST_RADIUS_PX = 8;
/** The outer strips of a tile that never stack (Atlassian's hitbox: a quarter each). */
const EDGE = 0.25;
/** Dragging within this many pixels of the window's top or bottom scrolls the page, up to this fast. */
const SCROLL_EDGE_PX = 72;
const SCROLL_MAX_PX = 18;

/**
 * What hovering a tile at (`x`, `y`) means: before or after by halves while the pointer moves;
 * into a stack once it has `rested` on the middle half. Without stacking the tile only splits in
 * halves; without reordering only a rested middle means anything.
 */
export function dropIntent(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  layout: PageLayout,
  can: { reorder: boolean; stack: boolean; rested: boolean },
): 'before' | 'after' | 'into' | null {
  const along = layout === 'list' ? (y - rect.top) / rect.height : (x - rect.left) / rect.width;
  const middle = along >= EDGE && along <= 1 - EDGE;
  if (can.stack && can.rested && middle) return 'into';
  if (can.reorder) return along < 0.5 ? 'before' : 'after';
  return null;
}

interface TileUnderPointer {
  el: HTMLElement;
  id: string;
  stackId: string | null;
}

/**
 * Pointer-based drag of one or many tiles (the CDK drag only moves single elements). The page
 * renders the preview and highlights targets from the signals; targets are found by data attributes
 * under the pointer, so the index and the grid need no wiring of their own.
 */
export class TileDragController {
  readonly active = signal(false);
  readonly ids = signal<string[]>([]);
  readonly x = signal(0);
  readonly y = signal(0);
  /** Equal targets are the same target: a new object on every move woke every tile. */
  readonly target = signal<DragTarget>(null, { equal: sameTarget });
  readonly preview = signal<DragPreview | null>(null);

  private origin: { x: number; y: number } | null = null;
  private options: DragOptions | null = null;
  private last = { x: 0, y: 0 };
  /** Where the pointer has been resting, and since when. */
  private rest: { x: number; y: number; since: number } | null = null;
  /** The tile armed as "into": it stays so while the pointer keeps to its middle, moving or not. */
  private armed: string | null = null;
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private scrolling = 0;
  /** Scrolling starts only once the pointer has been away from the edges: a drag that begins at the bottom of the window must not run off at once. */
  private scrollArmed = false;
  private readonly onMove = (e: PointerEvent) => this.move(e);
  private readonly onUp = () => this.up();
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.cancel();
  };

  /** Call from pointerdown on a tile; the drag starts once the pointer travels a few pixels. */
  begin(e: PointerEvent, options: DragOptions): void {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    this.cancel();
    this.origin = { x: e.clientX, y: e.clientY };
    this.options = options;
    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('keydown', this.onKey);
  }

  cancel(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('keydown', this.onKey);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    this.clearDwell();
    cancelAnimationFrame(this.scrolling);
    this.scrolling = 0;
    this.scrollArmed = false;
    this.rest = null;
    this.armed = null;
    this.origin = null;
    this.options = null;
    this.active.set(false);
    this.ids.set([]);
    this.target.set(null);
    this.preview.set(null);
  }

  private move(e: PointerEvent): void {
    if (!this.origin || !this.options) return;
    if (!this.active()) {
      const dx = e.clientX - this.origin.x;
      const dy = e.clientY - this.origin.y;
      if (Math.hypot(dx, dy) < THRESHOLD_PX) return;
      this.active.set(true);
      this.ids.set(this.options.ids);
      this.preview.set(this.options.preview);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      this.scrolling = requestAnimationFrame(() => this.autoScroll());
    }
    e.preventDefault();
    const now = performance.now();
    if (!this.rest || Math.hypot(e.clientX - this.rest.x, e.clientY - this.rest.y) > REST_RADIUS_PX)
      this.rest = { x: e.clientX, y: e.clientY, since: now };
    this.last = { x: e.clientX, y: e.clientY };
    if (e.clientY >= SCROLL_EDGE_PX && e.clientY <= window.innerHeight - SCROLL_EDGE_PX)
      this.scrollArmed = true;
    this.x.set(e.clientX);
    this.y.set(e.clientY);
    this.evaluate();
  }

  /**
   * Shows what a drop would do right now. A tile offers "into" once the pointer has rested on its
   * middle (and keeps offering it while the pointer stays there); until then it answers before or
   * after. With the pointer still, no events come, so the dwell is looked at again by a timer.
   */
  private evaluate(): void {
    const { x, y } = this.last;
    // One hit test per move, shared by both questions below.
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const tile = this.tileAt(el);
    const dwelled = !!this.rest && performance.now() - this.rest.since >= INTO_DWELL_MS;
    const rested = dwelled || (!!tile && tile.id === this.armed);
    const target = this.targetAt(x, y, el, tile, rested);
    this.armed = target?.type === 'into' ? target.id : null;
    this.target.set(target);
    this.clearDwell();
    if (!dwelled && tile && target?.type === 'tile' && this.options?.stackable) {
      const wait = INTO_DWELL_MS - (performance.now() - (this.rest?.since ?? 0));
      this.dwellTimer = setTimeout(() => this.evaluate(), Math.max(16, wait));
    }
  }

  private clearDwell(): void {
    if (this.dwellTimer) clearTimeout(this.dwellTimer);
    this.dwellTimer = null;
  }

  /**
   * A drag held near the top or bottom of the window scrolls the page, faster the closer to the
   * edge (the shelf is taller than the window as soon as it has a few rows), and the target under
   * the resting pointer is found again as the page moves.
   */
  private autoScroll(): void {
    if (!this.active()) return;
    this.scrolling = requestAnimationFrame(() => this.autoScroll());
    if (!this.scrollArmed) return;
    const { y } = this.last;
    const bottom = window.innerHeight - SCROLL_EDGE_PX;
    const dy =
      y < SCROLL_EDGE_PX
        ? -Math.ceil(((SCROLL_EDGE_PX - y) / SCROLL_EDGE_PX) * SCROLL_MAX_PX)
        : y > bottom
          ? Math.ceil(((y - bottom) / SCROLL_EDGE_PX) * SCROLL_MAX_PX)
          : 0;
    if (dy) {
      window.scrollBy(0, dy);
      // The page moved under a still pointer: nothing rests on what is now beneath it.
      this.rest = { x: this.last.x, y: this.last.y, since: performance.now() };
      this.evaluate();
    }
  }

  /** What is lit up is what happens. */
  private up(): void {
    const options = this.options;
    const wasActive = this.active();
    const target = this.target();
    this.cancel();
    if (!wasActive || !options) return;
    swallowNextClick();
    options.onDrop(target, options.ids);
  }

  /** The tile under the pointer that is not one of the dragged ones. */
  private tileAt(el: HTMLElement | null): TileUnderPointer | null {
    const options = this.options;
    const tile = el?.closest<HTMLElement>('[data-video-id]');
    if (!options || !tile) return null;
    const id = tile.dataset['videoId'] ?? '';
    const own = tile.dataset['tileIds']?.split(',') ?? [id];
    if (!id || own.some((v) => options.ids.includes(v))) return null;
    return { el: tile, id, stackId: tile.dataset['stackId'] || null };
  }

  private targetAt(
    x: number,
    y: number,
    el: HTMLElement | null,
    tile: TileUnderPointer | null,
    rested: boolean,
  ): DragTarget {
    const options = this.options;
    if (!options || !el) return null;
    const category = el.closest<HTMLElement>('[data-drop-category]');
    if (category) {
      const id = category.dataset['dropCategory'] ?? '';
      return { type: 'category', id: id === 'none' ? null : id };
    }
    const folder = el.closest<HTMLElement>('[data-drop-folder]');
    if (folder) {
      const kind = folder.dataset['dropFolder'];
      if (kind === 'PUBLIC' || kind === 'PRIVATE' || kind === 'HIDDEN')
        return { type: 'folder', kind };
      return null;
    }
    if (!tile) {
      // The dim around an open stack: a video dragged there leaves the stack.
      return el.closest('.vs-stack-dim') ? { type: 'out' } : null;
    }
    const intent = dropIntent(tile.el.getBoundingClientRect(), x, y, options.layout, {
      reorder: options.reorderable,
      stack: options.stackable,
      rested,
    });
    if (intent === null) return null;
    if (intent === 'into') return { type: 'into', id: tile.id, stackId: tile.stackId };
    return { type: 'tile', id: tile.id, after: intent === 'after' };
  }
}

/**
 * The browser fires a `click` right after the pointerup that ended a drag (on the tile, or on the
 * common ancestor when the drop landed elsewhere). Eat exactly that one so it cannot change the
 * selection; a time window would also swallow the user's next genuine click.
 */
function swallowNextClick(): void {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener('click', swallow, { capture: true, once: true });
  // The click, if any, is dispatched before the next task; afterwards the guard must not linger.
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
}

/** Two drop targets that mean the same drop. */
function sameTarget(a: DragTarget, b: DragTarget): boolean {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

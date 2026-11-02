import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  afterNextRender,
  ElementRef,
  type TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { type MosaicOptions, type MosaicRow, layoutMosaic, tileShapes } from './mosaic-layout';
import { type DrawnLayout, MosaicMemory } from './mosaic-memory';
import { WidthDamper } from './width-damper';

/** What a tile template gets: the item and the exact size of its picture. */
export interface MosaicContext<T> {
  $implicit: T;
  width: number;
  height: number;
}

type Cell<T> =
  | { kind: 'tile'; item: T; width: number; height: number; key: unknown }
  | { kind: 'break'; key: string };

/**
 * The shelf as a mosaic: tiles flow in one flat list with explicit widths and
 * a line break after every row, so a tile that moves to another row keeps its element. Sizes change
 * at once, never animated: a width easing inside a wrapping row would push its last tile onto the
 * next line for a moment. The layout itself is `layoutMosaic`.
 */
@Component({
  selector: 'app-mosaic',
  imports: [NgTemplateOutlet],
  host: {
    class: 'block',
    '(click)': 'onBackground($event)',
  },
  template: `
    <div
      class="flex flex-wrap"
      role="presentation"
      [class.justify-center]="showcase()"
      [style.column-gap.px]="gap()"
      (click)="onBackground($event)"
    >
      @for (cell of cells(); track cell.key) {
        @if (cell.kind === 'tile') {
          <div class="shrink-0" [style.width.px]="cell.width">
            <ng-container
              *ngTemplateOutlet="
                itemTemplate();
                context: { $implicit: cell.item, width: cell.width, height: cell.height }
              "
            />
          </div>
        } @else {
          <!-- The line break is a flex line of its own: its height is the gap between rows, so a
               row-gap would count twice and rows would stand further apart than tiles. -->
          <div class="basis-full" [style.height.px]="gap()" aria-hidden="true"></div>
        }
      }
    </div>
  `,
})
export class MosaicComponent<T> {
  readonly items = input.required<readonly T[]>();
  readonly key = input.required<(item: T) => unknown>();
  /** Width over height of the picture of an item (`aspectOf`). */
  readonly aspect = input.required<(item: T) => number>();
  readonly itemTemplate = input.required<TemplateRef<MosaicContext<T>>>();
  /**
   * How many videos the size is chosen for — the whole shelf, so every section and category of a
   * page shows its videos at one size. `null` = not known yet: nothing is drawn,
   * so the tiles never jump from a guessed size to the real one. Absent = the items here.
   */
  readonly count = input<number | null | undefined>(undefined);
  /** Which shelf this is: back on it, the mosaic takes up the rows it drew. */
  readonly memoryKey = input<string | null>(null);
  /**
   * More items will come (a next page): a last row that does not fill its line waits for them and
   * is laid out with them, so no short row stays in the middle of the shelf.
   */
  readonly more = input(false);
  /** Between tiles, the same both ways. */
  readonly gap = input(8);
  /** The viewer's zoom (`ShelfZoom`): bigger or smaller tiles than the shelf would choose. */
  readonly zoom = input(1);
  /** Only the first rows, the rest left out (a category's preview); 0 = all. */
  readonly maxRows = input(0);
  /** A click on the empty space of the shelf (clears a selection). */
  readonly backgroundClick = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Measured by the ResizeObserver only: until then nothing is laid out (no guessed first frame). */
  private readonly width = signal(0);
  private readonly damper = new WidthDamper();
  private readonly viewport = signal(window.innerHeight);

  private readonly sizeFor = computed(() => {
    const count = this.count();
    return count === undefined ? this.items().length : count;
  });
  /**
   * The tiles' shapes, equal while they are: a video's progress changes its item, not its shape,
   * and the whole shelf was laid out again for each progress event.
   */
  private readonly aspects = computed(
    () => {
      const aspect = this.aspect();
      return this.items().map((item) => aspect(item));
    },
    { equal: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  protected readonly rows = computed<MosaicRow[]>(() => {
    const aspects = this.aspects();
    const count = this.sizeFor();
    if (count === null) return [];
    const options = {
      width: this.width(),
      viewport: this.viewport(),
      gap: this.gap(),
      count: Math.max(count, aspects.length),
      zoom: this.zoom(),
    };
    // Not measured yet: nothing to draw, and nothing to remember (it would replace the real rows).
    if (options.width <= 0) return [];
    const key = this.key();
    const keys = this.items().map((item) => key(item));
    const memoryKey = this.memoryKey();
    if (memoryKey !== this.lastMemoryKey) {
      this.lastMemoryKey = memoryKey;
      this.lastLayout = memoryKey ? this.memory.get(memoryKey) : null;
    }
    let rows = extendLayout(this.lastLayout, keys, aspects, options);
    // Its videos come back with the next page: drawn now, they would move or leave a hole then.
    if (this.more() && rows.length > 1 && rows.at(-1)!.partial) rows = rows.slice(0, -1);
    this.lastLayout = { keys, aspects, options, rows };
    if (memoryKey) this.memory.set(memoryKey, this.lastLayout);
    const max = this.maxRows();
    return max > 0 ? rows.slice(0, max) : rows;
  });
  /** How many tiles are drawn: with `maxRows`, the page tells whether some were left out. */
  readonly drawn = computed(() => this.rows().reduce((n, row) => n + row.tiles.length, 0));
  /** The layout drawn last: "Load more" extends it below instead of laying the page out anew. */
  private lastLayout: DrawnLayout | null = null;
  private lastMemoryKey: string | null | undefined = undefined;
  private readonly memory = inject(MosaicMemory);
  /** One to three videos on the whole shelf, in a row narrower than the page: centred as a showcase. */
  protected readonly showcase = computed(() => {
    const rows = this.rows();
    return (this.sizeFor() ?? 0) <= 3 && rows.length === 1 && rows[0]!.partial;
  });
  /**
   * The cells with their keys taken when they are made: the loop may track a cell of the previous
   * list after the items changed, and looking its key up by index in the new items then read past
   * their end when the list got shorter (a stack made on a big shelf threw and froze it).
   */
  protected readonly cells = computed<Cell<T>[]>(() => {
    const items = this.items();
    const key = this.key();
    const before = this.lastCells;
    const now = new Map<unknown, Cell<T>>();
    let breaks = 0;
    const cells = this.rows().flatMap((row, i, all) => [
      ...row.tiles.map((t) => {
        const item = items[t.index]!;
        const k = key(item);
        // The same item at the same size keeps its cell object: its tile is left as it is.
        const old = before.get(k);
        const cell =
          old?.kind === 'tile' &&
          old.item === item &&
          old.width === t.width &&
          old.height === t.height
            ? old
            : { kind: 'tile' as const, item, width: t.width, height: t.height, key: k };
        now.set(k, cell);
        return cell;
      }),
      ...(i < all.length - 1 ? [{ kind: 'break' as const, key: `break-${breaks++}` }] : []),
    ]);
    this.lastCells = now;
    return cells;
  });
  private lastCells = new Map<unknown, Cell<T>>();

  constructor() {
    const onResize = () => this.viewport.set(window.innerHeight);
    window.addEventListener('resize', onResize);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) =>
        this.measured(Math.floor(entries[0]?.contentRect.width ?? 0)),
      );
      observer.observe(this.host.nativeElement);
    }
    // The first width is measured in the same render: from the observer it came a frame later,
    // and that frame showed the section empty with what follows it in view, then pushed it all
    // down (layout shift 0.09 on a desk, 0.14 on a phone, perf audit). The observer follows
    // later changes.
    afterNextRender({
      earlyRead: () => contentWidth(this.host.nativeElement),
      write: (w) => this.measured(w),
    });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    });
  }

  /** A width the scrollbar takes back a moment after giving it does not move the tiles. */
  private measured(w: number): void {
    const next = this.damper.next(w, performance.now());
    if (next !== null) this.width.set(next);
  }

  protected onBackground(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.backgroundClick.emit();
  }
}

/**
 * The rows for these items. When the items only grew at the end (the next page) with the same
 * options, every tile already drawn stays exactly where it is: the rows are kept, a last
 * row that did not fill its line is closed with the first new videos at its height (stretched a
 * little to meet the edge) or, when none fit so closely, laid out again with them — a short row
 * in the middle of the shelf is a hole — and only what follows is laid out. The rows drawn
 * may stop short of the items (a last row held back for the next page): the rest is laid out the
 * same way. Anything else lays the page out from the start.
 */
export function extendLayout(
  last: DrawnLayout | null,
  keys: readonly unknown[],
  aspects: readonly number[],
  options: MosaicOptions,
): MosaicRow[] {
  const kept =
    last !== null &&
    keys.length >= last.keys.length &&
    sameOptions(last.options, options) &&
    last.keys.every((k, i) => keys[i] === k && aspects[i] === last.aspects[i]);
  if (!kept || !last.rows.length) return layoutMosaic(aspects, options);
  let from = last.rows.reduce((n, r) => n + r.tiles.length, 0);
  // The same shelf again (back on it): the same rows.
  if (from === keys.length) return last.rows;
  const rows = [...last.rows];
  const tail = rows.at(-1)!;
  if (tail.partial) {
    const closed = closeRow(tail, tileShapes(aspects, options), from, options);
    if (closed) {
      rows[rows.length - 1] = closed;
      from += closed.tiles.length - tail.tiles.length;
    } else {
      rows.pop();
      from -= tail.tiles.length;
    }
  }
  const rest = layoutMosaic(aspects.slice(from), options).map((r) => ({
    ...r,
    tiles: r.tiles.map((t) => ({ ...t, index: t.index + from })),
  }));
  return [...rows, ...rest];
}

function sameOptions(a: MosaicOptions, b: MosaicOptions): boolean {
  return (
    a.width === b.width &&
    a.viewport === b.viewport &&
    a.gap === b.gap &&
    a.count === b.count &&
    (a.zoom ?? 1) === (b.zoom ?? 1)
  );
}

/**
 * A row that did not fill its line, closed with the next tiles at its height: they take the room
 * left, each stretched by the same factor within ±12 % so the row meets the edge exactly. Null when
 * nothing fits so closely (the row then stays as it is).
 */
function closeRow(
  row: MosaicRow,
  shapes: readonly number[],
  start: number,
  o: MosaicOptions,
): MosaicRow | null {
  const used = row.tiles.reduce((n, t) => n + t.width, 0) + (row.tiles.length - 1) * o.gap;
  const room = o.width - used - o.gap;
  const picked: number[] = [];
  let natural = 0;
  for (let i = start; i < shapes.length; i++) {
    const width = shapes[i]! * row.height;
    const next = natural + width + (picked.length ? o.gap : 0);
    if (next > room * 1.12) break;
    picked.push(i);
    natural = next;
  }
  if (!picked.length || natural < room * 0.88) return null;
  const gaps = (picked.length - 1) * o.gap;
  const factor = (room - gaps) / (natural - gaps);
  const widths = picked.map((i) => Math.round(shapes[i]! * row.height * factor));
  widths[widths.length - 1]! += room - gaps - widths.reduce((n, w) => n + w, 0);
  return {
    height: row.height,
    partial: false,
    tiles: [
      ...row.tiles,
      ...picked.map((index, k) => ({ index, width: widths[k]!, height: row.height })),
    ],
  };
}

/** An element's content width as the ResizeObserver reports it: without its padding. */
function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return Math.floor(
    el.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'),
  );
}

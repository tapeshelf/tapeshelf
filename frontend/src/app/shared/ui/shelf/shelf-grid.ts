import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  type TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { type TileSize } from '../../../api';
import { WidthDamper } from '../mosaic/width-damper';
import { StrokeComponent } from '../stroke/stroke';

/** Narrowest tile per size; the column count follows from the container width. */
const MIN_TILE_PX: Record<TileSize, number> = { sm: 150, md: 210, lg: 300 };
const GAP_PX = 18;
const MAX_COLUMNS = 12;

export function columnsFor(width: number, size: TileSize): number {
  if (width <= 0) return 1;
  return Math.max(
    1,
    Math.min(MAX_COLUMNS, Math.floor((width + GAP_PX) / (MIN_TILE_PX[size] + GAP_PX))),
  );
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Tiles standing on shelves: rows are explicit (column count measured from the
 * container) so an orange brush stroke can run under every row, including a half-filled last one,
 * with generous air between the tiles and the stroke. Each row draws its own stroke, so the shelf
 * looks hand-drawn rather than ruled.
 */
@Component({
  selector: 'app-shelf-grid',
  imports: [NgTemplateOutlet, StrokeComponent],
  host: { class: 'block', '(click)': 'onHostClick($event)' },
  template: `
    @for (row of rows(); track $index; let i = $index; let last = $last) {
      <div
        class="grid items-end"
        role="presentation"
        [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'"
        [style.column-gap.px]="gap"
        (click)="onRowClick($event)"
      >
        @for (item of row; track key()(item)) {
          <ng-container *ngTemplateOutlet="itemTemplate(); context: { $implicit: item }" />
        }
      </div>
      <app-stroke
        class="mt-5 -mx-1"
        [class.mb-12]="!last"
        [width]="width() + 8"
        [seed]="seed() + i * 7919"
        (click)="backgroundClick.emit()"
      />
    }
  `,
})
export class ShelfGridComponent<T> {
  readonly items = input.required<readonly T[]>();
  readonly tileSize = input<TileSize>('md');
  readonly key = input.required<(item: T) => unknown>();
  readonly itemTemplate = input.required<TemplateRef<{ $implicit: T }>>();
  /** Varies the strokes between grids on the same page (e.g. the visitor's sections). */
  readonly seed = input(11);
  /** A click on the shelf or between tiles (used to clear a selection). */
  readonly backgroundClick = output<void>();

  protected readonly gap = GAP_PX;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly width = signal(this.host.nativeElement.clientWidth || window.innerWidth - 64);
  protected readonly columns = computed(() => columnsFor(this.width(), this.tileSize()));
  protected readonly rows = computed(() => chunk(this.items(), this.columns()));

  constructor() {
    if (typeof ResizeObserver === 'undefined') return;
    // A width the scrollbar takes back a moment after giving it does not move the rows.
    const damper = new WidthDamper();
    const observer = new ResizeObserver((entries) => {
      const w = damper.next(entries[0]?.contentRect.width ?? 0, performance.now());
      if (w !== null) this.width.set(w);
    });
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected onHostClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.backgroundClick.emit();
  }

  protected onRowClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.backgroundClick.emit();
  }
}

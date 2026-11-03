import { Component, input } from '@angular/core';

import { MosaicComponent } from './mosaic';
import { TileGhostComponent } from './tile-ghost';

/** As many as any row can take: the mosaic draws only the rows asked for. */
const GHOSTS = Array.from({ length: 48 }, (_, i) => i);
const LINES_PER_ROW = 3;

/**
 * The shape of a shelf that is on its way: rows of placeholders at the size the real tiles will have
 * (the same mosaic, the same count and zoom), so what comes takes their place and the page holds
 * still. They come up a moment late: a quick answer never shows them.
 */
@Component({
  selector: 'app-shelf-ghosts',
  imports: [MosaicComponent, TileGhostComponent],
  host: { class: 'block w-full', 'aria-hidden': 'true' },
  styles: `
    :host {
      animation: 240ms ease-out 120ms both come;
    }
    @keyframes come {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
  template: `
    @if (list()) {
      <div class="flex flex-col gap-1.5">
        @for (ghost of lines(); track ghost) {
          <app-tile-ghost class="relative h-[3.75rem] rounded-md" />
        }
      </div>
    } @else {
      <ng-template #tile let-height="height">
        <app-tile-ghost class="relative w-full" [style.height.px]="height" />
      </ng-template>
      <app-mosaic
        [items]="ghosts"
        [key]="key"
        [aspect]="aspect"
        [count]="count() ?? ghosts.length"
        [zoom]="zoom()"
        [maxRows]="rows()"
        [itemTemplate]="tile"
      />
    }
  `,
})
export class ShelfGhostsComponent {
  readonly rows = input(2);
  /** Tiles on the whole shelf, which decides their size; not known yet, a shelf of many. */
  readonly count = input<number | null>(null);
  readonly zoom = input(1);
  /** The shelf is shown as a list. */
  readonly list = input(false);

  protected readonly ghosts = GHOSTS;
  protected readonly key = (i: number): number => i;
  protected readonly aspect = (): number => 16 / 9;

  protected lines(): number[] {
    return GHOSTS.slice(0, this.rows() * LINES_PER_ROW);
  }
}

import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideFilm, lucideLayers } from '@ng-icons/lucide';

import { type CollectionItemDto, type PageLayout } from '../../../api';
import { aspectOf, stackLayout } from '../mosaic/mosaic-layout';

/**
 * A stack on the shelf: a folder like those on a phone's
 * home screen — an ink panel holding its first pictures, the layers mark, the stack's name and its
 * count under them. The pictures are laid out by what they are (`stackLayout`): tall ones side by
 * side, two wide ones one above the other, three as a big cover over two, four and more as a 2×2
 * grid whose last cell says "+N". Unlike a video, one picture edge to edge, it reads as "many
 * videos" at a glance.
 */
@Component({
  selector: 'app-stack-tile',
  imports: [TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideLayers, lucideCheck, lucideFilm })],
  host: { class: 'group/stack block h-full w-full' },
  template: `
    @if (layout() === 'list') {
      <div
        class="grid h-12 w-20 shrink-0 gap-[2px] rounded-[4px] bg-inverse p-[3px]"
        [style.grid-template-columns]="grid().columns"
        [style.grid-template-rows]="grid().rows"
        data-morph
      >
        @for (cell of cells(); track $index) {
          <div
            class="min-h-0 min-w-0 overflow-hidden rounded-[2px] bg-on-inverse/10"
            [class.col-span-2]="layoutOf().kind === 'feature' && $index === 0"
          >
            @if (cell.item?.video?.thumbnailUrl ? cell.item : null; as item) {
              <img
                [src]="item.video.thumbnailUrl"
                alt=""
                class="h-full w-full object-cover"
                [class.blur-md]="blurred()"
                loading="lazy"
                draggable="false"
              />
            }
          </div>
        }
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{{ title() || ('stacks.stack' | transloco) }}</p>
        <p class="label-mono flex items-center gap-1 truncate text-muted">
          <ng-icon name="lucideLayers" size="12" />
          {{ 'stacks.videos' | transloco: { count: size() } }}
        </p>
      </div>
    } @else {
      <div class="relative h-full w-full" [style.height.px]="height()">
        <div
          class="absolute inset-0 flex origin-center flex-col overflow-hidden rounded-[6px] bg-inverse text-on-inverse shadow-[0_1px_0_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover/stack:-translate-y-[2px]"
          [class.scale-[0.93]]="armed()"
          [style.padding.px]="pad()"
          [style.gap.px]="pad()"
          data-morph
        >
          <div
            class="grid min-h-0 flex-1"
            [style.grid-template-columns]="grid().columns"
            [style.grid-template-rows]="grid().rows"
            [style.gap.px]="gap()"
            [attr.data-layout]="layoutOf().kind"
          >
            @for (cell of cells(); track $index) {
              <div
                class="relative min-h-0 min-w-0 overflow-hidden rounded-[3px] bg-on-inverse/10"
                [class.col-span-2]="layoutOf().kind === 'feature' && $index === 0"
              >
                @if (cell.item?.video?.thumbnailUrl ? cell.item : null; as item) {
                  <!-- The first cell is the stack's cover. -->
                  <img
                    [src]="item.video.thumbnailUrl"
                    alt=""
                    [attr.data-thumb]="$index === 0 ? '' : null"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover/stack:scale-[1.04]"
                    [class.blur-xl]="blurred()"
                    loading="lazy"
                    draggable="false"
                  />
                }
                @if (cell.item && !cell.item.video.thumbnailUrl) {
                  <!-- No picture yet (still processing). -->
                  <span
                    class="absolute inset-0 flex items-center justify-center text-on-inverse/40"
                  >
                    <ng-icon name="lucideFilm" size="18" />
                  </span>
                }
                @if (cell.more) {
                  <span
                    class="absolute inset-0 flex items-center justify-center bg-black/55 font-display font-bold text-white"
                    [style.font-size.px]="moreSize()"
                    data-testid="stack-more"
                    >+{{ cell.more }}</span
                  >
                }
              </div>
            }
          </div>
          <div class="flex shrink-0 items-center gap-1.5 leading-none">
            <ng-icon name="lucideLayers" size="13" class="shrink-0 opacity-80" />
            <span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{{
              title() || ('stacks.stack' | transloco)
            }}</span>
            <span class="shrink-0 font-mono text-[11px] opacity-80" data-testid="stack-count">{{
              size()
            }}</span>
          </div>
        </div>
        <span
          class="pointer-events-none absolute inset-0 rounded-[6px] opacity-0 ring-2 ring-ink ring-inset transition-opacity group-focus-visible:opacity-100"
          aria-hidden="true"
        ></span>
        @if (armed()) {
          <span
            class="pointer-events-none absolute inset-0 rounded-[6px] ring-[3px] ring-accent ring-inset"
            aria-hidden="true"
          ></span>
        }
        @if (selected()) {
          <span
            class="pointer-events-none absolute inset-0 rounded-[6px] ring-[3px] ring-accent ring-inset"
            aria-hidden="true"
          ></span>
          <span
            class="pointer-events-none absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg"
            aria-hidden="true"
            data-testid="tile-check"
          >
            <ng-icon name="lucideCheck" size="14" strokeWidth="3" />
          </span>
        }
      </div>
    }
  `,
})
export class StackTileComponent {
  /** The stack's videos loaded so far; the first is the cover. */
  readonly items = input.required<readonly CollectionItemDto[]>();
  readonly size = input.required<number>();
  readonly name = input<string | null>(null);
  readonly layout = input<PageLayout>('grid');
  readonly height = input<number | null>(null);
  readonly selected = input(false);
  /** A drag hovers over it: dropping now puts the videos into this stack. */
  readonly armed = input(false);
  /** The cover is sensitive and this viewer has not agreed. */
  readonly blurred = input(false);

  protected readonly title = computed(() => this.name() ?? '');
  protected readonly layoutOf = computed(() =>
    stackLayout(
      this.items().map((i) => aspectOf(i.video.width, i.video.height)),
      this.size(),
    ),
  );
  /** The grid of the layout: tall ones in one row, two wide in a column, three as 1 + 2, or 2×2. */
  protected readonly grid = computed(() => {
    const { kind, cells } = this.layoutOf();
    if (kind === 'row') return { columns: `repeat(${cells}, minmax(0, 1fr))`, rows: '1fr' };
    if (kind === 'column') return { columns: '1fr', rows: 'repeat(2, minmax(0, 1fr))' };
    if (kind === 'feature')
      return { columns: 'repeat(2, minmax(0, 1fr))', rows: 'minmax(0, 2fr) minmax(0, 1fr)' };
    return { columns: 'repeat(2, minmax(0, 1fr))', rows: 'repeat(2, minmax(0, 1fr))' };
  });
  /**
   * The cells of the layout: the first pictures in order (the cover first); when the stack holds
   * more than the cells show, the last one says how many more.
   */
  protected readonly cells = computed(() => {
    const items = this.items();
    const size = this.size();
    const { cells } = this.layoutOf();
    return Array.from({ length: cells }, (_, i) => ({
      item: items[i] ?? null,
      more: i === cells - 1 && size > cells ? size - cells + 1 : 0,
    }));
  });
  /** The folder's margin and the space between pictures follow the tile's size. */
  protected readonly pad = computed(() =>
    Math.round(Math.min(10, Math.max(5, (this.height() ?? 200) * 0.04))),
  );
  protected readonly gap = computed(() => Math.max(3, Math.round(this.pad() * 0.6)));
  protected readonly moreSize = computed(() =>
    Math.round(Math.min(28, Math.max(13, (this.height() ?? 200) * 0.11))),
  );
}

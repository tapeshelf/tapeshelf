import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  type TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';

import { type MosaicContext } from '../ui/mosaic/mosaic';
import { minTileWidth, targetRowHeight } from '../ui/mosaic/mosaic-layout';

const GAP = 8;

/**
 * One row of tiles that scrolls sideways (the "Featured" strip): the tiles are as tall as
 * the shelf's rows below, so the strip reads as part of the shelf, never taller than 40 % of the
 * screen. The owner drags tiles along it to reorder.
 */
@Component({
  selector: 'app-shelf-strip',
  imports: [NgTemplateOutlet, CdkDropList, CdkDrag, NgIcon, TranslocoPipe],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  host: { class: 'relative block' },
  template: `
    <div
      #track
      class="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      [style.column-gap.px]="gap"
      cdkDropList
      [cdkDropListOrientation]="'horizontal'"
      [cdkDropListDisabled]="!reorderable()"
      (cdkDropListDropped)="dropped($event)"
      (scroll)="measure()"
    >
      @for (item of items(); track key()(item)) {
        <div
          class="shrink-0"
          [style.width.px]="widthOf(item)"
          cdkDrag
          [cdkDragDisabled]="!reorderable()"
          [cdkDragStartDelay]="{ touch: 350, mouse: 0 }"
        >
          <ng-container
            *ngTemplateOutlet="
              itemTemplate();
              context: { $implicit: item, width: widthOf(item), height: height() }
            "
          />
        </div>
      }
    </div>
    @if (canBack()) {
      <button
        type="button"
        class="absolute top-1/2 left-2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-line bg-surface text-text shadow-hard-sm max-sm:hidden"
        [attr.aria-label]="'collection.featured.back' | transloco"
        (click)="page(-1)"
      >
        <ng-icon name="lucideChevronLeft" size="18" />
      </button>
    }
    @if (canForward()) {
      <button
        type="button"
        class="absolute top-1/2 right-2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-line bg-surface text-text shadow-hard-sm max-sm:hidden"
        [attr.aria-label]="'collection.featured.forward' | transloco"
        (click)="page(1)"
      >
        <ng-icon name="lucideChevronRight" size="18" />
      </button>
    }
  `,
})
export class ShelfStripComponent<T> {
  readonly items = input.required<readonly T[]>();
  readonly key = input.required<(item: T) => string>();
  readonly aspect = input.required<(item: T) => number>();
  readonly itemTemplate = input.required<TemplateRef<MosaicContext<T>>>();
  /** How many tiles the whole shelf has: its rows' height is chosen for that. */
  readonly count = input(0);
  readonly zoom = input(1);
  readonly reorderable = input(false);
  /** The keys in their new order, after a drag. */
  readonly reordered = output<string[]>();

  protected readonly gap = GAP;
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly width = signal(0);
  private readonly scroll = signal({ left: 0, max: 0 });
  private readonly options = computed(() => ({
    width: this.width(),
    viewport: window.innerHeight,
    gap: GAP,
    zoom: this.zoom(),
  }));
  protected readonly height = computed(() => {
    const o = this.options();
    return Math.round(Math.min(targetRowHeight(Math.max(this.count(), 2), o), o.viewport * 0.4));
  });
  /** A tall video's tile is no narrower than the shelf's narrowest (its picture is cropped). */
  private readonly narrowest = computed(() => minTileWidth(this.options()));
  protected readonly canBack = computed(() => this.scroll().left > 4);
  protected readonly canForward = computed(() => this.scroll().max - this.scroll().left > 4);

  constructor() {
    const observer = new ResizeObserver((entries) => {
      this.width.set(Math.floor(entries[0]?.contentRect.width ?? 0));
      this.measure();
    });
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
    // Pinned or unpinned, the strip grows or shrinks inside the same width: the arrows follow.
    const injector = inject(Injector);
    effect(() => {
      this.items();
      this.height();
      afterNextRender(() => this.measure(), { injector });
    });
  }

  protected widthOf(item: T): number {
    return Math.max(this.narrowest(), Math.round(this.height() * this.aspect()(item)));
  }

  protected measure(): void {
    const el = this.track().nativeElement;
    this.scroll.set({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth });
  }

  /** The next or previous screenful of the strip. */
  protected page(way: -1 | 1): void {
    const el = this.track().nativeElement;
    el.scrollBy({ left: way * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  protected dropped(e: CdkDragDrop<unknown>): void {
    if (e.previousIndex === e.currentIndex) return;
    const keys = this.items().map((i) => this.key()(i));
    const [moved] = keys.splice(e.previousIndex, 1);
    keys.splice(e.currentIndex, 0, moved!);
    this.reordered.emit(keys);
  }
}

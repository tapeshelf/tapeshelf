import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideMaximize2 } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';

import type { VideoCardDto } from '../../api/models/video-card-dto';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { formatBytes } from '../../shared/pipes/bytes.pipe';
import { formatDuration } from '../../shared/pipes/duration.pipe';
import { qualityLabel } from '../../shared/pipes/quality.pipe';
import { type LightboxItem, Lightbox } from '../../shared/ui/lightbox/lightbox';
import { aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { WidthDamper } from '../../shared/ui/mosaic/width-damper';
import { MosaicComponent } from '../../shared/ui/mosaic/mosaic';

/** The exchange board's tiles: a long strip's height, the width a caption needs, the gap. */
const BOARD_MIN_HEIGHT = 88;
const BOARD_MIN_WIDTH = 156;
const BOARD_GAP = 12;

/** How tall a side's tiles would like to be: one video alone is big, many make a strip. */
function wantedHeight(count: number): number {
  if (count <= 1) return 240;
  if (count === 2) return 160;
  return count <= 4 ? 112 : BOARD_MIN_HEIGHT;
}

/** A tile in its video's shape, a tall one in a dark frame wide enough for its caption. */
function frameWidth(aspect: number, height: number): number {
  return Math.max(BOARD_MIN_WIDTH, Math.round(height * aspect));
}

/** The lines the tiles take at this height, wrapped as the page wraps them. */
function linesAt(aspects: readonly number[], height: number, width: number): number {
  let lines = 1;
  let line = 0;
  for (const a of aspects) {
    const w = Math.min(width, frameWidth(a, height));
    if (line && line + BOARD_GAP + w > width) {
      lines++;
      line = w;
    } else line = line ? line + BOARD_GAP + w : w;
  }
  return lines;
}

/**
 * The height of one side's tiles on the exchange board: the fewer videos, the bigger. One
 * alone is about three times a strip's tile, two stand one above the other, more go two a line;
 * each shrinks until it fits the side's width, never below the strip's height.
 */
export function boardTileHeight(aspects: readonly number[], width: number): number {
  const n = aspects.length;
  if (!n || width <= 0) return BOARD_MIN_HEIGHT;
  const lines = n <= 2 ? n : Math.ceil(n / 2);
  for (let h = wantedHeight(n); h > BOARD_MIN_HEIGHT; h -= 4) {
    const widest = Math.max(...aspects.map((a) => frameWidth(a, h)));
    if (widest <= width && linesAt(aspects, h, width) <= lines) return h;
  }
  return BOARD_MIN_HEIGHT;
}

/** "12:04 · 1.2 GB · 1080p": what anyone in a deal knows of a video. */
export function videoMeta(v: VideoCardDto): string {
  return [
    v.durationSec ? formatDuration(v.durationSec) : null,
    v.sizeBytes ? formatBytes(v.sizeBytes) : null,
    qualityLabel(v.width, v.height),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The frame previews of videos, for the full-screen view. */
export function previewItems(
  videos: readonly VideoCardDto[],
  link: (v: VideoCardDto) => unknown[] | null = () => null,
): LightboxItem[] {
  return videos.map((v) => ({
    url: v.contactSheetUrl ?? v.thumbnailUrl ?? '',
    title: v.title,
    meta: videoMeta(v),
    sensitive: v.sensitive,
    link: link(v),
  }));
}

/**
 * The videos of a deal as the page's main thing: big frame previews, each in its video's
 * shape — tall ones stand, wide ones lie, mixed rows fill the width (the shelf's mosaic). A click
 * opens the preview full screen; while picking, a tick marks what goes into the offer.
 */
@Component({
  selector: 'app-deal-gallery',
  imports: [NgIcon, NgTemplateOutlet, TranslocoPipe, MosaicComponent, SensitiveBlurDirective],
  providers: [provideIcons({ lucideCheck, lucideMaximize2 })],
  host: { class: 'block' },
  template: `
    @if (compact()) {
      <div class="flex flex-wrap gap-3">
        @for (v of videos(); track v.id) {
          <div
            class="max-w-full min-w-0"
            [style.width.px]="boardWidth(v)"
            [style.max-width]="boardHeight() === minHeight && videos().length > 1 ? halfLine : null"
          >
            <ng-container
              *ngTemplateOutlet="tile; context: { $implicit: v, height: boardHeight() }"
            />
          </div>
        }
      </div>
    } @else {
      <app-mosaic
        [items]="videos()"
        [key]="key"
        [aspect]="aspect"
        [itemTemplate]="tile"
        [gap]="16"
        [zoom]="zoom()"
      />
    }
    <ng-template #tile let-v let-w="width" let-h="height">
      <figure
        class="mb-1"
        [class.opacity-45]="picking() && !selected()!.has(v.id)"
        data-testid="deal-video"
      >
        <div
          class="group relative overflow-hidden rounded-lg border-2 bg-screen"
          [class.border-accent]="picking() && selected()!.has(v.id)"
          [class.border-line]="!(picking() && selected()!.has(v.id))"
          [style.height.px]="h"
          [style.aspect-ratio]="h === null ? aspect(v) : null"
        >
          <button
            type="button"
            class="block h-full w-full cursor-zoom-in"
            [attr.aria-label]="'deals.gallery.open' | transloco: { title: v.title }"
            data-testid="deal-preview"
            (click)="picking() ? picked.emit(v.id) : open(v)"
          >
            @if (v.contactSheetUrl ?? v.thumbnailUrl; as src) {
              <img
                [src]="src"
                [appSensitiveBlur]="v.sensitive"
                alt=""
                class="h-full w-full object-contain"
                loading="lazy"
              />
            }
          </button>
          @if (v.status === 'QUEUED' || v.status === 'PROCESSING') {
            <div
              class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-scrim text-sm text-white"
            >
              {{ 'deals.gallery.processing' | transloco }}
              <span class="h-1.5 w-1/2 overflow-hidden rounded-full bg-white/25">
                <span class="block h-full bg-accent" [style.width.%]="v.progress"></span>
              </span>
            </div>
          } @else if (v.status === 'FAILED') {
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center bg-scrim px-4 text-center text-sm text-white"
            >
              {{ 'deals.gallery.failed' | transloco }}
            </div>
          }
          @if (picking()) {
            <span
              class="pointer-events-none absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-md border-2 border-white bg-black/40 text-white shadow"
              [class.bg-accent]="selected()!.has(v.id)"
              [class.border-accent]="selected()!.has(v.id)"
              aria-hidden="true"
            >
              @if (selected()!.has(v.id)) {
                <ng-icon name="lucideCheck" size="16" />
              }
            </span>
            <button
              type="button"
              class="absolute top-2 right-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              [attr.aria-label]="'deals.gallery.open' | transloco: { title: v.title }"
              (click)="open(v)"
            >
              <ng-icon name="lucideMaximize2" size="15" />
            </button>
          }
        </div>
        <figcaption class="mt-1.5 min-w-0 px-0.5">
          <p class="truncate text-sm font-semibold" [title]="v.title">{{ v.title }}</p>
          <p class="label-mono truncate text-muted" [title]="meta(v)">{{ meta(v) }}</p>
        </figcaption>
      </figure>
    </ng-template>
  `,
})
export class DealGalleryComponent {
  private readonly lightbox = inject(Lightbox);

  readonly videos = input.required<readonly VideoCardDto[]>();
  /** Picking for an offer: the ticked ones; null when only looking. */
  readonly selected = input<ReadonlySet<string> | null>(null);
  /** Smaller tiles for the side that is not the page's main thing. */
  readonly zoom = input(1);
  /**
   * One side of the exchange board: tiles of one height, sized by how many there are — the
   * exchange itself is the page's main thing once it is under way, not the pictures.
   */
  readonly compact = input(false);
  /** A tile ticked or unticked while picking. */
  readonly picked = output<string>();

  protected readonly key = (v: VideoCardDto) => v.id;
  protected readonly aspect = (v: VideoCardDto) => aspectOf(v.width, v.height);
  protected readonly meta = videoMeta;
  protected readonly picking = () => this.selected() !== null;
  protected readonly minHeight = BOARD_MIN_HEIGHT;
  /** At the strip's height two tiles always share a line, even on a narrow phone. */
  protected readonly halfLine = `calc(50% - ${BOARD_GAP / 2}px)`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly width = signal(0);
  protected readonly boardHeight = computed(() =>
    boardTileHeight(this.videos().map(this.aspect), this.width()),
  );

  constructor() {
    // Fewer pixels across, lower tiles: the page's scrollbar must not bring that back and forth,
    // shaking the page for good (the shelf's own trouble).
    const damper = new WidthDamper();
    const measure = (w: number) => {
      const next = damper.next(Math.floor(w), performance.now());
      if (next !== null) this.width.set(next);
    };
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));
      observer.observe(this.host.nativeElement);
    }
    // The first width in the same render, so the board does not jump a size a frame later.
    afterNextRender({
      earlyRead: () => this.host.nativeElement.clientWidth,
      write: measure,
    });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }

  protected boardWidth(v: VideoCardDto): number {
    return frameWidth(this.aspect(v), this.boardHeight());
  }

  protected open(v: VideoCardDto): void {
    const all = this.videos();
    void this.lightbox.open(previewItems(all), all.indexOf(v));
  }
}

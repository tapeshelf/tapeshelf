import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { SensitiveContentService } from '../../../core/content/sensitive.service';
import { scrubIndex } from '../../../features/library/selection';

/** How long the pointer rests on a tile before it scrubs: crossing the shelf arms nothing. */
export const ARM_DELAY_MS = 120;

/**
 * A thumbnail that scrubs through the 16 extracted frames as the pointer moves across it.
 * Frames are fetched as the pointer reaches them (with their neighbours), once it
 * has rested on the tile a moment: all 16 used to go out at the first touch of the pointer, a pass of
 * the cursor over a shelf meant hundreds of requests. Touch devices just see the thumbnail.
 * A video marked sensitive shows a blurred picture with the badge instead, and no frames,
 * until the viewer has agreed.
 */
@Component({
  selector: 'app-thumb-scrub',
  imports: [TranslocoPipe],
  host: {
    class: 'relative block h-full w-full overflow-hidden bg-surface-2',
  },
  template: `
    @if (thumbnailUrl(); as url) {
      <img
        [src]="url"
        [alt]="alt()"
        class="h-full w-full object-cover"
        [class.blur-xl]="blurred()"
        [class.scale-110]="blurred()"
        loading="lazy"
        decoding="async"
        draggable="false"
        data-thumb
      />
    } @else {
      <div class="flex h-full w-full items-center justify-center text-faint">
        <ng-content />
      </div>
    }
    <!-- The frames asked for lie over the cover and only the current one shows: switching is just
         visibility, and one still loading is transparent, so the cover shows through instead of a
         blank flash. -->
    @if (armed() && !blurred()) {
      @for (i of requested(); track i) {
        <img
          [src]="frameUrls()[i]"
          alt=""
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 h-full w-full object-cover"
          [style.visibility]="index() === i ? 'visible' : 'hidden'"
          decoding="async"
          draggable="false"
          data-frame
        />
      }
    }
    @if (blurred()) {
      <span
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
        data-testid="sensitive-cover"
      >
        <span
          class="rounded-full bg-scrim px-3 py-1 text-xs font-medium tracking-wide text-white"
          >{{ 'sensitive.badge' | transloco }}</span
        >
      </span>
    } @else if (index() !== null && frameUrls().length > 1) {
      <!-- At the top edge: the bottom is where a tile shows its name on hover. -->
      <div class="absolute inset-x-0 top-0 h-0.5 bg-black/20">
        <div class="h-full bg-accent" [style.width.%]="progress()"></div>
      </div>
    }
  `,
})
export class ThumbScrubComponent {
  private readonly sensitive = inject(SensitiveContentService);
  readonly thumbnailUrl = input<string | null>(null);
  readonly frameUrls = input<readonly string[]>([]);
  readonly alt = input('');
  /** The video is marked sensitive and this viewer is not its author. */
  readonly restricted = input(false);

  protected readonly blurred = computed(() => this.restricted() && !this.sensitive.allowed());
  /** The frame under the pointer; null when the pointer is away. */
  protected readonly index = signal<number | null>(null);
  /** Scrubbing starts once the pointer rested on the tile (ARM_DELAY_MS). */
  protected readonly armed = signal(false);
  /** The frames asked for so far: the ones the pointer reached, with their neighbours. */
  protected readonly requested = signal<readonly number[]>([]);
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private lastIndex = 0;
  protected readonly progress = computed(() => {
    const i = this.index();
    const n = this.frameUrls().length;
    return i === null || n === 0 ? 0 : ((i + 1) / n) * 100;
  });

  constructor() {
    // Plain listeners, not host bindings: a host listener marks every view up to the page for
    // checking, so each mouse move over the shelf re-checked all its tiles. The
    // signals set here refresh this tile alone.
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const move = (e: PointerEvent) => this.onMove(e);
    const leave = () => this.reset();
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    inject(DestroyRef).onDestroy(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      this.cancelArming();
    });
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.frameUrls().length === 0 || this.blurred()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.lastIndex = scrubIndex(e.clientX - rect.left, rect.width, this.frameUrls().length);
    if (this.armed()) return this.show(this.lastIndex);
    this.armTimer ??= setTimeout(() => {
      this.armTimer = null;
      this.armed.set(true);
      this.show(this.lastIndex);
    }, ARM_DELAY_MS);
  }

  /**
   * The pointer left: the frames go too. They stayed under the cover until the shelf was left, up
   * to 16 images for every tile the pointer had rested on; coming back finds them in
   * the browser's cache.
   */
  private reset(): void {
    this.cancelArming();
    this.index.set(null);
    this.armed.set(false);
    this.requested.set([]);
  }

  private show(i: number): void {
    this.index.set(i);
    const n = this.frameUrls().length;
    const have = this.requested();
    const add = [i, i + 1, i - 1].filter((k) => k >= 0 && k < n && !have.includes(k));
    if (add.length) this.requested.set([...have, ...add]);
  }

  private cancelArming(): void {
    if (this.armTimer) clearTimeout(this.armTimer);
    this.armTimer = null;
  }
}

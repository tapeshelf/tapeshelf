import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUp, lucideSearch } from '@ng-icons/lucide';

import { LayoutFrame } from '../../core/layout/frame';
import { ShelfFolderMenuComponent, type FolderMenuItem } from './shelf-folder-menu';
import { ShelfSearchComponent } from './shelf-search';
import { ShelfZoomComponent } from './shelf-zoom';

const PHONE = 640;

/**
 * The shelf's controls in a slim bar at the top of the window once the row of categories has
 * scrolled away with the header: the open category with the list of all, search, the zoom and "back to the top".
 * On a phone it slips away while the shelf scrolls down and comes back as soon as it scrolls up.
 */
@Component({
  selector: 'app-shelf-sticky-bar',
  imports: [
    NgIcon,
    TranslocoPipe,
    ShelfFolderMenuComponent,
    ShelfSearchComponent,
    ShelfZoomComponent,
  ],
  providers: [provideIcons({ lucideArrowUp, lucideSearch })],
  host: {
    class:
      'fixed inset-x-0 top-0 z-20 block border-b border-border bg-canvas/95 backdrop-blur-sm transition-[transform,opacity] duration-200 motion-reduce:transition-none',
    '[class.-translate-y-full]': '!shown()',
    '[class.opacity-0]': '!shown()',
    '[class.pointer-events-none]': '!shown()',
    '[attr.aria-hidden]': '!shown()',
    '[attr.inert]': 'shown() ? null : ""',
    'data-testid': 'shelf-sticky-bar',
  },
  template: `
    <div class="flex h-12 items-center gap-2" [class]="frame.frame()">
      <app-shelf-folder-menu
        class="min-w-0"
        [items]="items()"
        [label]="label()"
        [count]="count()"
        [strong]="true"
        [ariaLabel]="'collection.sticky.folders' | transloco"
        (picked)="picked.emit($event)"
      />
      <span class="flex-1"></span>
      @if (searchable()) {
        <!-- Only while the bar is out: the page's own field is the one in use otherwise. -->
        @if (shown() && (searchOpen() || search())) {
          <app-shelf-search
            class="max-sm:max-w-40"
            [value]="search()"
            [autofocus]="true"
            (searched)="searched.emit($event)"
          />
        } @else {
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
            [attr.aria-label]="'collection.search.label' | transloco"
            (click)="searchOpen.set(true)"
            data-testid="sticky-search"
          >
            <ng-icon name="lucideSearch" size="16" />
          </button>
        }
      }
      @if (zoomable()) {
        <app-shelf-zoom class="max-sm:hidden" />
      }
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
        [attr.aria-label]="'collection.sticky.top' | transloco"
        [attr.title]="'collection.sticky.top' | transloco"
        (click)="toTop()"
      >
        <ng-icon name="lucideArrowUp" size="16" />
      </button>
    </div>
  `,
})
export class ShelfStickyBarComponent {
  /** The row of categories: the bar shows while it is above the top of the screen. */
  readonly anchor = input.required<HTMLElement | null>();
  readonly items = input.required<FolderMenuItem[]>();
  readonly label = input.required<string>();
  readonly count = input<number | null>(null);
  readonly search = input('');
  readonly searchable = input(false);
  readonly zoomable = input(false);
  readonly picked = output<string>();
  readonly searched = output<string>();

  protected readonly frame = inject(LayoutFrame);
  protected readonly searchOpen = signal(false);
  private readonly past = signal(false);
  private readonly upward = signal(true);
  private readonly phone = signal(typeof window !== 'undefined' && window.innerWidth < PHONE);
  protected readonly shown = computed(() => this.past() && (!this.phone() || this.upward()));

  constructor() {
    let observer: IntersectionObserver | null = null;
    effect((onCleanup) => {
      const anchor = this.anchor();
      if (!anchor || typeof IntersectionObserver === 'undefined') return;
      observer = new IntersectionObserver(([entry]) => {
        if (!entry) return;
        // Above the window, not merely below it (a short shelf scrolled to its end).
        this.past.set(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      });
      observer.observe(anchor);
      onCleanup(() => observer?.disconnect());
    });
    let lastY = typeof window !== 'undefined' ? window.scrollY : 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      const up = y < lastY;
      lastY = y;
      if (up !== this.upward()) this.upward.set(up);
    };
    const onResize = () => {
      const phone = window.innerWidth < PHONE;
      if (phone !== this.phone()) this.phone.set(phone);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    });
  }

  protected toTop(): void {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }
}

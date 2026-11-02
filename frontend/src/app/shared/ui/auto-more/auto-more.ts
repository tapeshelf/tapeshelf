import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { ButtonDirective } from '../button/button.directive';
import { SpinnerComponent } from '../spinner/spinner';

/** Marks the box a list scrolls in when it is not the window (the side panel). */
export const SCROLL_ROOT = 'data-scroll-root';

/**
 * The next page of a list arrives by itself as its end comes near, the way photo
 * apps do it: no "Load more" button. This line under the list is watched; once it is within a
 * screen of the visible area (the window, or the panel the list scrolls in), `load` runs, and again
 * after each page while the line stays that close — a short first page on a tall screen fills it.
 * A page that fails or brings nothing stops it, and a button offers to try again.
 */
@Component({
  selector: 'app-auto-more',
  imports: [TranslocoPipe, ButtonDirective, SpinnerComponent],
  host: { class: 'block' },
  template: `
    @if (more()) {
      <div class="flex h-14 items-center justify-center text-muted" data-testid="auto-more">
        @if (stalled()) {
          <button type="button" appButton variant="secondary" (click)="retry()">
            {{ 'common.retry' | transloco }}
          </button>
        } @else if (pending() || busy()) {
          <span role="status" class="flex items-center">
            <app-spinner [size]="22" />
            <span class="sr-only">{{ 'common.loading' | transloco }}</span>
          </span>
        }
      </div>
    }
  `,
})
export class AutoMoreComponent {
  /** More is there to load. */
  readonly more = input.required<boolean>();
  /** How many are loaded: a page that does not change it has stalled. */
  readonly count = input.required<number>();
  /** Brings the next page; may reject. */
  readonly load = input.required<() => Promise<unknown> | void>();
  /** The list is loading by other means (a reload): wait for it. */
  readonly busy = input(false);

  protected readonly pending = signal(false);
  protected readonly stalled = signal(false);
  private readonly near = signal(false);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private root: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.root = this.host.closest<HTMLElement>(`[${SCROLL_ROOT}]`);
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => this.near.set(entries.some((e) => e.isIntersecting)),
        // A screen ahead: the next page is usually in before the end is reached.
        { root: this.root, rootMargin: '0px 0px 100% 0px' },
      );
      observer.observe(this.host);
      this.observer = observer;
      destroyRef.onDestroy(() => observer.disconnect());
    });
    effect(() => {
      if (this.near() && this.more() && !this.busy() && !this.pending() && !this.stalled())
        untracked(() => void this.run());
    });
    // Another list (a category, a tab, a search) or a page from elsewhere: try again on its own.
    effect(() => {
      this.count();
      untracked(() => this.stalled.set(false));
    });
  }

  protected retry(): void {
    this.stalled.set(false);
    this.near.set(true);
  }

  private async run(): Promise<void> {
    const before = this.count();
    this.pending.set(true);
    let failed = false;
    try {
      await this.load()();
    } catch {
      failed = true;
    }
    // Let the new rows take their place, then see where the line is now: the observer reports a
    // change only, and the last report may predate the page. Watching anew makes it report again.
    await frame();
    await frame();
    this.near.set(this.isNear());
    this.observer?.unobserve(this.host);
    this.observer?.observe(this.host);
    if (failed || (this.more() && this.count() === before)) this.stalled.set(true);
    this.pending.set(false);
  }

  private isNear(): boolean {
    if (!this.host.isConnected || this.host.getClientRects().length === 0) return false;
    const line = this.host.getBoundingClientRect();
    const view = this.root
      ? this.root.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight, height: window.innerHeight };
    return line.top <= view.bottom + view.height && line.bottom >= view.top;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => resolve())
      : setTimeout(resolve, 16),
  );
}

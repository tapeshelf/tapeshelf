import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * The one page frame: the header, the banners and every page share these gutters
 * and the same left edge, so moving between pages never shifts the layout. Very wide screens get a
 * generous cap; pages that read better narrow constrain their own content inside the frame.
 */
export const FRAME = 'mx-auto w-full px-4 sm:px-6 lg:px-10 2xl:px-14';

/** A page that reads like a document (route data `frame: 'narrow'`): a centred column. */
export const FRAME_NARROW = 'mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10';

/**
 * Which frame the open page wants: shelves and videos use the whole window, a few
 * document-like pages a centred column; the header and the footer follow, gliding between the two.
 */
@Injectable({ providedIn: 'root' })
export class LayoutFrame {
  private readonly router = inject(Router);
  readonly narrow = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => leaf(this.router.routerState.snapshot.root).data['frame'] === 'narrow'),
    ),
    { initialValue: false },
  );
  readonly frame = computed(() => (this.narrow() ? FRAME_NARROW : FRAME));

  private readonly footerHolds = signal(0);
  /** A page is still bringing its content in: the footer waits below it. */
  readonly footerHeld = computed(() => this.footerHolds() > 0);

  /**
   * Keeps the footer out while `held()` (or until the caller is gone). Shown at once, the footer
   * stood at the bottom of the window while a shelf loaded and was pushed away when the tiles came:
   * a layout shift of 0.04–0.08 by itself. Appearing under the content moves nothing.
   * A list that loads as it scrolls holds it until its last page. Call in an injection context.
   */
  holdFooterWhile(held: () => boolean): void {
    let holding = false;
    const set = (on: boolean) => {
      if (on === holding) return;
      holding = on;
      this.footerHolds.update((n) => n + (on ? 1 : -1));
    };
    set(true);
    const watch = effect(() => set(held()));
    inject(DestroyRef).onDestroy(() => {
      set(false);
      watch.destroy();
    });
  }
}

function leaf(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let r = route;
  while (r.firstChild) r = r.firstChild;
  return r;
}

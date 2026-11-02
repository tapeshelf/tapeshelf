import { Location } from '@angular/common';
import {
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { filter } from 'rxjs';

import { NavigationHistory } from '../../core/navigation/navigation-history';
import {
  CLOSE_PANEL,
  IN_PANEL,
  PANEL_OUTLET,
  PANEL_QUERY,
  type PanelSize,
  PanelState,
} from '../../core/navigation/panels';

const WIDTHS: Record<PanelSize, string> = {
  narrow: 'min(30rem, 100vw)',
  medium: 'min(46rem, 100vw)',
  wide: 'min(64rem, 100vw)',
};

/**
 * The side panel: the named outlet "panel" inside a sheet the whole height of the
 * window that slides in from the right edge over the page, header included, and a plain dim — no
 * shadow, no blur, so nothing flickers while it moves. The slide is the router's view transition
 * (styles.css: `panel`), so back and forward animate too. Closing goes back when the panel was
 * opened from this page inside the app, else drops the panel from the address.
 */
@Component({
  selector: 'app-panel-host',
  imports: [RouterOutlet, NgIcon, TranslocoPipe],
  providers: [{ provide: IN_PANEL, useValue: true }, provideIcons({ lucideX })],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @if (state.open()) {
      <div
        class="vt-panel-backdrop fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        (click)="close()"
      ></div>
    }
    <aside
      #sheet
      class="vt-panel fixed inset-y-0 right-0 z-50 flex max-w-full flex-col border-l border-line bg-canvas outline-none"
      [class.hidden]="!state.open()"
      [style.width]="width()"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      data-testid="panel"
    >
      <div class="flex h-14 shrink-0 items-center justify-end px-3 sm:h-16 sm:px-5">
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'common.close' | transloco"
          data-testid="panel-close"
          (click)="close()"
        >
          <ng-icon name="lucideX" size="20" />
        </button>
      </div>
      <div
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-12 sm:px-10"
        data-scroll-root
      >
        <router-outlet [name]="outlet" (activate)="opened()" (deactivate)="state.open.set(false)" />
      </div>
    </aside>
  `,
})
export class PanelHostComponent {
  protected readonly state = inject(PanelState);
  protected readonly outlet = PANEL_OUTLET;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly history = inject(NavigationHistory);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private readonly size = signal<PanelSize>('medium');
  protected readonly width = computed(() => WIDTHS[this.size()]);

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const panel = findPanel(this.router.routerState.snapshot.root);
        if (panel) this.size.set((panel.data['panel'] as PanelSize | undefined) ?? 'medium');
      });
    // The page under the panel stays still while the panel scrolls. Hiding the overflow takes the
    // page's scrollbar away; its width is put back as padding, or the shelf under the panel would
    // re-flow by those pixels (no reserved scrollbar gutter since).
    effect(() => {
      const root = document.documentElement;
      if (this.state.open()) {
        const scrollbar = window.innerWidth - root.clientWidth;
        root.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : '';
        root.style.overflow = 'hidden';
      } else {
        root.style.overflow = '';
        root.style.paddingRight = '';
      }
    });
    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.overflow = '';
      document.documentElement.style.paddingRight = '';
    });
  }

  protected opened(): void {
    this.state.open.set(true);
    queueMicrotask(() => this.sheet().nativeElement.focus({ preventScroll: true }));
  }

  close(): void {
    const query = { ...this.router.routerState.snapshot.root.queryParams };
    for (const key of PANEL_QUERY) delete query[key];
    const without = this.router.serializeUrl(
      this.router.createUrlTree(CLOSE_PANEL, { queryParams: query }),
    );
    if (this.history.previous() === without) this.location.back();
    else void this.router.navigateByUrl(without);
  }

  protected onEscape(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (
      !this.state.open() ||
      e.defaultPrevented ||
      document.querySelector(
        '.cdk-overlay-container [role="dialog"], .cdk-overlay-container [cdkmenu]',
      ) ||
      target?.closest('input, textarea, select, [contenteditable="true"], [cdkMenu]')
    )
      return;
    e.preventDefault();
    this.close();
  }
}

function findPanel(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot | null {
  for (const child of route.children) {
    if (child.outlet === PANEL_OUTLET) {
      let leaf = child;
      while (leaf.firstChild) leaf = leaf.firstChild;
      // Size is set on the panel's own route; a child (a settings tab) inherits it.
      return child.data['panel'] ? child : leaf;
    }
  }
  return null;
}

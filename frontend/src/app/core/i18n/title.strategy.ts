import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { type Subscription } from 'rxjs';

import { PANEL_OUTLET } from '../navigation/panels';

/**
 * A page's own tab title, for pages named by their content rather than a dictionary key: a user
 * page reads "@ann · tapeshelf", a video page "<video title> · tapeshelf".
 */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly own = signal<string | null>(null);
  readonly text = this.own.asReadonly();

  /** Call from a page's constructor: the tab shows `text()` while the page lives. */
  track(text: () => string | null | undefined): void {
    const ref = effect(() => this.own.set(text() || null));
    inject(DestroyRef).onDestroy(() => {
      ref.destroy();
      this.own.set(null);
    });
  }
}

/**
 * Tab titles from the dictionaries: a route's `title` is a translation key and the tab reads
 * "<page> · tapeshelf"; a page whose title already names the brand (the landing, "About tapeshelf")
 * is shown as is, and a route without a title shows the brand alone. A page's own title
 * (`PageTitle`) wins over the route's. Follows language changes.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitle);
  private readonly route = signal<{ page: string | null; brand: string } | null>(null);
  private subscription: Subscription | undefined;
  private panelOpen = false;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
    effect(() => this.render());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    // An open side panel names the tab: "Settings · tapeshelf" over a user page.
    const panel = panelTitle(snapshot.root);
    this.panelOpen = panel !== null;
    const key = panel ?? this.buildTitle(snapshot);
    this.subscription?.unsubscribe();
    this.subscription = this.transloco
      .selectTranslate<string[]>(key ? [key, 'app.name'] : ['app.name'])
      .subscribe((texts) => {
        this.route.set(
          key ? { page: texts[0]!, brand: texts[1]! } : { page: null, brand: texts[0]! },
        );
        this.render();
      });
  }

  private render(): void {
    const route = this.route();
    if (!route) return;
    const page = (this.panelOpen ? null : this.pageTitle.text()) ?? route.page;
    const brand = route.brand;
    this.title.setTitle(!page ? brand : page.includes(brand) ? page : `${page} · ${brand}`);
  }
}

/** The title key of the side panel's deepest titled route, or null when no panel is open. */
function panelTitle(root: ActivatedRouteSnapshot): string | null {
  let route = root.children.find((c) => c.outlet === PANEL_OUTLET) ?? null;
  let title: string | null = null;
  while (route) {
    if (typeof route.title === 'string') title = route.title;
    route = route.firstChild;
  }
  return title;
}

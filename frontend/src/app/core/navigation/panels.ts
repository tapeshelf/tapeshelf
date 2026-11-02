import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { type RedirectFunction, Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';

/**
 * The side panel: settings, messages, requests, notifications, friends and Pro
 * slide in over the page from the edge of the window instead of replacing it. They live in the
 * named router outlet "panel", so the page under them stays as it was, a panel has its own address
 * (/@ann(panel:settings/profile)) and the browser's back button closes it.
 */
export const PANEL_OUTLET = 'panel';

/** How wide a panel opens (route data `panel`). */
export type PanelSize = 'narrow' | 'medium' | 'wide';

/** Opens `path` in the side panel over whatever page is open now. */
export function panelLink(...path: (string | number)[]): unknown[] {
  return ['/', { outlets: { [PANEL_OUTLET]: path.map(String) } }];
}

/** Opens `path` in the side panel over a user's page (their friends over their shelf). */
export function panelOver(username: string, ...path: (string | number)[]): unknown[] {
  return ['/', { outlets: { primary: [`@${username}`], [PANEL_OUTLET]: path.map(String) } }];
}

/**
 * A page link that closes the side panel on the way (a video picked in a panel's list): Angular
 * keeps an open outlet across a plain link, which would leave the panel over the new page.
 */
export function closingPanel(link: readonly string[]): unknown[] {
  const path = link.map((s, i) => (i === 0 ? s.replace(/^\//, '') : s)).filter(Boolean);
  return ['/', { outlets: { primary: path, [PANEL_OUTLET]: null } }];
}

/** Closes the side panel and leaves the page under it as it is. */
export const CLOSE_PANEL: unknown[] = ['/', { outlets: { [PANEL_OUTLET]: null } }];

/**
 * The address's query belongs to the whole page, panel included: the page's own
 * (`?folder=`, `?category=`, `?stack=`) must survive a panel opening over it, so every link into a
 * panel merges the query instead of replacing it. These are the panel screens' own parameters (the
 * requests tab, the people list); closing the panel drops them.
 */
export const PANEL_QUERY: readonly string[] = ['tab', 'list'];

/** A link into the side panel (as opposed to a new page): it keeps the page's query. */
export function isPanelLink(link: readonly unknown[]): boolean {
  const target = link[1] as { outlets?: Record<string, unknown> } | undefined;
  return !!target?.outlets?.[PANEL_OUTLET];
}

/** Set inside the panel: pages draw a smaller head there (see PageHeadComponent). */
export const IN_PANEL = new InjectionToken<boolean>('IN_PANEL');

/** Whether a panel is open: the page under it leaves Esc and scrolling to the panel. */
@Injectable({ providedIn: 'root' })
export class PanelState {
  readonly open = signal(false);
}

/**
 * The addresses these screens had as pages (/settings/plan, /exchange/<id>, links in old emails and
 * bookmarks) open the same screen as a panel over the user's own shelf; a guest signs in first.
 */
export function intoPanel(): RedirectFunction {
  return ({ url, queryParams }) => {
    const router = inject(Router);
    const user = inject(AuthStore).user();
    const path = url.map((s) => s.path);
    if (!user)
      return router.createUrlTree(['/login'], { queryParams: { returnTo: `/${path.join('/')}` } });
    return router.createUrlTree(panelOver(user.username, ...path), { queryParams });
  };
}

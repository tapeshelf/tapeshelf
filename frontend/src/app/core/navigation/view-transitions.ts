import { inject } from '@angular/core';
import { type ActivatedRouteSnapshot, type ViewTransitionInfo } from '@angular/router';

import { PANEL_OUTLET } from './panels';
import { VideoMorph } from './video-morph';

/**
 * Router view transitions: the page content fades up, the header stays put, a
 * video grows out of its tile, the side panel slides in and out. Skipped for reduced motion
 * and for navigations that only change the query (filters, tabs), where a fade would just flicker.
 */
export function onViewTransitionCreated({ transition, from, to }: ViewTransitionInfo): void {
  const morph = inject(VideoMorph);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const page = pathOf(from) === pathOf(to);
  const panelFrom = panelOf(from);
  const panelTo = panelOf(to);
  // Only a filter or a tab changed: a fade would just flicker.
  // A skipped transition rejects `ready`; nothing waits on it, so it must not end up in the console.
  transition.ready.catch(() => undefined);
  if (reduce || (page && panelFrom === panelTo)) transition.skipTransition();
  // Only the side panel changed: the page under it stays perfectly still; inside an
  // open panel (another tab, a request from the list) the content crossfades instead of sliding
  // out and in again.
  const root = document.documentElement.classList;
  if (page) root.add('vt-panel-only');
  if (panelFrom && panelTo) root.add('vt-panel-swap');
  void transition.finished
    .finally(() => {
      morph.release();
      root.remove('vt-panel-only', 'vt-panel-swap');
    })
    .catch(() => undefined);
}

/** The page's own path: the primary outlet all the way down. */
function pathOf(snapshot: ActivatedRouteSnapshot): string {
  let leaf = snapshot;
  while (leaf.firstChild) leaf = leaf.firstChild;
  return leaf.pathFromRoot.flatMap((s) => s.url.map((u) => u.path)).join('/');
}

/** What the side panel shows ('' when closed). */
function panelOf(snapshot: ActivatedRouteSnapshot): string {
  const panel = snapshot.children.find((c) => c.outlet === PANEL_OUTLET);
  if (!panel) return '';
  let leaf = panel;
  while (leaf.firstChild) leaf = leaf.firstChild;
  return leaf.pathFromRoot
    .filter((s) => s.outlet === PANEL_OUTLET)
    .flatMap((s) => s.url.map((u) => u.path))
    .join('/');
}

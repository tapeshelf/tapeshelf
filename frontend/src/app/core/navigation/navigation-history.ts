import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Mirrors the browser history entries this app created, so a page can tell whether "back" stays
 * inside the app (an earlier page of ours) or would leave it (the page was opened by a link).
 * Replacing navigations (redirects) rewrite the last entry; back/forward pop or push.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistory {
  private readonly router = inject(Router);
  private readonly stack = signal<readonly string[]>([]);
  /** Whether going back lands on a page of this app. */
  readonly canGoBack = () => this.stack().length > 1;
  /** Where going back lands, when it stays inside the app. */
  readonly previous = (): string | null => {
    const s = this.stack();
    return s.length > 1 ? s[s.length - 2]! : null;
  };

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        const nav = this.router.lastSuccessfulNavigation();
        if (nav?.extras.skipLocationChange) return;
        this.stack.update((s) =>
          record(s, e.urlAfterRedirects, {
            popstate: nav?.trigger === 'popstate',
            replace: !!nav?.extras.replaceUrl,
          }),
        );
      });
  }
}

export function record(
  stack: readonly string[],
  url: string,
  how: { popstate: boolean; replace: boolean },
): string[] {
  if (how.popstate && stack.length > 1 && stack[stack.length - 2] === url)
    return stack.slice(0, -1);
  if (how.replace && stack.length > 0) return [...stack.slice(0, -1), url];
  return [...stack, url];
}

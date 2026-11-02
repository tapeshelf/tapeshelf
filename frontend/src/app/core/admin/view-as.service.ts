import { type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

export interface ViewAsTarget {
  id: string;
  username: string;
  /** Where "exit" goes back to (the user's admin card). */
  returnTo: string;
}

const KEY = 'vs.viewAs';

/**
 * Admin "view as": while a target is set, GET requests carry X-View-As and the
 * backend answers as that user; every change is refused server-side. Kept per tab (sessionStorage).
 */
@Injectable({ providedIn: 'root' })
export class ViewAsService {
  readonly target = signal<ViewAsTarget | null>(read());
  readonly active = computed(() => this.target() !== null);

  set(target: ViewAsTarget): void {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(target));
    } catch {
      // private mode: the switch still works for this page view
    }
    this.target.set(target);
  }

  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    this.target.set(null);
  }
}

/** Adds the header to reads; the admin API and every write go out as the admin. */
export const viewAsInterceptor: HttpInterceptorFn = (req, next) => {
  const target = inject(ViewAsService).target();
  if (
    !target ||
    req.method !== 'GET' ||
    !req.url.startsWith('/api/') ||
    req.url.startsWith('/api/admin/')
  )
    return next(req);
  return next(req.clone({ setHeaders: { 'X-View-As': target.id } }));
};

function read(): ViewAsTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<ViewAsTarget>) : null;
    return v?.id && v.username && v.returnTo ? (v as ViewAsTarget) : null;
  } catch {
    return null;
  }
}

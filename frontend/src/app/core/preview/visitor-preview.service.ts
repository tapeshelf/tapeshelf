import { type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { AuthStore } from '../auth/auth.store';
import { PANEL_OUTLET } from '../navigation/panels';
import { VIDEO_CODE } from '../navigation/user-links';

const KEY = 'vs.visitorPreview';
/** Before the first navigation, or a tab opened straight at a video: taken for the owner's. */
const UNKNOWN = '*';

/** Reads of these go out as a guest's while the preview is on; the session itself is untouched. */
const AS_GUEST_PATHS = ['/api/users/', '/api/videos/', '/api/v/', '/api/streaming/'];

/**
 * "View as visitor": the owner sees their page and
 * videos exactly as a guest does. Every read of a page, a shelf or a video carries `X-As-Guest`,
 * which makes the API answer as to a guest; sensitive videos are blurred as for a fresh guest, and
 * an agreement given while previewing lasts only as long as the preview. The mode is kept per tab,
 * so a reload stays in it, until the owner switches back — but it is in force only on the owner's
 * own page and the videos opened from it: anywhere else (another shelf, settings, the admin area,
 * a panel over the page) the app is the owner's as usual and says nothing of it. Signing out ends it.
 */
@Injectable({ providedIn: 'root' })
export class VisitorPreview {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  /** The mode as the owner switched it. */
  private readonly on = signal(read());
  /** Whose page the owner is on (lower case), kept while they open videos from it; null elsewhere. */
  private readonly page = signal<string | null>(UNKNOWN);
  /** A side panel (settings, messages…) is open over the page: its contents are the owner's. */
  private readonly panelOpen = signal(false);
  private readonly onOwnGround = computed(() => {
    const page = this.page();
    return page === UNKNOWN || (!!page && page === this.auth.user()?.username?.toLowerCase());
  });
  /** In force here: the page and its videos answer as to a guest. */
  readonly active = computed(() => this.on() && this.onOwnGround());
  /** The reminder above the header: in force, and no panel (settings, messages…) over the page. */
  readonly shown = computed(() => this.active() && !this.panelOpen());
  /** The fresh guest's agreement to sensitive content, this preview only. */
  readonly consent = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.locate(e.urlAfterRedirects));
    if (this.router.navigated) this.locate(this.router.url);
    effect(() => {
      if (this.auth.status() === 'anonymous' && untracked(this.on)) this.stop();
    });
  }

  start(): void {
    this.consent.set(false);
    this.on.set(true);
    write(true);
  }

  stop(): void {
    this.on.set(false);
    this.consent.set(false);
    write(false);
  }

  /** Where the owner is now: a page (theirs or not), a video opened from it, or elsewhere. */
  private locate(url: string): void {
    const tree = this.router.parseUrl(url);
    const segments = tree.root.children['primary']?.segments.map((s) => s.path) ?? [];
    this.panelOpen.set(!!tree.root.children[PANEL_OUTLET]);
    const [first = '', second] = segments;
    const handle = segments.length === 1 ? /^@(\w+)$/.exec(first)?.[1] : undefined;
    // A video at its short code, or an old video link (/v/<id>, /@name/v/<id>) on its way there.
    const video =
      (segments.length === 1 && VIDEO_CODE.test(first)) ||
      (segments.length === 2 && first === 'v') ||
      (segments.length === 3 && second === 'v');
    if (handle) this.page.set(handle.toLowerCase());
    else if (!video) this.page.set(null);
  }
}

export const asGuestInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    req.method !== 'GET' ||
    !inject(VisitorPreview).active() ||
    !AS_GUEST_PATHS.some((p) => req.url.startsWith(p))
  )
    return next(req);
  return next(req.clone({ setHeaders: { 'X-As-Guest': '1' } }));
};

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode etc. */
  }
}

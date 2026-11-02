import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'vs.theme';
/**
 * The device's theme until the person picks one in the header or in settings (light
 * was the default before). public/theme.js applies the same choice before the first paint.
 */
const DEFAULT_THEME: ThemePreference = 'system';

/** Applies the theme to <html data-theme> and keeps the user's choice in localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemIsDark = signal(this.media?.matches ?? false);

  readonly preference = signal<ThemePreference>(this.readStored());
  readonly resolved = computed<ResolvedTheme>(() => {
    const pref = this.preference();
    if (pref === 'system') return this.systemIsDark() ? 'dark' : 'light';
    return pref;
  });

  constructor() {
    this.media?.addEventListener('change', (e) => this.systemIsDark.set(e.matches));
    effect(() => {
      this.document.documentElement.setAttribute('data-theme', this.resolved());
    });
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* storage unavailable (private mode) — keep in-memory only */
    }
  }

  /**
   * The user's own switch: the whole page changes at once, the new theme spreading in a
   * circle from `origin` (the switch) over half a second. Where the browser has no view transitions,
   * or motion is reduced, it changes at once — every element together, none fading on its own.
   */
  toggle(origin?: { x: number; y: number }): void {
    const next: ThemePreference = this.resolved() === 'dark' ? 'light' : 'dark';
    const root = this.document.documentElement;
    const view = this.document.defaultView;
    const reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Elements with colour transitions of their own would otherwise fade one by one.
    root.classList.add('theme-switching');
    const apply = () => {
      this.set(next);
      root.setAttribute('data-theme', next);
    };
    const settle = () => root.classList.remove('theme-switching', 'vt-theme');
    if (reduced || typeof this.document.startViewTransition !== 'function' || !view) {
      apply();
      view?.requestAnimationFrame(() => view.requestAnimationFrame(settle));
      return;
    }
    // One picture of the page, not its named parts (header, panels) moving on their own.
    root.classList.add('vt-theme');
    const transition = this.document.startViewTransition(apply);
    void transition.ready
      .then(() => {
        const x = origin?.x ?? view.innerWidth / 2;
        const y = origin?.y ?? 0;
        const radius = Math.hypot(
          Math.max(x, view.innerWidth - x),
          Math.max(y, view.innerHeight - y),
        );
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 520,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => undefined);
    void transition.finished.finally(settle);
  }

  private readStored(): ThemePreference {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'dark' || v === 'light' || v === 'system') return v;
    } catch {
      /* ignore */
    }
    return DEFAULT_THEME;
  }
}

import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, firstValueFrom, map, of, switchMap } from 'rxjs';

import { loadDateLocale } from './date-locales';

/**
 * The languages of the app: English first (the default and the fallback), then by how
 * many people read them. Left-to-right only for now; `pt` is Brazilian, `zh` Simplified Chinese.
 */
export const AVAILABLE_LANGS = [
  'en',
  'ru',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'pl',
  'uk',
  'tr',
  'nl',
  'cs',
  'sv',
  'ja',
  'ko',
  'zh',
  'id',
  'vi',
  'th',
  'hi',
] as const;
export type Lang = (typeof AVAILABLE_LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

/** Each language named in itself, for the pickers (the same in every language). */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português (Brasil)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pl: 'Polski',
  uk: 'Українська',
  tr: 'Türkçe',
  nl: 'Nederlands',
  cs: 'Čeština',
  sv: 'Svenska',
  ja: '日本語',
  ko: '한국어',
  zh: '简体中文',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  hi: 'हिन्दी',
};

/** The reader's language in this browser, shared by the app and the site on one origin. */
const STORAGE_KEY = 'vs.lang';
/**
 * Set while a pick made in this browser has not reached the account yet: the site cannot always
 * save it (an expired session), so the app does on its next sign-in instead of taking the
 * account's older one.
 */
const PICKED_KEY = 'vs.lang.picked';

/** Resolves the UI language (stored choice → browser → default) and keeps <html lang> in sync. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly current = signal<Lang>(this.detect());
  /** The locale id dates are written with: the language's own once its date words are in. */
  readonly dateLocale = signal('en-US');
  /**
   * The language whose dictionary is in. A computed() that builds texts with translate() reads it,
   * so a switch redraws them once the new words have arrived — not before, when translate() still
   * has only the keys, and not never.
   */
  readonly loaded = toSignal(
    this.transloco.langChanges$.pipe(
      switchMap((lang) =>
        this.transloco.load(lang).pipe(
          map(() => lang),
          catchError(() => of(lang)),
        ),
      ),
    ),
    { initialValue: this.transloco.getActiveLang() },
  );

  constructor() {
    this.follow();
  }

  /**
   * Applies the language and resolves once its dictionary is in. Texts built with translate() in
   * code (not the pipe) are taken once, so the app starts only when they can be read; offline, it
   * starts anyway and the pipes fill in later.
   */
  init(): Promise<void> {
    const lang = this.current();
    this.apply(lang);
    return Promise.all([
      firstValueFrom(this.transloco.load(lang)).catch(() => undefined),
      this.dates(lang),
    ]).then(() => undefined);
  }

  /**
   * Switches the language and remembers it in this browser. `picked` — the reader chose it here,
   * so it waits to be saved to the account; false when it comes from the account itself.
   */
  set(lang: Lang, picked = true): void {
    this.current.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      if (picked) localStorage.setItem(PICKED_KEY, '1');
      else localStorage.removeItem(PICKED_KEY);
    } catch {
      /* ignore */
    }
    this.apply(lang);
  }

  /**
   * Speaks a language for this visit only, remembering nothing: a page the phone app shows in its
   * own language leaves the browser's next visit as it was.
   */
  show(lang: Lang): void {
    this.current.set(lang);
    this.apply(lang);
  }

  /** A pick made in this browser (here or on the site) that the account does not have yet. */
  pickedUnsaved(): boolean {
    try {
      return localStorage.getItem(PICKED_KEY) !== null;
    } catch {
      return false;
    }
  }

  /** The account has the language now. */
  saved(): void {
    try {
      localStorage.removeItem(PICKED_KEY);
    } catch {
      /* ignore */
    }
  }

  /** A language picked in another tab — of the app or the site — is taken here at once. */
  private follow(): void {
    this.document.defaultView?.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !isLang(e.newValue) || e.newValue === this.current()) return;
      this.current.set(e.newValue);
      this.apply(e.newValue);
    });
  }

  private apply(lang: Lang): void {
    // <html lang> first: plural forms are chosen by it while the texts are drawn.
    this.document.documentElement.lang = lang;
    this.transloco.setActiveLang(lang);
    void this.dates(lang);
  }

  private async dates(lang: Lang): Promise<void> {
    const id = await loadDateLocale(lang);
    if (this.current() === lang) this.dateLocale.set(id);
  }

  private detect(): Lang {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLang(stored)) return stored;
    } catch {
      /* ignore */
    }
    return browserLang(this.document.defaultView?.navigator) ?? DEFAULT_LANG;
  }
}

/** The first of the browser's languages the app speaks: "pt-BR" → pt, "zh-TW" → zh. */
export function browserLang(
  nav: Pick<Navigator, 'language' | 'languages'> | undefined,
): Lang | null {
  const wanted = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  for (const tag of wanted) {
    const short = tag.toLowerCase().split('-')[0];
    if (isLang(short)) return short;
  }
  return null;
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (AVAILABLE_LANGS as readonly string[]).includes(v);
}

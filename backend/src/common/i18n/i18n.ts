import i18next, { type i18n as I18n } from 'i18next';

import { SERVER_DICTIONARIES } from '../../i18n/index.js';

/**
 * The languages of the app, as the frontend's AVAILABLE_LANGS: English is the default and
 * the fallback of every text a language's dictionary lacks.
 */
export const SUPPORTED_LOCALES = [
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
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

let instance: I18n | undefined;
let instanceName = 'tapeshelf';

/** The instance name (SITE_NAME) every server text can use as {{site}}; set once at startup. */
export function setSiteName(name: string): void {
  instanceName = name;
}
export function siteName(): string {
  return instanceName;
}

/** Server-side translations (errors, emails, notification texts). Separate from the frontend's Transloco files. */
export function i18n(): I18n {
  if (!instance) {
    instance = i18next.createInstance();
    // Resources are inlined and initAsync=false, so init() completes synchronously.
    void instance.init({
      lng: DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      resources: Object.fromEntries(
        Object.entries(SERVER_DICTIONARIES).map(([lng, translation]) => [
          lng,
          { translation },
        ]),
      ),
      interpolation: { escapeValue: false },
      initAsync: false,
    });
  }
  return instance;
}

export function t(
  locale: string | undefined,
  key: string,
  vars?: Record<string, unknown>,
): string {
  return i18n().t(key, {
    lng: toSupportedLocale(locale),
    site: instanceName,
    ...vars,
  });
}

export function toSupportedLocale(
  value: string | undefined | null,
): SupportedLocale {
  const short = value?.trim().toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES as readonly string[]).includes(short ?? '')
    ? (short as SupportedLocale)
    : DEFAULT_LOCALE;
}

/** Picks a locale from an Accept-Language header (e.g. "ru-RU,ru;q=0.9,en;q=0.8"). */
export function localeFromAcceptLanguage(
  header: string | undefined,
): SupportedLocale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2);
    if (tag && (SUPPORTED_LOCALES as readonly string[]).includes(tag))
      return tag as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

/**
 * The locale dates are written in for a language: British English for English (day before month,
 * as before), the language itself otherwise — Intl knows them all.
 */
export function dateLocale(locale: string | undefined | null): string {
  const lang = toSupportedLocale(locale);
  return lang === 'en' ? 'en-GB' : lang;
}

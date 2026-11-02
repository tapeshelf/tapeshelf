import { registerLocaleData } from '@angular/common';

import type { Lang } from './language.service';

interface LocaleModule {
  default: unknown;
}

/**
 * Angular's date words of each language, fetched the first time that language is used:
 * nineteen locales in the first bundle would cost every visitor for the one they read.
 */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<LocaleModule>> = {
  ru: () => import('@angular/common/locales/ru'),
  es: () => import('@angular/common/locales/es'),
  pt: () => import('@angular/common/locales/pt'),
  fr: () => import('@angular/common/locales/fr'),
  de: () => import('@angular/common/locales/de'),
  it: () => import('@angular/common/locales/it'),
  pl: () => import('@angular/common/locales/pl'),
  uk: () => import('@angular/common/locales/uk'),
  tr: () => import('@angular/common/locales/tr'),
  nl: () => import('@angular/common/locales/nl'),
  cs: () => import('@angular/common/locales/cs'),
  sv: () => import('@angular/common/locales/sv'),
  ja: () => import('@angular/common/locales/ja'),
  ko: () => import('@angular/common/locales/ko'),
  zh: () => import('@angular/common/locales/zh'),
  id: () => import('@angular/common/locales/id'),
  vi: () => import('@angular/common/locales/vi'),
  th: () => import('@angular/common/locales/th'),
  hi: () => import('@angular/common/locales/hi'),
};

const registered = new Set<string>();

/** The locale id dates of `lang` are formatted with, once its data is in ('en-US' meanwhile). */
export async function loadDateLocale(lang: Lang): Promise<string> {
  if (lang === 'en') return 'en-US';
  if (!registered.has(lang)) {
    try {
      registerLocaleData((await LOADERS[lang]()).default, lang);
    } catch {
      return 'en-US'; // offline: English dates rather than none
    }
    registered.add(lang);
  }
  return lang;
}

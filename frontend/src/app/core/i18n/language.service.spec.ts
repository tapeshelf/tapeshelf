import { DOCUMENT, Injectable, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Translation,
  type TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { Subject } from 'rxjs';

import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { LanguageService, browserLang } from './language.service';

describe('LanguageService', () => {
  const lang = document.documentElement.lang;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [provideTranslocoTesting()] });
  });
  // A stored "ru" outlived this file and switched the next one, run in the same worker, to Russian.
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = lang;
  });

  it('falls back to English when nothing is stored and the browser language is unsupported', () => {
    const service = TestBed.inject(LanguageService);
    service.init();
    expect(service.current()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
  });

  it('speaks a language for one visit without remembering it', () => {
    const service = TestBed.inject(LanguageService);
    service.show('ru');
    expect(service.current()).toBe('ru');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('ru');
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('ru');
    expect(localStorage.getItem('vs.lang')).toBeNull();
    expect(service.pickedUnsaved()).toBe(false);
  });

  it('switches language, persists it and updates <html lang>', () => {
    const service = TestBed.inject(LanguageService);
    service.set('ru');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('ru');
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('ru');
    expect(localStorage.getItem('vs.lang')).toBe('ru');
  });

  it('marks a pick as not yet in the account until it is saved; the account’s own is not a pick', () => {
    const service = TestBed.inject(LanguageService);
    service.set('de');
    expect(service.pickedUnsaved()).toBe(true);
    service.saved();
    expect(service.pickedUnsaved()).toBe(false);
    service.set('ru', false);
    expect(service.pickedUnsaved()).toBe(false);
    expect(localStorage.getItem('vs.lang')).toBe('ru');
  });

  it('follows a language picked in another tab of the app or the site', () => {
    const service = TestBed.inject(LanguageService);
    window.dispatchEvent(new StorageEvent('storage', { key: 'vs.lang', newValue: 'ja' }));
    expect(service.current()).toBe('ja');
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('ja');
    window.dispatchEvent(new StorageEvent('storage', { key: 'vs.lang', newValue: 'xx' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'ru' }));
    expect(service.current()).toBe('ja');
  });

  it('restores a stored language', () => {
    localStorage.setItem('vs.lang', 'ru');
    expect(TestBed.inject(LanguageService).current()).toBe('ru');
  });

  it('init resolves only once the dictionary is in, so translate() in code reads texts', async () => {
    const dictionary = new Subject<Translation>();
    @Injectable()
    class SlowLoader implements TranslocoLoader {
      getTranslation() {
        return dictionary;
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { availableLangs: ['en', 'ru'], defaultLang: 'en' },
          loader: SlowLoader,
        }),
      ],
    });
    const service = TestBed.inject(LanguageService);
    const transloco = TestBed.inject(TranslocoService);
    let ready = false;
    const init = service.init().then(() => (ready = true));
    await Promise.resolve();
    expect(ready).toBe(false);
    expect(transloco.translate('pro.title')).toBe('pro.title');

    dictionary.next({ pro: { title: 'Pro' } });
    dictionary.complete();
    await init;
    expect(transloco.translate('pro.title')).toBe('Pro');
  });

  it('a computed text follows a switch once the new dictionary is in', async () => {
    const dictionaries: Record<string, Subject<Translation>> = {
      en: new Subject<Translation>(),
      ru: new Subject<Translation>(),
    };
    @Injectable()
    class SlowLoader implements TranslocoLoader {
      getTranslation(lang: string) {
        return dictionaries[lang]!;
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: { availableLangs: ['en', 'ru'], defaultLang: 'en' },
          loader: SlowLoader,
        }),
      ],
    });
    const service = TestBed.inject(LanguageService);
    const transloco = TestBed.inject(TranslocoService);
    const title = computed(() => {
      service.loaded();
      return transloco.translate('pro.title');
    });
    const init = service.init();
    dictionaries['en']!.next({ pro: { title: 'Pro' } });
    dictionaries['en']!.complete();
    await init;
    expect(title()).toBe('Pro');

    service.set('ru');
    expect(title()).toBe('Pro'); // the old words until the new ones arrive, not the bare key
    dictionaries['ru']!.next({ pro: { title: 'Про' } });
    dictionaries['ru']!.complete();
    expect(service.loaded()).toBe('ru');
    expect(title()).toBe('Про');
  });
});

describe('browserLang', () => {
  it('takes the first of the browser’s languages the app speaks', () => {
    expect(browserLang({ language: 'pt-BR', languages: ['pt-BR', 'en'] })).toBe('pt');
    expect(browserLang({ language: 'zh-TW', languages: ['zh-TW'] })).toBe('zh');
    expect(browserLang({ language: 'ar', languages: ['ar', 'fr-CA', 'en'] })).toBe('fr');
    expect(browserLang({ language: 'ar', languages: ['ar'] })).toBeNull();
    expect(browserLang(undefined)).toBeNull();
  });
});

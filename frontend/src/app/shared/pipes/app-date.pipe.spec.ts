import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { loadDateLocale } from '../../core/i18n/date-locales';
import { LanguageService } from '../../core/i18n/language.service';
import { AppDatePipe } from './app-date.pipe';

describe('AppDatePipe', () => {
  const dateLocale = signal('en-US');

  beforeEach(() => {
    dateLocale.set('en-US');
    TestBed.configureTestingModule({
      providers: [AppDatePipe, { provide: LanguageService, useValue: { dateLocale } }],
    });
  });

  it('formats in the language of the page and follows a switch', async () => {
    const pipe = TestBed.inject(AppDatePipe);
    const at = new Date(2026, 9, 16, 15, 5);
    expect(pipe.transform(at, 'mediumDate')).toBe('Oct 16, 2026');
    expect(pipe.transform(at, 'shortTime')).toMatch(/3:05\s?PM/);
    // A language's date words come in on its first use.
    dateLocale.set(await loadDateLocale('ru'));
    expect(pipe.transform(at, 'mediumDate')).toBe('16 окт. 2026 г.'); // a narrow no-break space, as the locale writes it
    expect(pipe.transform(at, 'shortTime')).toBe('15:05');
    dateLocale.set(await loadDateLocale('de'));
    expect(pipe.transform(at, 'mediumDate')).toBe('16.10.2026');
    expect(pipe.transform(null)).toBeNull();
  });
});

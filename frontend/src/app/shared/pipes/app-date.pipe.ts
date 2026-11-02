import { formatDate } from '@angular/common';
import { Pipe, type PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../../core/i18n/language.service';

type DateInput = string | number | Date | null | undefined;

/**
 * Dates in the language of the page. Angular's DatePipe follows LOCALE_ID, fixed at
 * start ('en-US'): a Russian page showed "Oct 16, 2026, 3:05 PM". The formats are DatePipe's
 * ('short', 'mediumDate', 'HH:mm'…). Impure, to follow a switch of the language; it keeps its last
 * answer, so redrawing costs a comparison.
 */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  private last: { value: DateInput; format: string; lang: string; out: string | null } | null =
    null;

  transform(value: DateInput, format = 'mediumDate'): string | null {
    // The language's own words once its date data is in (fetched on first use).
    const lang = this.lang.dateLocale();
    const l = this.last;
    if (l && l.value === value && l.format === format && l.lang === lang) return l.out;
    const out =
      value === null || value === undefined || value === ''
        ? null
        : formatDate(value, format, lang);
    this.last = { value, format, lang, out };
    return out;
  }
}

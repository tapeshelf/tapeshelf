import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Translation, type TranslocoLoader } from '@jsverse/transloco';

/** The scope of the admin panel's texts, served by the API to admins only. */
export const ADMIN_SCOPE = 'admin';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    const [scope, scopedLang] = lang.split('/');
    if (scopedLang && scope === ADMIN_SCOPE)
      return this.http.get<Translation>(`/api/admin/i18n/${scopedLang}`);
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

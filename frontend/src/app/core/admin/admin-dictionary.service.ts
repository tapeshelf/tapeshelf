import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from '../auth/auth.store';
import { LanguageService } from '../i18n/language.service';
import { ADMIN_SCOPE } from '../i18n/transloco-loader';
import { ViewAsService } from './view-as.service';

/**
 * The admin panel's texts live outside the public dictionaries: the API gives them
 * to admins only. Loaded for an admin (also while they view the site as someone else) before the
 * first screen and again for each language; once in, they read as `admin.*` like any other text.
 */
@Injectable({ providedIn: 'root' })
export class AdminDictionary {
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthStore);
  private readonly viewAs = inject(ViewAsService);
  private readonly language = inject(LanguageService);
  private readonly loaded = new Set<string>();
  /** An admin, or an admin looking at the site as someone else (the API then answers as them). */
  private readonly wanted = computed(
    () => this.auth.user()?.role === 'ADMIN' || this.viewAs.active(),
  );

  constructor() {
    effect(() => {
      const lang = this.language.current();
      if (this.wanted()) untracked(() => void this.ensure(lang));
    });
  }

  /** At startup, once the session is known: the texts before the first screen. */
  init(): Promise<void> {
    return this.wanted() ? this.ensure() : Promise.resolve();
  }

  /** Resolves once the texts of `lang` are in (or could not be had: the keys show instead). */
  async ensure(lang: string = this.transloco.getActiveLang()): Promise<void> {
    if (this.loaded.has(lang)) return;
    try {
      await firstValueFrom(this.transloco.load(`${ADMIN_SCOPE}/${lang}`));
    } catch {
      return; // not an admin after all, or offline: a later call tries again
    }
    if (this.loaded.has(lang)) return;
    this.loaded.add(lang);
    // Texts already drawn without them redraw: the pipes listen to the active language.
    this.transloco.setActiveLang(this.transloco.getActiveLang());
  }
}

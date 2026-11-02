import { Injectable, effect, inject, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { usersUpdateProfile } from '../../api/fn/users/users-update-profile';
import type { Locale } from '../../api/models/locale';
import type { Theme } from '../../api/models/theme';
import { ViewAsService } from '../admin/view-as.service';
import { type Lang, LanguageService } from '../i18n/language.service';
import { type ThemePreference, ThemeService } from '../theme/theme.service';
import { AuthStore } from './auth.store';

const THEME_TO_PREF: Record<Theme, ThemePreference> = {
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system',
};
const PREF_TO_THEME: Record<ThemePreference, Theme> = {
  dark: 'DARK',
  light: 'LIGHT',
  system: 'SYSTEM',
};

/**
 * Keeps UI language/theme and the account's saved preferences in step:
 * sign-in applies the profile values; changing them while signed in saves to the profile.
 * A language picked in this browser that the account has not got yet — on the site, or here while
 * signed out — wins over the account's and is saved to it.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesSyncService {
  private readonly auth = inject(AuthStore);
  private readonly language = inject(LanguageService);
  private readonly theme = inject(ThemeService);
  private readonly api = inject(Api);
  private readonly viewAs = inject(ViewAsService);

  constructor() {
    // Profile → UI (runs when the user changes, e.g. after login).
    effect(() => {
      const user = this.auth.user();
      if (!user || untracked(() => this.viewAs.active())) return;
      untracked(() => {
        const lang = this.language.current();
        if (this.language.pickedUnsaved()) {
          if (user.locale === lang) this.language.saved();
          else this.save({ locale: lang });
        } else if (lang !== user.locale) this.language.set(user.locale as Lang, false);
        const pref = THEME_TO_PREF[user.theme];
        if (this.theme.preference() !== pref) this.theme.set(pref);
      });
    });
    // UI → profile (runs when language/theme change while signed in).
    effect(() => {
      const lang = this.language.current();
      const pref = this.theme.preference();
      const user = untracked(() => this.auth.user());
      if (!user || untracked(() => this.viewAs.active())) return;
      const body: { locale?: Locale; theme?: Theme } = {};
      if (user.locale !== lang) body.locale = lang;
      if (user.theme !== PREF_TO_THEME[pref]) body.theme = PREF_TO_THEME[pref];
      if (Object.keys(body).length === 0) {
        untracked(() => this.language.saved());
        return;
      }
      untracked(() => this.save(body));
    });
  }

  private save(body: { locale?: Locale; theme?: Theme }): void {
    void this.api
      .invoke(usersUpdateProfile, { body })
      .then((me) => {
        this.auth.setUser(me);
        if (me.locale === this.language.current()) this.language.saved();
      })
      .catch(() => undefined);
  }
}

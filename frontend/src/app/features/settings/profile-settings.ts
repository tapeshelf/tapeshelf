import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, usersUpdateProfile } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { AVAILABLE_LANGS, LANGUAGE_NAMES } from '../../core/i18n/language.service';
import { BIO_MAX, DISPLAY_NAME_MAX, EXCHANGE_PREFS_MAX } from '../../shared/forms/limits';
import { fieldError, notBlank } from '../../shared/forms/validation';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from './settings-section';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

@Component({
  selector: 'app-profile-settings',
  imports: [
    SelectComponent,
    OptionComponent,
    SettingsSectionComponent,
    ReactiveFormsModule,
    TranslocoPipe,
    FieldComponent,
    InputDirective,
    ButtonDirective,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <app-settings-section
        [title]="'settings.profile.public' | transloco"
        [description]="'settings.profile.publicHint' | transloco"
      >
        <div class="flex flex-col gap-4">
          <app-field [label]="'auth.displayName' | transloco" [error]="err('displayName')">
            <input
              appInput
              type="text"
              formControlName="displayName"
              [maxlength]="limits.name"
              [attr.aria-invalid]="!!err('displayName')"
            />
          </app-field>
          <app-field
            optional
            [label]="'settings.profile.bio' | transloco"
            [hint]="'settings.profile.bioHint' | transloco"
            [error]="err('bio')"
          >
            <textarea appInput rows="4" formControlName="bio" [maxlength]="limits.bio"></textarea>
          </app-field>
        </div>
      </app-settings-section>
      <!-- What one looks for in exchanges: shown in every exchange; on the shelf if asked. -->
      <app-settings-section
        [title]="'settings.profile.exchange' | transloco"
        [description]="'settings.profile.exchangeHint' | transloco"
      >
        <div class="flex flex-col gap-4">
          <app-field
            optional
            [label]="'deals.prefs.wants' | transloco"
            [error]="err('exchangeWants')"
          >
            <textarea
              appInput
              rows="3"
              formControlName="exchangeWants"
              [maxlength]="limits.prefs"
              data-testid="prefs-wants"
            ></textarea>
          </app-field>
          <app-field
            optional
            [label]="'deals.prefs.avoid' | transloco"
            [error]="err('exchangeAvoid')"
          >
            <textarea
              appInput
              rows="3"
              formControlName="exchangeAvoid"
              [maxlength]="limits.prefs"
              data-testid="prefs-avoid"
            ></textarea>
          </app-field>
          <label class="flex max-w-xl items-start gap-2 text-sm">
            <input type="checkbox" formControlName="showExchangePrefs" class="mt-0.5" />
            <span>{{ 'settings.profile.showExchangePrefs' | transloco }}</span>
          </label>
          <label class="flex max-w-xl items-start gap-2 text-sm">
            <input
              type="checkbox"
              formControlName="acceptGuestExchanges"
              class="mt-0.5"
              data-testid="accept-guests"
            />
            <span>
              {{ 'settings.profile.acceptGuests' | transloco }}
              <span class="block text-xs text-muted">{{
                'settings.profile.acceptGuestsHint' | transloco
              }}</span>
            </span>
          </label>
        </div>
      </app-settings-section>
      <app-settings-section
        [title]="'settings.profile.interface' | transloco"
        [description]="'settings.profile.interfaceHint' | transloco"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <app-field [label]="'settings.profile.language' | transloco">
            <app-select formControlName="locale">
              @for (lang of langs; track lang) {
                <app-option [value]="lang" [attr.lang]="lang">{{ langNames[lang] }}</app-option>
              }
            </app-select>
          </app-field>
          <app-field [label]="'settings.profile.theme' | transloco">
            <app-select formControlName="theme">
              @for (theme of themes; track theme) {
                <app-option [value]="theme">
                  {{ 'settings.profile.themes.' + theme | transloco }}
                </app-option>
              }
            </app-select>
          </app-field>
        </div>
        <label class="mt-5 flex max-w-xl items-start gap-2 text-sm">
          <input type="checkbox" formControlName="showSensitive" class="mt-0.5" />
          <span>
            {{ 'settings.profile.showSensitive' | transloco }}
            <span class="block text-xs text-muted">{{
              'settings.profile.showSensitiveHint' | transloco
            }}</span>
          </span>
        </label>
        <button appButton type="submit" class="mt-6" [disabled]="busy()">
          {{ (busy() ? 'common.saving' : 'common.save') | transloco }}
        </button>
      </app-settings-section>
    </form>
  `,
})
export class ProfileSettingsPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly themes = ['DARK', 'LIGHT', 'SYSTEM'] as const;
  /** Every language the app speaks, each named in itself. */
  protected readonly langs = AVAILABLE_LANGS;
  protected readonly langNames = LANGUAGE_NAMES;
  /** Short on purpose: the page's head stays a head. */
  protected readonly limits = {
    name: DISPLAY_NAME_MAX,
    bio: BIO_MAX,
    prefs: EXCHANGE_PREFS_MAX,
  } as const;
  protected readonly busy = signal(false);
  protected readonly form = this.fb.group({
    displayName: [
      this.auth.user()?.displayName ?? '',
      [notBlank, Validators.maxLength(DISPLAY_NAME_MAX)],
    ],
    bio: [this.auth.user()?.bio ?? '', [Validators.maxLength(BIO_MAX)]],
    locale: [this.auth.user()?.locale ?? 'en'],
    theme: [this.auth.user()?.theme ?? 'LIGHT'],
    showSensitive: [this.auth.user()?.showSensitive ?? false],
    exchangeWants: [
      this.auth.user()?.exchangeWants ?? '',
      [Validators.maxLength(EXCHANGE_PREFS_MAX)],
    ],
    exchangeAvoid: [
      this.auth.user()?.exchangeAvoid ?? '',
      [Validators.maxLength(EXCHANGE_PREFS_MAX)],
    ],
    showExchangePrefs: [this.auth.user()?.showExchangePrefs ?? false],
    acceptGuestExchanges: [this.auth.user()?.acceptGuestExchanges ?? true],
  });

  protected err(name: 'displayName' | 'bio' | 'exchangeWants' | 'exchangeAvoid'): string | null {
    const e = fieldError(this.form.get(name));
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      const me = await this.api.invoke(usersUpdateProfile, { body: this.form.getRawValue() });
      this.auth.setUser(me);
      this.toast.success(this.t.translate('common.saved'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

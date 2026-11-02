import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, accountsDeleteAccount, authResendVerification, usersChangeUsername } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { USERNAME_PATTERN, fieldError } from '../../shared/forms/validation';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { PromptService } from '../../shared/ui/prompt/prompt-dialog';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from './settings-section';

@Component({
  selector: 'app-account-settings',
  imports: [
    SettingsSectionComponent,
    ReactiveFormsModule,
    TranslocoPipe,
    FieldComponent,
    InputDirective,
    ButtonDirective,
    AlertComponent,
  ],
  template: `
    @if (auth.user(); as user) {
      <app-settings-section
        [title]="'settings.account.signIn' | transloco"
        [description]="'settings.account.signInHint' | transloco"
      >
        <dl class="grid gap-3 text-sm">
          <div
            class="flex items-center justify-between gap-4 rounded-lg border-2 border-line bg-surface px-3 py-2"
          >
            <dt class="text-muted">{{ 'settings.account.email' | transloco }}</dt>
            <dd class="flex items-center gap-3">
              <span>{{ user.email }}</span>
              <span
                class="rounded px-1.5 py-0.5 text-xs"
                [class]="
                  user.emailVerified ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger'
                "
              >
                {{
                  (user.emailVerified ? 'settings.account.verified' : 'settings.account.unverified')
                    | transloco
                }}
              </span>
              @if (!user.emailVerified) {
                <button type="button" appButton variant="ghost" size="sm" (click)="resend()">
                  {{ 'auth.verify.bannerAction' | transloco }}
                </button>
              }
            </dd>
          </div>
          <div
            class="flex items-center justify-between gap-4 rounded-lg border-2 border-line bg-surface px-3 py-2"
          >
            <dt class="text-muted">{{ 'settings.account.google' | transloco }}</dt>
            <dd>
              {{
                (user.hasGoogle
                  ? 'settings.account.googleLinked'
                  : 'settings.account.googleNotLinked'
                ) | transloco
              }}
            </dd>
          </div>
        </dl>
      </app-settings-section>
      <app-settings-section
        [title]="'settings.account.username' | transloco"
        [description]="'settings.account.usernameHint' | transloco"
      >
        <form
          [formGroup]="form"
          (ngSubmit)="changeUsername()"
          class="flex max-w-xl flex-col gap-4"
          novalidate
        >
          <app-field [label]="'settings.account.username' | transloco" [error]="err()">
            <input
              appInput
              type="text"
              formControlName="username"
              autocapitalize="off"
              spellcheck="false"
              [attr.aria-invalid]="!!err()"
            />
          </app-field>
          <app-alert kind="warning">{{
            'settings.account.usernameWarning' | transloco: { days: 30 }
          }}</app-alert>
          <div>
            <button appButton variant="secondary" type="submit" [disabled]="busy() || !changed()">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        </form>
      </app-settings-section>

      <app-settings-section [title]="'settings.account.delete.title' | transloco">
        <div class="rounded-xl border-2 border-danger p-5" data-testid="delete-account">
          <p class="text-sm leading-relaxed text-muted">
            {{ 'settings.account.delete.text' | transloco }}
          </p>
          @if (user.plan.subscription) {
            <!-- A live Pro subscription is cancelled with the account. -->
            <p class="mt-2 text-sm leading-relaxed font-semibold" data-testid="delete-subscription">
              {{ 'billing.deleteNote' | transloco }}
            </p>
          }
          <button
            type="button"
            appButton
            variant="danger"
            size="sm"
            class="mt-4"
            [disabled]="busy()"
            (click)="deleteAccount(user.hasPassword, user.username)"
            data-testid="delete-account-button"
          >
            {{ 'settings.account.delete.button' | transloco }}
          </button>
        </div>
      </app-settings-section>
    }
  `,
})
export class AccountSettingsPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly prompt = inject(PromptService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthStore);

  protected readonly busy = signal(false);
  protected readonly form = this.fb.group({
    username: [
      this.auth.user()?.username ?? '',
      [Validators.required, Validators.pattern(USERNAME_PATTERN)],
    ],
  });
  private readonly typed = signal(this.form.controls.username.value);
  protected readonly changed = computed(
    () => this.typed().toLowerCase() !== this.auth.user()?.username,
  );

  constructor() {
    this.form.controls.username.valueChanges.subscribe((v) => this.typed.set(v));
  }

  protected err(): string | null {
    const e = fieldError(this.form.get('username'), { pattern: 'validation.username' });
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async changeUsername(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      const me = await this.api.invoke(usersChangeUsername, { body: this.form.getRawValue() });
      this.auth.setUser(me);
      this.form.controls.username.setValue(me.username);
      this.toast.success(this.t.translate('settings.account.usernameChanged'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Immediate and final, confirmed with the password (or the username). */
  async deleteAccount(hasPassword: boolean, username: string): Promise<void> {
    const answer = await this.prompt.prompt({
      title: this.t.translate('settings.account.delete.confirmTitle'),
      message: this.t.translate('settings.account.delete.confirmText'),
      label: this.t.translate(
        hasPassword ? 'settings.account.delete.password' : 'settings.account.delete.typeUsername',
        { name: username },
      ),
      confirmLabel: this.t.translate('settings.account.delete.confirm'),
      danger: true,
      required: true,
      maxLength: hasPassword ? 128 : 30,
      inputType: hasPassword ? 'password' : 'text',
      ...(hasPassword ? {} : { expect: username }),
    });
    if (answer === null) return;
    this.busy.set(true);
    try {
      await this.api.invoke(accountsDeleteAccount, {
        body: hasPassword ? { password: answer } : { confirm: answer },
      });
      this.auth.markAnonymous();
      this.toast.success(this.t.translate('settings.account.delete.done'));
      await this.router.navigate(['/']);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    try {
      await this.api.invoke(authResendVerification);
      this.toast.success(this.t.translate('auth.verify.bannerSent'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

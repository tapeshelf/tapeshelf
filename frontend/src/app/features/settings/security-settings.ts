import { Component, inject, resource, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  appTokensList,
  appTokensRevoke,
  authChangePassword,
  authListSessions,
  authLogoutAll,
  authRevokeSession,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { PASSWORD_PATTERN, fieldError } from '../../shared/forms/validation';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { appSessionLabel } from './session-label';
import { SettingsSectionComponent } from './settings-section';
import { TwoFactorSettingsComponent } from './two-factor/two-factor-settings';

@Component({
  selector: 'app-security-settings',
  imports: [
    SettingsSectionComponent,
    TwoFactorSettingsComponent,
    ReactiveFormsModule,
    TranslocoPipe,
    AppDatePipe,
    FieldComponent,
    InputDirective,
    ButtonDirective,
  ],
  template: `
    <app-settings-section
      [title]="
        (auth.user()?.hasPassword
          ? 'settings.security.changePassword'
          : 'settings.security.setPassword'
        ) | transloco
      "
      [description]="
        (auth.user()?.hasPassword
          ? 'settings.security.changePasswordHint'
          : 'settings.security.setPasswordHint'
        ) | transloco
      "
    >
      <form
        [formGroup]="form"
        (ngSubmit)="changePassword()"
        class="flex max-w-xl flex-col gap-4"
        novalidate
      >
        @if (auth.user()?.hasPassword) {
          <app-field [label]="'auth.currentPassword' | transloco" [error]="err('currentPassword')">
            <input
              appInput
              type="password"
              maxlength="128"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
          </app-field>
        }
        <app-field
          [label]="'auth.newPassword' | transloco"
          [hint]="'validation.password' | transloco"
          [error]="err('newPassword')"
        >
          <input
            appInput
            type="password"
            maxlength="128"
            formControlName="newPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="!!err('newPassword')"
          />
        </app-field>
        <div>
          <button appButton type="submit" [disabled]="busy()">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </form>
    </app-settings-section>

    <app-two-factor-settings />

    <app-settings-section
      [title]="'settings.security.sessions' | transloco"
      [description]="'settings.security.sessionsHint' | transloco"
    >
      <ul class="flex flex-col gap-2">
        @for (s of sessions.value() ?? []; track s.id) {
          <li
            class="flex items-center justify-between gap-4 rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm"
          >
            <div class="min-w-0">
              <p class="truncate">
                {{
                  s.client
                    ? appLabel(s.client)
                    : s.userAgent || ('settings.security.unknownDevice' | transloco)
                }}
                @if (s.current) {
                  <span
                    class="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-text"
                    >{{ 'common.current' | transloco }}</span
                  >
                }
              </p>
              <p class="text-xs text-muted">
                {{ s.ip }} · {{ 'settings.security.lastUsed' | transloco }}
                {{ s.lastUsedAt | appDate: 'medium' }}
              </p>
            </div>
            @if (!s.current) {
              <button type="button" appButton variant="ghost" size="sm" (click)="revoke(s.id)">
                {{ 'settings.security.revoke' | transloco }}
              </button>
            }
          </li>
        }
      </ul>
      <button type="button" appButton variant="danger" class="mt-4" (click)="logoutAll()">
        {{ 'settings.security.logoutAll' | transloco }}
      </button>
    </app-settings-section>

    <!-- Connected apps: the browser extension, once connected; disconnecting stops it at once. -->
    @if (apps.value()?.length) {
      <app-settings-section
        [title]="'settings.security.apps' | transloco"
        [description]="'settings.security.appsHint' | transloco"
      >
        <ul class="flex flex-col gap-2" data-testid="connected-apps">
          @for (a of apps.value() ?? []; track a.id) {
            <li
              class="flex items-center justify-between gap-4 rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm"
              data-testid="connected-app"
            >
              <div class="min-w-0">
                <p class="truncate">
                  {{ 'settings.security.appName' | transloco: { name: a.name } }}
                </p>
                <p class="text-xs text-muted">
                  {{ 'settings.security.appConnected' | transloco }}
                  {{ a.createdAt | appDate: 'mediumDate' }}
                  @if (a.lastUsedAt) {
                    · {{ 'settings.security.lastUsed' | transloco }}
                    {{ a.lastUsedAt | appDate: 'medium' }}
                  }
                </p>
              </div>
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                (click)="disconnect(a.id)"
                data-testid="connected-app-revoke"
              >
                {{ 'settings.security.appRevoke' | transloco }}
              </button>
            </li>
          }
        </ul>
      </app-settings-section>
    }
  `,
})
export class SecuritySettingsPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);

  protected readonly busy = signal(false);
  protected readonly form = this.fb.group({
    currentPassword: [''],
    newPassword: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });
  protected readonly sessions = resource({ loader: () => this.api.invoke(authListSessions) });
  protected readonly apps = resource({ loader: () => this.api.invoke(appTokensList) });
  protected readonly appLabel = appSessionLabel;

  protected err(name: 'currentPassword' | 'newPassword'): string | null {
    const e = fieldError(
      this.form.get(name),
      name === 'newPassword' ? { pattern: 'validation.password' } : {},
    );
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async changePassword(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    try {
      await this.api.invoke(authChangePassword, {
        body: { currentPassword: currentPassword || undefined, newPassword },
      });
      const user = this.auth.user();
      if (user) this.auth.setUser({ ...user, hasPassword: true });
      this.form.reset();
      this.toast.success(this.t.translate('settings.security.passwordChanged'));
      this.sessions.reload();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    try {
      await this.api.invoke(authRevokeSession, { id });
      this.toast.success(this.t.translate('settings.security.revoked'));
      this.sessions.reload();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  async disconnect(id: string): Promise<void> {
    try {
      await this.api.invoke(appTokensRevoke, { id });
      this.toast.success(this.t.translate('settings.security.appRevoked'));
      this.apps.reload();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await this.api.invoke(authLogoutAll);
    } finally {
      this.auth.markAnonymous();
      await this.router.navigate(['/login']);
    }
  }
}

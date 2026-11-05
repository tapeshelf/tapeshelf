import { Component, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, authGoogleComplete } from '../../../api';
import { toApiError } from '../../../core/api/api-error';
import { AuthStore } from '../../../core/auth/auth.store';
import { USERNAME_PATTERN, fieldError } from '../../../shared/forms/validation';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { FieldComponent } from '../../../shared/ui/field/field';
import { InputDirective } from '../../../shared/ui/field/input.directive';
import { SiteConfig } from '../../../core/site/site-config';
import { CaptchaComponent } from '../../../shared/ui/captcha/captcha';
import { AuthLayoutComponent } from '../auth-layout';
import { SignupCaptcha } from '../signup-captcha';
import { SensitiveContentService } from '../../../core/content/sensitive.service';
import { profileLink } from '../../../core/navigation/user-links';

@Component({
  selector: 'app-google-complete',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    AuthLayoutComponent,
    FieldComponent,
    InputDirective,
    ButtonDirective,
    AlertComponent,
    CaptchaComponent,
  ],
  template: `
    <app-auth-layout [title]="'auth.googleComplete.title' | transloco">
      <p class="mb-4 text-sm text-muted">{{ 'auth.googleComplete.text' | transloco }}</p>
      @if (signedInAs; as name) {
        <app-alert kind="warning" class="mb-4" data-testid="google-complete-signed-in">{{
          'auth.googleComplete.signedInAs' | transloco: { username: name }
        }}</app-alert>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
        <app-field
          [label]="'auth.username' | transloco"
          [hint]="'auth.usernameHint' | transloco"
          [error]="err('username')"
        >
          <input
            appInput
            type="text"
            formControlName="username"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            [attr.aria-invalid]="!!err('username')"
          />
        </app-field>
        <app-field
          optional
          [label]="'auth.displayName' | transloco"
          [hint]="'auth.displayNameHint' | transloco"
          [error]="err('displayName')"
        >
          <input appInput type="text" formControlName="displayName" autocomplete="nickname" />
        </app-field>
        @if (captcha.needed() && site.captchaSiteKey(); as key) {
          <app-captcha [siteKey]="key" (token)="onCaptcha($event)" (failed)="captchaLoadFailed()" />
        }
        @if (serverError(); as message) {
          <app-alert kind="error">{{ message }}</app-alert>
        }
        <button appButton type="submit" [disabled]="busy()">
          {{ 'auth.googleComplete.submit' | transloco }}
        </button>
      </form>
    </app-auth-layout>
  `,
})
export class GoogleCompletePage {
  private readonly sensitive = inject(SensitiveContentService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);

  protected readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
    displayName: ['', [Validators.maxLength(50)]],
  });
  protected readonly busy = signal(false);
  /** Someone else is still signed in in this browser: the sign-up ends that session. */
  protected readonly signedInAs = this.auth.user()?.username ?? null;
  protected readonly serverError = signal<string | null>(null);
  protected readonly site = inject(SiteConfig);
  protected readonly captcha = new SignupCaptcha();
  private readonly widget = viewChild(CaptchaComponent);

  protected err(name: 'username' | 'displayName'): string | null {
    const e = fieldError(
      this.form.get(name),
      name === 'username' ? { pattern: 'validation.username' } : {},
    );
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    const { username, displayName } = this.form.getRawValue();
    try {
      const me = await this.auth.replacingSession(() =>
        this.api.invoke(authGoogleComplete, {
          body: {
            username,
            displayName: displayName.trim() || undefined,
            showSensitive: this.sensitive.guestConsent() || undefined,
            captchaToken: this.captcha.token ?? undefined,
          },
        }),
      );
      if (me.appRedirect) {
        // The phone app started this sign-up: the account is made, the app signs in with the code
        // in this address, and this browser stays as it was (no session was started here).
        window.location.assign(me.appRedirect);
        return;
      }
      const target = this.router.serializeUrl(this.router.createUrlTree(profileLink(me.username)));
      if (this.signedInAs) {
        // Another account was loaded in this tab: start clean rather than carry its state over.
        window.location.assign(target);
        return;
      }
      this.auth.setUser(me);
      await this.router.navigateByUrl(target);
    } catch (e) {
      const api = toApiError(e);
      this.captcha.failed(api.code, this.widget());
      this.serverError.set(api.message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  /** The widget produced a token: the attempt it was asked for goes ahead. */
  protected onCaptcha(token: string | null): void {
    this.captcha.token = token;
    if (token) void this.submit();
  }

  protected captchaLoadFailed(): void {
    this.serverError.set(this.t.translate('auth.captchaLoadFailed'));
  }
}

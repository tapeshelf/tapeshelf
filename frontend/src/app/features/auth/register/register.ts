import { Component, inject, input, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { rememberAfterVerify } from '../../../core/auth/after-verify';
import { toApiError } from '../../../core/api/api-error';
import { AuthStore } from '../../../core/auth/auth.store';
import { PASSWORD_PATTERN, USERNAME_PATTERN, fieldError } from '../../../shared/forms/validation';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { FieldComponent } from '../../../shared/ui/field/field';
import { InputDirective } from '../../../shared/ui/field/input.directive';
import { SiteConfig } from '../../../core/site/site-config';
import { CaptchaComponent } from '../../../shared/ui/captcha/captcha';
import { AuthLayoutComponent } from '../auth-layout';
import { SignupCaptcha } from '../signup-captcha';
import { GoogleButtonComponent } from '../google-button';
import { SensitiveContentService } from '../../../core/content/sensitive.service';
import { profileUrl } from '../../../core/navigation/user-links';

type Field = 'email' | 'username' | 'password' | 'displayName';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    AuthLayoutComponent,
    GoogleButtonComponent,
    FieldComponent,
    InputDirective,
    ButtonDirective,
    AlertComponent,
    CaptchaComponent,
  ],
  template: `
    <app-auth-layout [title]="'auth.register.title' | transloco">
      @if (!site.registrationOpen()) {
        <app-alert kind="info" data-testid="registration-closed">{{
          'auth.register.closed' | transloco
        }}</app-alert>
      } @else {
        <app-google-button />
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
          <app-field [label]="'auth.email' | transloco" [error]="err('email')">
            <input
              appInput
              type="email"
              formControlName="email"
              autocomplete="email"
              [attr.aria-invalid]="!!err('email')"
            />
          </app-field>
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
            [label]="'auth.password' | transloco"
            [hint]="'validation.password' | transloco"
            [error]="err('password')"
          >
            <input
              appInput
              type="password"
              formControlName="password"
              autocomplete="new-password"
              [attr.aria-invalid]="!!err('password')"
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
            <app-captcha
              [siteKey]="key"
              (token)="onCaptcha($event)"
              (failed)="captchaLoadFailed()"
            />
          }
          @if (serverError(); as message) {
            <app-alert kind="error">{{ message }}</app-alert>
          }
          <button appButton type="submit" [disabled]="busy()">
            {{ 'auth.register.submit' | transloco }}
          </button>
        </form>
        <!-- consent to the rules; covers the Google button above as well -->
        <p class="mt-4 text-xs leading-relaxed text-muted">
          {{ 'auth.register.agreeBefore' | transloco }}
          <a
            routerLink="/terms"
            class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
            >{{ 'auth.register.agreeTerms' | transloco }}</a
          >
          {{ 'auth.register.agreeAnd' | transloco }}
          <a
            routerLink="/privacy"
            class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
            >{{ 'auth.register.agreePrivacy' | transloco }}</a
          >{{ 'auth.register.agreeAfter' | transloco }}
        </p>
      }
      <p class="mt-5 text-sm text-muted">
        {{ 'auth.register.haveAccount' | transloco }}
        <a
          routerLink="/login"
          class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
          >{{ 'auth.register.login' | transloco }}</a
        >
      </p>
    </app-auth-layout>
  `,
})
export class RegisterPage {
  private readonly sensitive = inject(SensitiveContentService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    displayName: ['', [Validators.maxLength(50)]],
  });
  readonly returnTo = input<string>();
  protected readonly busy = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly site = inject(SiteConfig);
  protected readonly captcha = new SignupCaptcha();
  private readonly widget = viewChild(CaptchaComponent);

  protected err(name: Field): string | null {
    const overrides: Record<string, string> =
      name === 'username'
        ? { pattern: 'validation.username' }
        : name === 'password'
          ? { pattern: 'validation.password' }
          : {};
    const e = fieldError(this.form.get(name), overrides);
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    const { displayName, ...rest } = this.form.getRawValue();
    try {
      const me = await this.auth.register({
        ...rest,
        displayName: displayName.trim() || undefined,
        // A guest who already agreed to sensitive content starts the account with it on.
        showSensitive: this.sensitive.guestConsent() || undefined,
        captchaToken: this.captcha.token ?? undefined,
      });
      const r = this.returnTo();
      const safe = r && r.startsWith('/') && !r.startsWith('//') ? r : null;
      if (safe) rememberAfterVerify(safe);
      await this.router.navigateByUrl(safe ?? profileUrl(me.username));
    } catch (e) {
      const api = toApiError(e);
      this.captcha.failed(api.code, this.widget());
      this.serverError.set(
        api.message || this.t.translate(`errors.${api.code === 'network' ? 'network' : 'unknown'}`),
      );
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

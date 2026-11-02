import { Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import type { MeDto } from '../../../api/models/me-dto';
import { toApiError } from '../../../core/api/api-error';
import { SiteConfig } from '../../../core/site/site-config';
import { AuthStore } from '../../../core/auth/auth.store';
import { fieldError } from '../../../shared/forms/validation';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { FieldComponent } from '../../../shared/ui/field/field';
import { InputDirective } from '../../../shared/ui/field/input.directive';
import { AuthLayoutComponent } from '../auth-layout';
import { GoogleButtonComponent } from '../google-button';
import { profileUrl } from '../../../core/navigation/user-links';

const OAUTH_ERRORS = new Set([
  'googleFailed',
  'accountBanned',
  'emailTaken',
  'adminGoogle',
  'googleLinkTwoFactor',
]);

/** The second step after the password: which ways this account has. */
interface Step {
  methods: ('app' | 'passkey')[];
  recovery: boolean;
}

@Component({
  selector: 'app-login',
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
    AutofocusDirective,
  ],
  template: `
    @if (step(); as s) {
      <app-auth-layout [title]="'auth.secondStep.title' | transloco">
        <p class="mb-4 text-sm text-muted">
          {{
            (s.recovery
              ? 'auth.secondStep.recoveryHint'
              : s.methods.includes('app')
                ? 'auth.secondStep.appHint'
                : 'auth.secondStep.passkeyHint'
            ) | transloco
          }}
        </p>
        @if (s.methods.includes('passkey') && !s.recovery) {
          <button
            appButton
            type="button"
            class="mb-4 w-full"
            [variant]="s.methods.includes('app') ? 'secondary' : 'primary'"
            [disabled]="busy()"
            (click)="passkey()"
          >
            {{ 'auth.secondStep.usePasskey' | transloco }}
          </button>
        }
        @if (s.methods.includes('app') || s.recovery) {
          <form
            [formGroup]="codeForm"
            (ngSubmit)="submitCode()"
            class="flex flex-col gap-4"
            novalidate
          >
            <app-field
              [label]="
                (s.recovery ? 'auth.secondStep.recoveryCode' : 'auth.secondStep.code') | transloco
              "
            >
              <input
                appInput
                appAutofocus
                formControlName="code"
                [attr.inputmode]="s.recovery ? null : 'numeric'"
                [attr.autocomplete]="s.recovery ? 'off' : 'one-time-code'"
                [attr.maxlength]="s.recovery ? 16 : 6"
                [attr.placeholder]="s.recovery ? 'XXXXX-XXXXX' : '123456'"
                data-testid="second-step-code"
              />
            </app-field>
            @if (serverError(); as message) {
              <app-alert kind="error">{{ message }}</app-alert>
            }
            <button appButton type="submit" [disabled]="busy()">
              {{ 'auth.login.submit' | transloco }}
            </button>
          </form>
        } @else if (serverError(); as message) {
          <app-alert kind="error">{{ message }}</app-alert>
        }
        <div class="mt-5 flex flex-col gap-2 text-sm text-muted">
          <button type="button" class="text-left hover:text-text" (click)="toggleRecovery()">
            {{
              (s.recovery
                ? s.methods.includes('app')
                  ? 'auth.secondStep.useApp'
                  : 'auth.secondStep.usePasskeyInstead'
                : 'auth.secondStep.useRecovery'
              ) | transloco
            }}
          </button>
          <button type="button" class="text-left hover:text-text" (click)="back()">
            {{ 'auth.secondStep.back' | transloco }}
          </button>
        </div>
      </app-auth-layout>
    } @else {
      <app-auth-layout [title]="'auth.login.title' | transloco">
        <app-google-button [returnTo]="returnTo()" />
        @if (oauthError(); as key) {
          <app-alert kind="error" class="mb-4 block">{{ key | transloco }}</app-alert>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
          <app-field [label]="'auth.email' | transloco" [error]="err('email')">
            <input
              appInput
              type="email"
              maxlength="254"
              formControlName="email"
              autocomplete="email"
              [attr.aria-invalid]="!!err('email')"
            />
          </app-field>
          <app-field [label]="'auth.password' | transloco" [error]="err('password')">
            <input
              appInput
              type="password"
              maxlength="128"
              formControlName="password"
              autocomplete="current-password"
              [attr.aria-invalid]="!!err('password')"
            />
          </app-field>
          @if (serverError(); as message) {
            <app-alert kind="error">{{ message }}</app-alert>
          }
          <button appButton type="submit" [disabled]="busy()">
            {{ 'auth.login.submit' | transloco }}
          </button>
        </form>
        <div class="mt-5 flex flex-col gap-2 text-sm text-muted">
          @if (site.emailEnabled()) {
            <a routerLink="/forgot-password" class="hover:text-text">{{
              'auth.login.forgot' | transloco
            }}</a>
          }
          @if (site.registrationOpen()) {
            <span
              >{{ 'auth.login.noAccount' | transloco }}
              <a
                routerLink="/register"
                class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
                >{{ 'auth.login.register' | transloco }}</a
              ></span
            >
          }
        </div>
      </app-auth-layout>
    }
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly site = inject(SiteConfig);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);

  readonly returnTo = input<string>();
  readonly error = input<string>();

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly codeForm = this.fb.group({ code: [''] });
  protected readonly busy = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly step = signal<Step | null>(null);
  protected readonly oauthError = computed(() => {
    const e = this.error();
    return e && OAUTH_ERRORS.has(e) ? `auth.login.errors.${e}` : null;
  });

  protected err(name: 'email' | 'password'): string | null {
    const e = fieldError(this.form.get(name));
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    await this.run(
      () => this.auth.login(this.form.getRawValue()),
      (e) => {
        // The password fits and two-step sign-in is on: the step follows on this page.
        const api = toApiError(e);
        if (api.code !== 'twoFactorLogin') return false;
        const methods = (api.details as { methods?: Step['methods'] } | undefined)?.methods ?? [];
        this.codeForm.reset();
        this.step.set({ methods, recovery: methods.length === 0 });
        return true;
      },
    );
  }

  async submitCode(): Promise<void> {
    const code = this.codeForm.getRawValue().code.trim();
    if (!code) return;
    await this.run(
      () => this.auth.loginSecondStep(code),
      (e) => this.ticketGone(e),
    );
  }

  async passkey(): Promise<void> {
    await this.run(
      () => this.auth.loginWithPasskey(),
      (e) => this.ticketGone(e),
    );
  }

  protected toggleRecovery(): void {
    this.codeForm.reset();
    this.serverError.set(null);
    this.step.update((s) => s && { ...s, recovery: !s.recovery || s.methods.length === 0 });
  }

  protected back(): void {
    this.step.set(null);
    this.serverError.set(null);
    this.form.controls.password.reset();
  }

  /** Took too long: back to the password, with the reason. */
  private ticketGone(e: unknown): boolean {
    if (toApiError(e).code !== 'twoFactorExpired') return false;
    this.back();
    this.serverError.set(toApiError(e).message);
    return true;
  }

  private async run(
    call: () => Promise<MeDto | null>,
    handled: (e: unknown) => boolean,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    try {
      const me = await call();
      if (me) await this.router.navigateByUrl(this.safeReturnTo() ?? profileUrl(me.username));
    } catch (e) {
      if (!handled(e)) {
        const api = toApiError(e);
        this.serverError.set(
          api.message ||
            this.t.translate(`errors.${api.code === 'network' ? 'network' : 'unknown'}`),
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  private safeReturnTo(): string | null {
    const r = this.returnTo();
    return r && r.startsWith('/') && !r.startsWith('//') ? r : null;
  }
}

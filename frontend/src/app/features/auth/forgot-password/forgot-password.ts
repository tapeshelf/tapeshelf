import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, authForgotPassword } from '../../../api';
import { toApiError } from '../../../core/api/api-error';
import { fieldError } from '../../../shared/forms/validation';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { FieldComponent } from '../../../shared/ui/field/field';
import { InputDirective } from '../../../shared/ui/field/input.directive';
import { AuthLayoutComponent } from '../auth-layout';

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    AuthLayoutComponent,
    FieldComponent,
    InputDirective,
    ButtonDirective,
    AlertComponent,
  ],
  template: `
    <app-auth-layout [title]="'auth.forgot.title' | transloco">
      @if (sent()) {
        <app-alert kind="success"
          >{{ 'auth.forgot.sent' | transloco }} {{ 'auth.verify.checkSpam' | transloco }}</app-alert
        >
        <a
          routerLink="/login"
          class="mt-6 inline-block text-sm font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
          >{{ 'common.back' | transloco }}</a
        >
      } @else {
        <p class="mb-4 text-sm text-muted">{{ 'auth.forgot.text' | transloco }}</p>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
          <app-field [label]="'auth.email' | transloco" [error]="err()">
            <input
              appInput
              type="email"
              maxlength="254"
              formControlName="email"
              autocomplete="email"
              [attr.aria-invalid]="!!err()"
            />
          </app-field>
          @if (serverError(); as message) {
            <app-alert kind="error">{{ message }}</app-alert>
          }
          <button appButton type="submit" [disabled]="busy()">
            {{ 'auth.forgot.submit' | transloco }}
          </button>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  protected readonly form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected err(): string | null {
    const e = fieldError(this.form.get('email'));
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(authForgotPassword, { body: this.form.getRawValue() });
      this.sent.set(true);
    } catch (e) {
      this.serverError.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

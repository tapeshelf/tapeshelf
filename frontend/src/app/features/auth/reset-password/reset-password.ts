import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, authResetPassword } from '../../../api';
import { toApiError } from '../../../core/api/api-error';
import { PASSWORD_PATTERN, fieldError } from '../../../shared/forms/validation';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { FieldComponent } from '../../../shared/ui/field/field';
import { InputDirective } from '../../../shared/ui/field/input.directive';
import { AuthLayoutComponent } from '../auth-layout';

@Component({
  selector: 'app-reset-password',
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
    <app-auth-layout [title]="'auth.reset.title' | transloco">
      @if (done()) {
        <app-alert kind="success">{{ 'auth.reset.done' | transloco }}</app-alert>
        <a appButton routerLink="/login" class="mt-6">{{ 'auth.reset.login' | transloco }}</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
          <app-field
            [label]="'auth.newPassword' | transloco"
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
          <app-field [label]="'auth.confirmPassword' | transloco" [error]="err('confirm')">
            <input
              appInput
              type="password"
              formControlName="confirm"
              autocomplete="new-password"
              [attr.aria-invalid]="!!err('confirm')"
            />
          </app-field>
          @if (serverError(); as message) {
            <app-alert kind="error">{{ message }}</app-alert>
          }
          <button appButton type="submit" [disabled]="busy()">
            {{ 'auth.reset.submit' | transloco }}
          </button>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  readonly token = input<string>();
  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirm: ['', [Validators.required]],
  });
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected err(name: 'password' | 'confirm'): string | null {
    const control = this.form.get(name);
    if (
      name === 'confirm' &&
      control?.touched &&
      control.value !== this.form.get('password')?.value
    ) {
      return this.t.translate('validation.passwordsDiffer');
    }
    const e = fieldError(control, { pattern: 'validation.password' });
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const { password, confirm } = this.form.getRawValue();
    if (this.form.invalid || password !== confirm || this.busy() || !this.token()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(authResetPassword, { body: { token: this.token()!, password } });
      this.done.set(true);
    } catch (e) {
      this.serverError.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

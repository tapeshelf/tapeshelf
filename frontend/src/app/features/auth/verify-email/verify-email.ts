import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, authResendVerification, authVerifyEmail } from '../../../api';
import { takeAfterVerify } from '../../../core/auth/after-verify';
import { errorText, toApiError } from '../../../core/api/api-error';
import { AuthStore } from '../../../core/auth/auth.store';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { AuthLayoutComponent } from '../auth-layout';
import { profileLink } from '../../../core/navigation/user-links';

@Component({
  selector: 'app-verify-email',
  imports: [
    RouterLink,
    TranslocoPipe,
    AuthLayoutComponent,
    AlertComponent,
    ButtonDirective,
    SpinnerComponent,
  ],
  template: `
    <app-auth-layout [title]="'auth.verify.title' | transloco">
      @switch (state()) {
        @case ('working') {
          <p class="flex items-center gap-3 text-muted">
            <app-spinner /> {{ 'auth.verify.working' | transloco }}
          </p>
        }
        @case ('done') {
          <app-alert kind="success">{{ 'auth.verify.done' | transloco }}</app-alert>
          @if (auth.user(); as user) {
            @if (afterVerify) {
              <button type="button" appButton class="mt-6" (click)="continue(afterVerify)">
                {{ 'auth.verify.continue' | transloco }}
              </button>
            } @else {
              <a appButton [routerLink]="profileLink(user.username)" class="mt-6">{{
                'auth.verify.goHome' | transloco
              }}</a>
            }
          } @else {
            <a appButton routerLink="/login" class="mt-6">{{ 'nav.login' | transloco }}</a>
          }
        }
        @case ('failed') {
          <app-alert kind="error">{{ message() || ('auth.verify.failed' | transloco) }}</app-alert>
          @if (auth.user()?.emailVerified === false) {
            <button appButton variant="secondary" class="mt-6" (click)="resend()">
              {{ 'auth.verify.resend' | transloco }}
            </button>
          }
        }
      }
    </app-auth-layout>
  `,
})
export class VerifyEmailPage {
  protected readonly profileLink = profileLink;
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  /** Where the sign-up began, kept by the register page; used once. */
  protected readonly afterVerify = takeAfterVerify();

  readonly token = input<string>();
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly message = signal('');

  constructor() {
    effect(() => {
      const token = this.token();
      void this.verify(token);
    });
  }

  private async verify(token: string | undefined): Promise<void> {
    if (!token) {
      this.state.set('failed');
      return;
    }
    try {
      await this.api.invoke(authVerifyEmail, { body: { token } });
      const user = this.auth.user();
      if (user) this.auth.setUser({ ...user, emailVerified: true });
      this.state.set('done');
    } catch (e) {
      this.message.set(errorText(e));
      this.state.set('failed');
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

  protected continue(url: string): void {
    void this.router.navigateByUrl(url);
  }
}

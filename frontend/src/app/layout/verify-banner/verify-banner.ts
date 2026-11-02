import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { authResendVerification } from '../../api/fn/auth/auth-resend-verification';
import { toApiError } from '../../core/api/api-error';
import { ViewAsService } from '../../core/admin/view-as.service';
import { AuthStore } from '../../core/auth/auth.store';
import { FRAME } from '../../core/layout/frame';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';

/** Shown to signed-in users until they confirm their email. */
@Component({
  selector: 'app-verify-banner',
  imports: [TranslocoPipe, ButtonDirective],
  template: `
    @if (auth.user()?.emailVerified === false && !viewAs.active()) {
      <div class="border-b border-line/15 bg-shelf text-sm text-ink">
        <div class="flex flex-wrap items-center justify-between gap-2 py-2" [class]="frame">
          <span>{{ 'auth.verify.bannerText' | transloco }}</span>
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            [disabled]="sent()"
            (click)="resend()"
          >
            {{ 'auth.verify.bannerAction' | transloco }}
          </button>
        </div>
      </div>
    }
  `,
})
export class VerifyBannerComponent {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);
  protected readonly frame = FRAME;
  protected readonly viewAs = inject(ViewAsService);
  protected readonly sent = signal(false);

  async resend(): Promise<void> {
    try {
      await this.api.invoke(authResendVerification);
      this.sent.set(true);
      this.toast.success(this.t.translate('auth.verify.bannerSent'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

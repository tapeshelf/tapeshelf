import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { billingPortal } from '../../api/fn/billing/billing-portal';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { toApiError } from '../api/api-error';

/**
 * Paddle's customer portal: plan, card, invoices and cancelling live there, not here. The
 * link is signed in and short-lived, so it is fetched on the click and opened in the same tab.
 */
@Injectable({ providedIn: 'root' })
export class BillingPortal {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);

  async open(target: 'overview' | 'payment' = 'overview'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const links = await this.api.invoke(billingPortal);
      location.assign(target === 'payment' ? (links.updatePaymentUrl ?? links.url) : links.url);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
      this.busy.set(false);
    }
  }
}

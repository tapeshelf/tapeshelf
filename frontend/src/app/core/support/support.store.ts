import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { supportSummary } from '../../api/fn/support/support-summary';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';

/**
 * Support for the account menu: how many of my tickets have an answer I have not
 * read, and a version the support pages reload on (support wrote, or I changed something).
 */
@Injectable({ providedIn: 'root' })
export class SupportStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly ws = inject(WsService);

  readonly unread = signal(0);
  readonly version = signal(0);

  constructor() {
    // Backend SUPPORT_WS_EVENT.changed: support wrote, or the ticket was read elsewhere.
    this.ws.on<{ unread: number }>('support.changed', ({ unread }) => {
      this.unread.set(unread);
      this.version.update((v) => v + 1);
    });
    this.ws.onResync(() => this.changed());
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.unread.set(0);
        if (user) void this.refresh();
      });
    });
  }

  async refresh(): Promise<void> {
    try {
      this.unread.set((await this.api.invoke(supportSummary)).unread);
    } catch {
      /* decorative */
    }
  }

  /** After a local action on a ticket. */
  changed(): void {
    this.version.update((v) => v + 1);
    void this.refresh();
  }
}

import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { whatsNewSeen } from '../../api/fn/social/whats-new-seen';
import { whatsNewState } from '../../api/fn/social/whats-new-state';
import { AuthStore } from '../auth/auth.store';

/**
 * The red dot on "What's new" in the account menu: asked on sign-in and whenever
 * the menu opens (the only place the dot is seen); opening the panel puts it out.
 */
@Injectable({ providedIn: 'root' })
export class WhatsNewStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);

  readonly hasNew = signal(false);

  constructor() {
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.hasNew.set(false);
        if (user) void this.refresh();
      });
    });
  }

  async refresh(): Promise<void> {
    if (!this.auth.userId()) return;
    try {
      this.hasNew.set((await this.api.invoke(whatsNewState)).hasNew);
    } catch {
      /* decorative */
    }
  }

  async markSeen(): Promise<void> {
    this.hasNew.set(false);
    try {
      await this.api.invoke(whatsNewSeen);
    } catch {
      /* next time */
    }
  }
}

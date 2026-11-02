import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { exchangeHint } from '../../api/fn/exchange/exchange-hint';
import { exchangeHintDismiss } from '../../api/fn/exchange/exchange-hint-dismiss';
import { exchangeHintSeen } from '../../api/fn/exchange/exchange-hint-seen';
import { exchangeSummary } from '../../api/fn/exchange/exchange-summary';
import type { HintStateDto } from '../../api/models/hint-state-dto';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';

/** Navigation counter for requests awaiting me and the hint state. */
@Injectable({ providedIn: 'root' })
export class ExchangeStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly ws = inject(WsService);

  readonly awaitingMe = signal(0);
  readonly outgoing = signal(0);
  readonly hint = signal<HintStateDto | null>(null);
  /** Bumped whenever a request changed (pages reload their data). */
  readonly version = signal(0);
  readonly hasPending = computed(() => this.awaitingMe() > 0);

  constructor() {
    // Sent for every change of a request, whatever the bell preferences (backend
    // EXCHANGE_CHANGED_WS_EVENT); after a break, as if one had come.
    this.ws.on('exchange.changed', () => this.changed());
    this.ws.onResync(() => this.changed());
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.awaitingMe.set(0);
        this.outgoing.set(0);
        this.hint.set(null);
        if (user) void this.refresh();
      });
    });
  }

  async refresh(): Promise<void> {
    try {
      const s = await this.api.invoke(exchangeSummary);
      this.awaitingMe.set(s.awaitingMe);
      this.outgoing.set(s.outgoing);
    } catch {
      /* decorative */
    }
  }

  /** Called after any local action on a request. */
  changed(): void {
    this.version.update((v) => v + 1);
    void this.refresh();
  }

  async loadHint(): Promise<HintStateDto> {
    const state = await this.api.invoke(exchangeHint);
    this.hint.set(state);
    return state;
  }

  async hintSeen(): Promise<void> {
    this.hint.set(await this.api.invoke(exchangeHintSeen));
  }

  async hintDismiss(): Promise<void> {
    this.hint.set(await this.api.invoke(exchangeHintDismiss));
  }
}

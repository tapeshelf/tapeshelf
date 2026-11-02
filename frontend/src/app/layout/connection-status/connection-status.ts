import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { WsService } from '../../core/ws/ws.service';

/** How long live updates may be gone before the page says so (a deploy takes a moment). */
export const LOST_AFTER_MS = 4000;

/**
 * "No connection — reconnecting…": live updates stopped and are being brought back. Quiet
 * and small; it goes away once the socket is back (and fetches what was missed, WsService.onResync).
 */
@Component({
  selector: 'app-connection-status',
  imports: [TranslocoPipe],
  template: `
    @if (shown()) {
      <div
        class="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border-2 border-line bg-surface px-3 py-1.5 text-xs font-medium text-text shadow-hard-sm"
        role="status"
        data-testid="connection-lost"
      >
        <span class="size-2 animate-pulse rounded-full bg-danger"></span>
        {{ 'connection.lost' | transloco }}
      </div>
    }
  `,
})
export class ConnectionStatusComponent {
  private readonly ws = inject(WsService);
  protected readonly shown = signal(false);

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const lost = this.ws.lost();
      if (timer) clearTimeout(timer);
      timer = null;
      if (!lost) this.shown.set(false);
      else timer = setTimeout(() => this.shown.set(true), LOST_AFTER_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      if (timer) clearTimeout(timer);
    });
  }
}

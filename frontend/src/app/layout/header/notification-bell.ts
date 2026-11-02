import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell } from '@ng-icons/lucide';

import { type NotificationDto } from '../../api';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { describeNotification } from '../../core/notifications/notification-text';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { WsService } from '../../core/ws/ws.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { NotificationItemComponent } from '../../features/notifications/notification-item';
import { isPanelLink, panelLink } from '../../core/navigation/panels';

/** Header bell with the unread badge and a dropdown of the latest notifications. */

/** What deserves a toast while the bell is closed: a request, an offer, an exchange, an answer of support. */
const TOAST_TYPES = new Set([
  'REQUEST_RECEIVED',
  'OFFER_RECEIVED',
  'REQUEST_SHARED',
  'EXCHANGE_COMPLETED',
  // An answer of support is awaited.
  'SUPPORT_REPLY',
]);
/** Those whose videos came: the button leads to them. */
const RECEIVED_TYPES = new Set(['REQUEST_SHARED', 'EXCHANGE_COMPLETED']);
@Component({
  selector: 'app-notification-bell',
  imports: [
    TranslocoPipe,
    RouterLink,
    NgIcon,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    NotificationItemComponent,
  ],
  providers: [provideIcons({ lucideBell })],
  template: `
    <button
      type="button"
      class="relative flex h-10 w-10 items-center justify-center rounded-full text-text transition-colors hover:bg-surface-2"
      [cdkMenuTriggerFor]="menu"
      (cdkMenuOpened)="menuOpen.set(true); store.load()"
      (cdkMenuClosed)="menuOpen.set(false)"
      [attr.aria-label]="'notifications.bell' | transloco: { count: store.unread() }"
      data-testid="notification-bell"
    >
      <ng-icon name="lucideBell" size="18" />
      @if (store.unread() > 0) {
        <span
          class="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-accent px-1 font-mono text-[10px] font-bold text-accent-fg"
          data-testid="notification-badge"
          >{{ store.unread() > 99 ? '99+' : store.unread() }}</span
        >
      }
    </button>
    <ng-template #menu>
      <div
        cdkMenu
        class="mt-2 flex w-[min(380px,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface p-1.5 text-sm text-text shadow-float"
        data-testid="notification-menu"
      >
        <div class="flex items-center justify-between px-3 py-2">
          <span class="font-semibold">{{ 'notifications.title' | transloco }}</span>
          @if (store.unread() > 0) {
            <button
              type="button"
              class="text-xs font-semibold text-accent-text hover:underline"
              (click)="store.markAllRead()"
            >
              {{ 'notifications.markAllRead' | transloco }}
            </button>
          }
        </div>
        <!-- Requests that wait for this user's decision stay here until decided:
             a line, not a notification, so reading the bell does not lose them. -->
        @if (exchange.awaitingMe() > 0) {
          <a
            cdkMenuItem
            [routerLink]="panelLink('exchange')"
            [queryParams]="{ tab: 'incoming' }"
            [queryParamsHandling]="'merge'"
            class="mb-1 flex items-center justify-between gap-2 rounded-md bg-accent-soft px-3 py-2 font-semibold text-accent-text hover:bg-accent-soft/70"
            data-testid="awaiting-requests"
          >
            {{ 'notifications.awaiting' | transloco: { count: exchange.awaitingMe() } }}
            <span aria-hidden="true">→</span>
          </a>
        }
        @if (store.items().length === 0) {
          <p class="px-3 py-6 text-center text-xs text-muted">
            {{ (store.loaded() ? 'notifications.empty' : 'common.loading') | transloco }}
          </p>
        } @else {
          <div class="max-h-96 overflow-y-auto">
            @for (item of store.items().slice(0, 8); track item.id) {
              <app-notification-item
                cdkMenuItem
                class="block cursor-pointer rounded-sm hover:bg-surface-2"
                [item]="item"
                compact
                (cdkMenuItemTriggered)="open(item)"
              />
            }
          </div>
        }
        <a
          cdkMenuItem
          [routerLink]="panelLink('notifications')"
          [queryParamsHandling]="'merge'"
          class="mt-1 rounded-sm px-3 py-2 text-center text-xs font-semibold text-accent-text hover:bg-surface-2"
        >
          {{ 'notifications.seeAll' | transloco }}
        </a>
      </div>
    </ng-template>
  `,
})
export class NotificationBellComponent {
  protected readonly panelLink = panelLink;
  protected readonly store = inject(NotificationsStore);
  protected readonly exchange = inject(ExchangeStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly menuOpen = signal(false);

  constructor() {
    const off = inject(WsService).on<NotificationDto>('notification.new', (n) => {
      if (!TOAST_TYPES.has(n.type) || this.menuOpen()) return;
      // The list is in front of the user already.
      if (this.router.url.includes('panel:notifications')) return;
      // The ticket is open: its answer is right there.
      if (
        n.type === 'SUPPORT_REPLY' &&
        this.router.url.includes(`support/${String(n.payload?.['ticketId'])}`)
      )
        return;
      const view = describeNotification(n);
      // "Guest", "Anonymous": names that are words of the dictionary.
      const params = { ...view.params };
      for (const name of view.keyParams ?? [])
        params[name] = this.t.translate(String(params[name]));
      this.toast.withAction(this.t.translate(view.key, params), {
        label: this.t.translate(
          RECEIVED_TYPES.has(n.type) ? 'notifications.see' : 'notifications.open',
        ),
        run: () => this.open(n),
      });
    });
    inject(DestroyRef).onDestroy(off);
  }

  protected open(item: NotificationDto): void {
    void this.store.markRead(item.id);
    const { link, query } = NotificationItemComponent.targetOf(item);
    // a panel over the page keeps the page's query; a video or the shelf opens as a new page
    if (link)
      void this.router.navigate(
        link,
        isPanelLink(link) ? { queryParamsHandling: 'merge' } : { queryParams: query },
      );
    else void this.router.navigate(panelLink('notifications'), { queryParamsHandling: 'merge' });
  }
}

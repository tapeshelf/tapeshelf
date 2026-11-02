import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { notificationsList } from '../../api/fn/notifications/notifications-list';
import { notificationsRead } from '../../api/fn/notifications/notifications-read';
import { notificationsReadAll } from '../../api/fn/notifications/notifications-read-all';
import { notificationsReadRequest } from '../../api/fn/notifications/notifications-read-request';
import { notificationsUnread } from '../../api/fn/notifications/notifications-unread';
import type { NotificationDto } from '../../api/models/notification-dto';
import { errorText } from '../api/api-error';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';

const PAGE = 30;

/** The signed-in user's notifications: unread badge, dropdown/page list, live pushes. */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly ws = inject(WsService);

  readonly unread = signal(0);
  readonly items = signal<NotificationDto[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = computed(() => this.nextCursor() !== null);

  constructor() {
    this.ws.on<NotificationDto & { replaces?: string | null }>('notification.new', (n) => {
      // A chat notification replaces the previous unread one of the same conversation (count grows).
      const replaces = n.replaces ?? null;
      this.items.update((list) => {
        const rest = replaces ? list.filter((x) => x.id !== replaces) : list;
        return rest.some((x) => x.id === n.id) ? rest : [n, ...rest];
      });
      if (!this.loaded()) this.items.set([]); // keep the list consistent with the server on first load
      if (!replaces) this.unread.update((c) => c + 1);
    });
    this.ws.on<{ count: number }>('notification.unread', ({ count }) => this.unread.set(count));
    // After a break: the badge, and the list when one is shown (it missed what came meanwhile).
    this.ws.onResync(() => void (this.loaded() ? this.load() : this.refreshUnread()));
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.items.set([]);
        this.nextCursor.set(null);
        this.loaded.set(false);
        this.unread.set(0);
        if (user) void this.refreshUnread();
      });
    });
  }

  async refreshUnread(): Promise<void> {
    try {
      this.unread.set((await this.api.invoke(notificationsUnread)).count);
    } catch {
      /* the badge is decorative */
    }
  }

  /** First page (dropdown and page share it). */
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.invoke(notificationsList, { limit: PAGE });
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.unread.set(page.unreadCount);
      this.loaded.set(true);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loading()) return;
    this.loading.set(true);
    try {
      const page = await this.api.invoke(notificationsList, { cursor, limit: PAGE });
      this.items.update((list) => [
        ...list,
        ...page.items.filter((n) => !list.some((x) => x.id === n.id)),
      ]);
      this.nextCursor.set(page.nextCursor);
      this.unread.set(page.unreadCount);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * A request's thread was opened: its notifications are dealt with. The list turns them read
   * at once; the badge follows the server's push.
   */
  async markRequestRead(requestId: string): Promise<void> {
    const readAt = new Date().toISOString();
    this.items.update((list) =>
      list.map((n) => (!n.readAt && n.payload['requestId'] === requestId ? { ...n, readAt } : n)),
    );
    await this.api.invoke(notificationsReadRequest, { requestId }).catch(() => undefined);
  }

  /** Optimistic: the item turns read at once; the badge follows the server's push. */
  async markRead(id: string): Promise<void> {
    const item = this.items().find((n) => n.id === id);
    if (!item || item.readAt) return;
    const readAt = new Date().toISOString();
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, readAt } : n)));
    this.unread.update((c) => Math.max(0, c - 1));
    try {
      await this.api.invoke(notificationsRead, { id });
    } catch {
      this.items.update((list) => list.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
      this.unread.update((c) => c + 1);
    }
  }

  async markAllRead(): Promise<void> {
    const readAt = new Date().toISOString();
    this.items.update((list) => list.map((n) => (n.readAt ? n : { ...n, readAt })));
    this.unread.set(0);
    await this.api.invoke(notificationsReadAll).catch(() => this.refreshUnread());
  }
}

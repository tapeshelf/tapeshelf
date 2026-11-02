import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  Api,
  type MeDto,
  type NotificationDto,
  notificationsList,
  notificationsRead,
  notificationsReadAll,
  notificationsUnread,
} from '../../api';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';
import { NotificationsStore } from './notifications.store';

function n(id: string, readAt: string | null = null): NotificationDto {
  return {
    id,
    type: 'VIDEO_PROCESSED',
    payload: { videoId: 'v', title: id },
    readAt,
    createdAt: '2026-10-12T00:00:00.000Z',
  };
}

class FakeApi {
  calls: { fn: unknown; params: Record<string, unknown> | undefined }[] = [];
  items: NotificationDto[] = [];
  async invoke(fn: unknown, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ fn, params });
    if (fn === notificationsUnread) return { count: this.items.filter((x) => !x.readAt).length };
    if (fn === notificationsList) {
      const limit = (params?.['limit'] as number) ?? 30;
      const start = params?.['cursor']
        ? this.items.findIndex((x) => x.id === params['cursor']) + 1
        : 0;
      const page = this.items.slice(start, start + limit);
      return {
        items: page,
        nextCursor: start + limit < this.items.length ? page.at(-1)!.id : null,
        unreadCount: this.items.filter((x) => !x.readAt).length,
      };
    }
    if (fn === notificationsRead || fn === notificationsReadAll) return { ok: true };
    throw new Error('unexpected call');
  }
  of(fn: unknown) {
    return this.calls.filter((c) => c.fn === fn);
  }
}

class FakeWs {
  handlers = new Map<string, (payload: unknown) => void>();
  on(event: string, handler: (payload: unknown) => void): () => void {
    this.handlers.set(event, handler);
    return () => this.handlers.delete(event);
  }
  resyncs = new Set<() => void>();
  onResync(handler: () => void): () => void {
    this.resyncs.add(handler);
    return () => this.resyncs.delete(handler);
  }
  /** The socket is back after a break. */
  resync(): void {
    for (const h of this.resyncs) h();
  }
  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('NotificationsStore', () => {
  let api: FakeApi;
  let ws: FakeWs;
  let auth: AuthStore;
  let store: NotificationsStore;

  beforeEach(() => {
    api = new FakeApi();
    ws = new FakeWs();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: Api, useValue: api },
        { provide: WsService, useValue: ws },
      ],
    });
    auth = TestBed.inject(AuthStore);
    store = TestBed.inject(NotificationsStore);
    api.items = [n('c'), n('b', '2026-10-12T00:00:00.000Z'), n('a')];
  });

  it('fetches the unread count once the user is known and pages through the list', async () => {
    auth.setUser({ id: 'me', username: 'me' } as MeDto);
    TestBed.tick();
    await flush();
    expect(store.unread()).toBe(2);
    await store.load();
    expect(store.items().map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(store.hasMore()).toBe(false);
  });

  it('applies pushes and marks read optimistically', async () => {
    auth.setUser({ id: 'me', username: 'me' } as MeDto);
    TestBed.tick();
    await flush();
    await store.load();
    ws.emit('notification.new', n('d'));
    expect(store.items()[0]!.id).toBe('d');
    expect(store.unread()).toBe(3);
    ws.emit('notification.unread', { count: 7 });
    expect(store.unread()).toBe(7);

    await store.markRead('d');
    expect(store.items()[0]!.readAt).not.toBeNull();
    expect(store.unread()).toBe(6);
    expect(api.of(notificationsRead)).toHaveLength(1);
    await store.markRead('d'); // already read: no second call
    expect(api.of(notificationsRead)).toHaveLength(1);

    await store.markAllRead();
    expect(store.unread()).toBe(0);
    expect(store.items().every((x) => x.readAt)).toBe(true);
    expect(api.of(notificationsReadAll)).toHaveLength(1);
  });

  it('resets when the user signs out', async () => {
    auth.setUser({ id: 'me', username: 'me' } as MeDto);
    TestBed.tick();
    await flush();
    await store.load();
    auth.markAnonymous();
    TestBed.tick();
    expect(store.items()).toEqual([]);
    expect(store.unread()).toBe(0);
    expect(store.loaded()).toBe(false);
  });
});

import { InjectionToken, Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

import { ViewAsService } from '../admin/view-as.service';
import { AuthStore } from '../auth/auth.store';

type Handler = (payload: unknown) => void;

/** Why the server refused a handshake (backend WS_CONNECT_ERROR): no live session. */
const SESSION_EXPIRED = 'sessionExpired';
/** At most one session renewal per this long on the socket's behalf; a refusal loop must not hammer the API. */
const RENEW_GAP_MS = 30_000;

/**
 * One socket.io connection per signed-in user (server: WsGateway at /ws). Handlers can be
 * registered before the socket exists; they survive reconnects.
 *
 * Socket.io retries a lost connection by itself (sleep, network, a deploy). Two cases it does not
 * retry, both about the session: the server refusing the handshake (`connect_error`
 * "sessionExpired", e.g. the access cookie expired while the tab slept) and the server closing the
 * socket ("io server disconnect", a session revoked). Then the session is renewed and a new
 * connection opened — a new one, because the handshake carries the cookies of the connection's first
 * request. A network error says nothing about the session and does not touch it.
 *
 * Events sent while the socket was down are lost (Redis pub/sub keeps nothing): after a reconnect
 * the `onResync` handlers fetch again what those events would have changed.
 */
/**
 * Opens the socket.io connection. A token so that tests hand in their own socket: mocking the
 * module is not reliable once the tests are bundled and share a worker (CI run #32). The client is
 * loaded when a user is known: a guest never needs it, and it was part of everyone's first
 * download.
 */
export const SOCKET_FACTORY = new InjectionToken<
  (options: Partial<ManagerOptions & SocketOptions>) => Promise<Socket>
>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => async (options) => (await import('socket.io-client')).io(options),
});

@Injectable({ providedIn: 'root' })
export class WsService {
  private readonly openSocket = inject(SOCKET_FACTORY);
  private readonly auth = inject(AuthStore);
  private readonly viewAs = inject(ViewAsService);
  private socket: Socket | null = null;
  private socketUser: string | null = null;
  /** The user whose socket is being opened (the client still loading). */
  private opening: string | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly resyncs = new Set<() => void>();
  private wasConnected = false;
  private lastRenew = 0;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;

  readonly connected = signal(false);
  /** A connection there was is down (sleep, network, a deploy); false before the first one. */
  readonly lost = signal(false);

  constructor() {
    effect(() => {
      // The socket would carry the admin's own events: no live updates while viewing as someone.
      const userId = this.viewAs.active() ? null : this.auth.userId();
      untracked(() => {
        if (userId !== this.socketUser) this.disconnect();
        if (userId) this.connect(userId);
      });
    });
  }

  /** Subscribes to a server event; returns the unsubscribe function. */
  on<T>(event: string, handler: (payload: T) => void): () => void {
    const h = handler as Handler;
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(h);
    this.socket?.on(event, h);
    return () => {
      set?.delete(h);
      this.socket?.off(event, h);
    };
  }

  /** Runs `handler` each time the socket is back after a break; returns the unsubscribe function. */
  onResync(handler: () => void): () => void {
    this.resyncs.add(handler);
    return () => this.resyncs.delete(handler);
  }

  private connect(userId: string): void {
    if (this.socket || this.opening === userId) return;
    this.opening = userId;
    this.socketUser = userId;
    this.openSocket({
      path: '/ws',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })
      .then((socket) => {
        // Signed out or someone else meanwhile: this one is not wanted any more.
        if (this.opening !== userId) return void socket.disconnect();
        this.opening = null;
        this.attach(socket, userId);
      })
      .catch(() => {
        if (this.opening === userId) this.opening = this.socketUser = null;
      });
  }

  private attach(socket: Socket, userId: string): void {
    socket.on('connect', () => {
      this.connected.set(true);
      this.lost.set(false);
      if (this.wasConnected) for (const h of [...this.resyncs]) h();
      this.wasConnected = true;
    });
    socket.on('disconnect', (reason) => {
      this.connected.set(false);
      if (reason !== 'io client disconnect') this.lost.set(true);
      if (reason === 'io server disconnect') void this.renew(socket);
    });
    socket.on('connect_error', (err) => {
      if (err.message === SESSION_EXPIRED) void this.renew(socket);
    });
    for (const [event, set] of this.handlers) for (const h of set) socket.on(event, h);
    this.socket = socket;
    this.socketUser = userId;
  }

  private disconnect(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
    this.opening = null;
    this.socket?.disconnect();
    this.socket = null;
    this.socketUser = null;
    this.wasConnected = false;
    this.connected.set(false);
    this.lost.set(false);
  }

  /** Renews the session, then connects again with its new cookie (rate-limited, retried while the network is out). */
  private async renew(socket: Socket): Promise<void> {
    if (this.renewTimer || this.socket !== socket) return;
    const wait = this.lastRenew + RENEW_GAP_MS - Date.now();
    if (wait > 0) {
      this.renewTimer = setTimeout(() => {
        this.renewTimer = null;
        void this.renew(socket);
      }, wait);
      return;
    }
    this.lastRenew = Date.now();
    const ok = await this.auth.refresh();
    // A session that is over signed the user out, and the effect closed this socket.
    if (this.socket !== socket || socket.connected) return;
    if (ok) {
      socket.disconnect(); // the last socket of its manager: the transport closes with it
      socket.connect();
    } else if (this.auth.userId()) void this.renew(socket);
  }
}

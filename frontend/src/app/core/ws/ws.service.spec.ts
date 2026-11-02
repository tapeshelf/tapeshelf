import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewAsService } from '../admin/view-as.service';
import { AuthStore } from '../auth/auth.store';
import { type Socket } from 'socket.io-client';

import { SOCKET_FACTORY, WsService } from './ws.service';

type Listener = (...args: unknown[]) => void;

/** Just enough of a socket.io client socket: listeners, connect/disconnect, a connected flag. */
class FakeSocket {
  connected = false;
  readonly listeners = new Map<string, Listener[]>();
  readonly connect = vi.fn(() => this);
  readonly disconnect = vi.fn(() => {
    this.connected = false;
    return this;
  });
  on(event: string, fn: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    return this;
  }
  off(event: string, fn: Listener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((f) => f !== fn),
    );
    return this;
  }
  fire(event: string, ...args: unknown[]): void {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const fn of this.listeners.get(event) ?? []) fn(...args);
  }
}

const sockets: FakeSocket[] = [];
/** Every connection the service opens is a fake one, newest last. */
const openFake = () => {
  const s = new FakeSocket();
  sockets.push(s);
  return s as unknown as Socket;
};

/** Lets the refresh promise and what follows it run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WsService', () => {
  const userId = signal<string | null>('u1');
  const refresh = vi.fn<() => Promise<boolean>>();
  let ws: WsService;

  beforeEach(async () => {
    sockets.length = 0;
    userId.set('u1');
    refresh.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { userId, refresh } },
        { provide: ViewAsService, useValue: { active: signal(false) } },
        // The client is loaded on demand: the factory answers with a promise.
        { provide: SOCKET_FACTORY, useValue: () => Promise.resolve(openFake()) },
      ],
    });
    ws = TestBed.inject(WsService);
    TestBed.tick();
    await settle();
  });

  const socket = () => sockets.at(-1)!;

  it('a handshake refused for want of a session renews it and opens a new connection', async () => {
    refresh.mockResolvedValue(true);
    socket().fire('connect_error', new Error('sessionExpired'));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    // A new transport: the handshake must carry the renewed cookie.
    expect(socket().disconnect).toHaveBeenCalled();
    expect(socket().connect).toHaveBeenCalled();
  });

  it('network trouble leaves the session alone (socket.io retries by itself)', async () => {
    socket().fire('connect_error', new Error('websocket error'));
    socket().fire('disconnect', 'transport close');
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(socket().connect).not.toHaveBeenCalled();
  });

  it('a socket the server closed renews the session; a session that is over stays closed', async () => {
    socket().fire('connect');
    refresh.mockImplementation(async () => {
      userId.set(null); // the store signs the user out on a 401
      TestBed.tick();
      return false;
    });
    socket().fire('disconnect', 'io server disconnect');
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sockets[0]!.connect).not.toHaveBeenCalled();
    expect(sockets[0]!.disconnect).toHaveBeenCalled();
  });

  it('renews at most once per half a minute, then tries again', async () => {
    vi.useFakeTimers();
    try {
      refresh.mockResolvedValue(false); // no network: the user stays signed in
      socket().fire('connect_error', new Error('sessionExpired'));
      await vi.advanceTimersByTimeAsync(0);
      socket().fire('connect_error', new Error('sessionExpired'));
      await vi.advanceTimersByTimeAsync(0);
      expect(refresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs the resync handlers when the socket is back, not on the first connection', () => {
    const resync = vi.fn();
    const off = ws.onResync(resync);
    socket().fire('connect');
    expect(resync).not.toHaveBeenCalled();
    socket().fire('disconnect', 'transport close');
    socket().fire('connect');
    expect(resync).toHaveBeenCalledTimes(1);
    off();
    socket().fire('connect');
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('another account gets a socket of its own', async () => {
    const first = socket();
    userId.set('u2');
    TestBed.tick();
    await settle();
    expect(first.disconnect).toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
  });

  it('a socket that arrives after the user signed out is closed at once', async () => {
    let deliver!: (s: Socket) => void;
    const late = new Promise<Socket>((r) => (deliver = r));
    TestBed.resetTestingModule();
    sockets.length = 0;
    userId.set('u1');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { userId, refresh } },
        { provide: ViewAsService, useValue: { active: signal(false) } },
        { provide: SOCKET_FACTORY, useValue: () => late },
      ],
    });
    TestBed.inject(WsService);
    TestBed.tick();
    userId.set(null);
    TestBed.tick();
    const s = openFake();
    deliver(s);
    await settle();
    expect((s as unknown as FakeSocket).disconnect).toHaveBeenCalled();
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Api, authMe, authRefresh, authSession } from '../../api';
import type { MeDto } from '../../api/models/me-dto';
import { ViewAsService } from '../admin/view-as.service';
import { AuthStore } from './auth.store';

const me = { id: 'u1', username: 'ann' } as MeDto;

describe('AuthStore.refresh', () => {
  const invoke = vi.fn();
  let store: AuthStore;

  beforeEach(() => {
    invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { invoke } },
        { provide: ViewAsService, useValue: { active: signal(false) } },
      ],
    });
    store = TestBed.inject(AuthStore);
    store.setUser(me);
  });

  it('concurrent callers share one rotation', async () => {
    invoke.mockResolvedValue(me);
    const [a, b] = await Promise.all([store.refresh(), store.refresh()]);
    expect([a, b]).toEqual([true, true]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(authRefresh);
  });

  it('a session that is over signs the user out', async () => {
    invoke.mockRejectedValue(new HttpErrorResponse({ status: 401 }));
    expect(await store.refresh()).toBe(false);
    expect(store.user()).toBeNull();
    expect(store.status()).toBe('anonymous');
  });

  it('no network or a restarting API keeps the user signed in', async () => {
    for (const status of [0, 502, 503]) {
      invoke.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      expect(await store.refresh()).toBe(false);
      expect(store.user()).toEqual(me);
      expect(store.status()).toBe('authenticated');
    }
  });
});

describe('AuthStore.load (perf audit: guests)', () => {
  const invoke = vi.fn();
  let store: AuthStore;

  beforeEach(() => {
    invoke.mockReset();
    localStorage.removeItem('vs.signedIn');
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { invoke } },
        { provide: ViewAsService, useValue: { active: signal(false) } },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('a browser never signed in asks once whether there is a session, and is a guest', async () => {
    invoke.mockResolvedValue({ username: null });
    await store.load();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(authSession);
    expect(store.status()).toBe('anonymous');
  });

  it('a session there (signed in before the mark) goes on to /me and is remembered', async () => {
    invoke.mockImplementation((fn) =>
      Promise.resolve(fn === authSession ? { username: 'ann' } : me),
    );
    await store.load();
    expect(invoke).toHaveBeenLastCalledWith(authMe);
    expect(store.user()).toEqual(me);
    expect(localStorage.getItem('vs.signedIn')).toBe('1');
  });

  it('signed in here: straight to /me; signing out forgets it', async () => {
    localStorage.setItem('vs.signedIn', '1');
    invoke.mockResolvedValue(me);
    await store.load();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(authMe);
    store.markAnonymous();
    expect(localStorage.getItem('vs.signedIn')).toBeNull();
  });
});

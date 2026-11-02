import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { ViewAsService } from '../admin/view-as.service';
import { Api } from '../../api/api';
import { authLogin } from '../../api/fn/auth/auth-login';
import { authLoginCode } from '../../api/fn/auth/auth-login-code';
import { authLoginPasskey } from '../../api/fn/auth/auth-login-passkey';
import { authLoginPasskeyOptions } from '../../api/fn/auth/auth-login-passkey-options';
import { authLogout } from '../../api/fn/auth/auth-logout';
import { authMe } from '../../api/fn/auth/auth-me';
import { authRefresh } from '../../api/fn/auth/auth-refresh';
import { authRegister } from '../../api/fn/auth/auth-register';
import { authSession } from '../../api/fn/auth/auth-session';
import type { LoginDto } from '../../api/models/login-dto';
import type { MeDto } from '../../api/models/me-dto';
import type { RegisterDto } from '../../api/models/register-dto';
import { usePasskey } from './passkeys';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Set while this browser is signed in: a browser without it asks whether there is a session. */
const SIGNED_IN_KEY = 'vs.signedIn';

function signedInHere(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return true; // no storage: ask the usual way
  }
}

function rememberSignedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // no storage: nothing to remember
  }
}

/** Who is signed in. Loaded once at startup; the refresh interceptor keeps the session alive. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(Api);
  private readonly viewAs = inject(ViewAsService);
  private loading: Promise<void> | null = null;
  private refreshing: Promise<boolean> | null = null;

  readonly user = signal<MeDto | null>(null);
  /**
   * Who is signed in, as an id: per-account stores reset on this, not on `user`, which is a new
   * object after every saved setting or session refresh (a reset there emptied the shelf's index,
   * the quota and the header's badges for a moment).
   */
  readonly userId = computed(() => this.user()?.id ?? null);
  /** The account's tier: the quota and the size limits follow it (a Pro purchase, an expiry). */
  readonly tier = computed(() => this.user()?.tier ?? null);
  readonly status = signal<AuthStatus>('unknown');
  readonly isAuthenticated = computed(() => this.status() === 'authenticated');
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN' && !this.viewAs.active());

  /** Fetches the current user (401 → refresh → anonymous). Safe to call many times. */
  load(): Promise<void> {
    this.loading ??= this.fetchMe().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async ready(): Promise<void> {
    if (this.status() === 'unknown') await this.load();
  }

  setUser(me: MeDto): void {
    this.user.set(me);
    this.status.set('authenticated');
    rememberSignedIn(true);
  }

  markAnonymous(): void {
    this.user.set(null);
    this.status.set('anonymous');
    rememberSignedIn(false);
  }

  async login(body: LoginDto): Promise<MeDto> {
    const me = await this.replacingSession(() => this.api.invoke(authLogin, { body }));
    this.setUser(me);
    return me;
  }

  /** The second step after the password: the app's code or a recovery code. */
  async loginSecondStep(code: string): Promise<MeDto> {
    const me = await this.replacingSession(() =>
      this.api.invoke(authLoginCode, { body: { code } }),
    );
    this.setUser(me);
    return me;
  }

  /** The second step with a passkey; null when the browser's window was closed. */
  async loginWithPasskey(): Promise<MeDto | null> {
    const { options } = await this.api.invoke(authLoginPasskeyOptions);
    const response = await usePasskey(options);
    if (!response) return null;
    const me = await this.replacingSession(() =>
      this.api.invoke(authLoginPasskey, { body: { response } }),
    );
    this.setUser(me);
    return me;
  }

  async register(body: RegisterDto): Promise<MeDto> {
    const me = await this.replacingSession(() => this.api.invoke(authRegister, { body }));
    this.setUser(me);
    return me;
  }

  /**
   * Runs a call that sets a new session (signing in or up, finishing a Google sign-up) while no
   * rotation is on its way, in any tab. Ending the old session closes the socket, which then
   * rotates; sent with the old cookie at the same moment, that rotation failed and its answer
   * cleared the cookies the call had just set — the new account was signed out at once.
   * Waiting its turn, the rotation goes with the new cookie.
   */
  replacingSession<T>(fn: () => Promise<T>): Promise<T> {
    return oneTabAtATime(SESSION_LOCK, fn);
  }

  async logout(): Promise<void> {
    this.viewAs.clear();
    try {
      await this.api.invoke(authLogout);
    } finally {
      this.markAnonymous();
    }
  }

  /**
   * Rotates the refresh cookie; false when it did not happen. Only the server saying the session is
   * over (401, 403) signs the user out: no network or a restarting API (status 0, 5xx) leaves the
   * session as it is. Concurrent callers share one rotation, and tabs of this browser
   * take turns: two rotations sent with the same cookie at once made the second fail and
   * clear the cookies the first had just set.
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.rotate().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async rotate(): Promise<boolean> {
    try {
      // The cookie is read when the request is sent, inside the lock: after another tab rotated it,
      // this one sends the new cookie.
      const me = await oneTabAtATime(SESSION_LOCK, () => this.api.invoke(authRefresh));
      // While an admin views the site as someone, the page keeps showing that someone.
      this.setUser(this.viewAs.active() ? await this.api.invoke(authMe) : me);
      return true;
    } catch (e) {
      const status = e instanceof HttpErrorResponse ? e.status : 0;
      if (status === 401 || status === 403) this.markAnonymous();
      return false;
    }
  }

  private async fetchMe(): Promise<void> {
    // A browser not signed in here has nothing to renew: one question answered with 200 (the
    // refresh cookie looked at, not rotated) instead of a 401 on /me and another on /refresh,
    // both before the first screen of every guest. One signed in before this mark
    // existed still finds its session and goes on below.
    if (!signedInHere()) {
      const hint = await this.api.invoke(authSession).catch(() => null);
      if (hint && !hint.username) return this.markAnonymous();
    }
    try {
      this.setUser(await this.api.invoke(authMe));
    } catch {
      this.markAnonymous();
    }
  }
}

/** The session's cookies change under this lock only (rotations, sign-ins). */
const SESSION_LOCK = 'vs-auth-refresh';

/** Runs `fn` while holding a lock shared by every tab of this origin (Web Locks); without them, at once. */
function oneTabAtATime<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(name, fn) : fn();
}

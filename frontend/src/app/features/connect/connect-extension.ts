import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';

import { Api, appTokensConnect } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { deviceName } from '../../core/device/device-name';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { AuthLayoutComponent } from '../auth/auth-layout';

/**
 * Where the extension's sign-in window wants the code: https://<extension id>.chromiumapp.org/ in
 * Chromium, https://<40 hex>.extensions.allizom.org/ in Firefox.
 */
const EXTENSION_REDIRECT =
  /^https:\/\/(?:[a-p]{32}\.chromiumapp\.org|[\da-f]{40}\.extensions\.allizom\.org)\/[^?#]*$/;

/**
 * /connect/extension: the browser extension's sign-in window. Signed in (the
 * guard sends a guest to log in and back), one button: the app asks the server for a one-time code
 * and goes to the extension's address with it, which closes the window. Below the button, small, the
 * one line about the rules — the only time the extension mentions them.
 */
@Component({
  selector: 'app-connect-extension',
  imports: [RouterLink, TranslocoPipe, AuthLayoutComponent, AlertComponent, ButtonDirective],
  template: `
    <app-auth-layout [title]="'connect.title' | transloco">
      @if (!request()) {
        <app-alert kind="error" data-testid="connect-invalid">{{
          'connect.invalid' | transloco
        }}</app-alert>
      } @else if (done()) {
        <app-alert kind="success" data-testid="connect-done">{{
          'connect.done' | transloco
        }}</app-alert>
      } @else {
        @if (auth.user(); as user) {
          <div class="mb-5 flex items-center gap-3" data-testid="connect-account">
            <span
              class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-base font-bold text-accent-fg"
            >
              @if (user.avatarUrl) {
                <img [src]="user.avatarUrl" alt="" class="h-full w-full object-cover" />
              } @else {
                {{ user.displayName.charAt(0).toUpperCase() }}
              }
            </span>
            <div class="min-w-0">
              <p class="truncate text-lg leading-tight font-semibold">{{ user.displayName }}</p>
              <p class="label-mono truncate text-muted">&#64;{{ user.username }}</p>
            </div>
          </div>
        }
        <p class="mb-6 text-sm text-muted">{{ 'connect.lead' | transloco }}</p>
        @if (error(); as message) {
          <app-alert kind="error" class="mb-4">{{ message }}</app-alert>
        }
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            appButton
            [disabled]="busy()"
            (click)="connect()"
            data-testid="connect-confirm"
          >
            {{ 'connect.confirm' | transloco }}
          </button>
          <button type="button" appButton variant="ghost" (click)="cancel()" [disabled]="busy()">
            {{ 'common.cancel' | transloco }}
          </button>
        </div>
        <p class="mt-6 text-xs leading-relaxed text-muted" data-testid="connect-terms">
          {{ 'connect.terms' | transloco }}
          <a routerLink="/terms" target="_blank" class="underline underline-offset-2">{{
            'connect.termsLink' | transloco
          }}</a>
        </p>
      }
    </app-auth-layout>
  `,
})
export class ConnectExtensionPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthStore);

  /** The extension's request from the address, or null when it is not one. */
  protected readonly request = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((q) => {
        const redirectUri = q.get('redirect_uri') ?? '';
        const state = q.get('state') ?? '';
        const codeChallenge = q.get('code_challenge') ?? '';
        return EXTENSION_REDIRECT.test(redirectUri) &&
          /^[A-Za-z0-9_-]{43}$/.test(codeChallenge) &&
          state.length >= 8 &&
          state.length <= 200
          ? { redirectUri, state, codeChallenge }
          : null;
      }),
    ),
    { initialValue: null },
  );
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly name = computed(() => deviceName(navigator.userAgent));

  protected async connect(): Promise<void> {
    const req = this.request();
    if (!req || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { redirectTo } = await this.api.invoke(appTokensConnect, {
        body: { ...req, name: this.name() },
      });
      this.done.set(true);
      // The browser catches the extension's address and closes the window with the code.
      location.assign(redirectTo);
    } catch (e) {
      this.error.set(toApiError(e).message);
      this.busy.set(false);
    }
  }

  /** "Cancel" tells the extension so, the way OAuth does, and the window closes. */
  protected cancel(): void {
    const req = this.request();
    if (!req) return;
    const to = new URL(req.redirectUri);
    to.searchParams.set('error', 'access_denied');
    to.searchParams.set('state', req.state);
    location.assign(to.href);
  }
}

import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type InviteOutcome, invitesAccept, invitesPreview } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { profileLink } from '../../core/navigation/user-links';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AuthLayoutComponent } from '../auth/auth-layout';

/**
 * /invite/<code>: someone's link to be friends. Signed in, one click; a guest
 * signs up or logs in and comes back here with `?join=1`, which joins at once (a newcomer's
 * friendship then waits for the confirmed email, on the server).
 */
@Component({
  selector: 'app-invite-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    AuthLayoutComponent,
    AlertComponent,
    ButtonDirective,
    SpinnerComponent,
  ],
  template: `
    <app-auth-layout [title]="'invites.page.docTitle' | transloco">
      @if (preview.isLoading()) {
        <div class="flex justify-center py-6 text-muted"><app-spinner /></div>
      } @else if (preview.error()) {
        <app-alert kind="error" data-testid="invite-missing">{{
          'invites.page.notFound' | transloco
        }}</app-alert>
      } @else if (preview.hasValue()) {
        @let p = preview.value();
        <div class="mb-5 flex items-center gap-3" data-testid="invite-from">
          <span
            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-base font-bold text-accent-fg"
          >
            @if (p.inviter.avatarUrl) {
              <img [src]="p.inviter.avatarUrl" alt="" class="h-full w-full object-cover" />
            } @else {
              {{ p.inviter.displayName.charAt(0).toUpperCase() }}
            }
          </span>
          <div class="min-w-0">
            <p class="text-lg leading-tight font-semibold">
              {{ 'invites.page.title' | transloco: { name: p.inviter.displayName } }}
            </p>
            <p class="label-mono truncate text-muted">&#64;{{ p.inviter.username }}</p>
          </div>
        </div>
        @if (outcome() === 'friends') {
          <app-alert kind="success" data-testid="invite-done">{{
            'invites.page.friends' | transloco: { name: p.inviter.displayName }
          }}</app-alert>
          <!-- Friends now, but a hidden page still opens for nobody else. -->
          @if (!p.inviter.pageHidden) {
            <a appButton class="mt-5" [routerLink]="profileLink(p.inviter.username)">{{
              'invites.page.openShelf' | transloco: { name: p.inviter.displayName }
            }}</a>
          }
        } @else if (outcome() === 'pending') {
          <app-alert kind="info" data-testid="invite-pending">{{
            'invites.page.pending' | transloco: { name: p.inviter.displayName }
          }}</app-alert>
        } @else if (p.state !== 'valid') {
          <app-alert kind="error" data-testid="invite-over">{{
            'invites.page.' + p.state | transloco: { name: p.inviter.displayName }
          }}</app-alert>
        } @else if (own()) {
          <p class="text-sm text-muted">{{ 'invites.page.own' | transloco }}</p>
        } @else {
          <p class="mb-5 text-sm text-muted">{{ 'invites.page.lead' | transloco }}</p>
          @if (error(); as message) {
            <app-alert kind="error" class="mb-4">{{ message }}</app-alert>
          }
          @if (auth.user()) {
            <button
              type="button"
              appButton
              [disabled]="busy()"
              data-testid="invite-join"
              (click)="accept()"
            >
              {{ 'invites.page.join' | transloco }}
            </button>
          } @else {
            <div class="flex flex-wrap gap-2">
              <a appButton routerLink="/register" [queryParams]="{ returnTo: back() }">{{
                'invites.page.signUp' | transloco
              }}</a>
              <a
                appButton
                variant="secondary"
                routerLink="/login"
                [queryParams]="{ returnTo: back() }"
                >{{ 'invites.page.logIn' | transloco }}</a
              >
            </div>
          }
        }
      }
    </app-auth-layout>
  `,
})
export class InvitePage {
  protected readonly profileLink = profileLink;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);

  readonly code = input.required<string>();
  /** Back from signing up or in: join without another click. */
  readonly join = input<string>();

  protected readonly preview = resource({
    params: () => ({ code: this.code() }),
    loader: ({ params }) => this.api.invoke(invitesPreview, { code: params.code }),
  });
  protected readonly outcome = signal<InviteOutcome | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly own = computed(
    () => this.preview.value()?.inviter.username === this.auth.user()?.username,
  );
  /** Where signing up or in comes back to. */
  protected readonly back = computed(() => `/invite/${this.code()}?join=1`);

  constructor() {
    let tried = false;
    effect(() => {
      const ready =
        this.join() === '1' &&
        !!this.auth.user() &&
        this.preview.value()?.state === 'valid' &&
        !this.own();
      if (ready && !tried) {
        tried = true;
        untracked(() => void this.accept());
      }
    });
  }

  protected async accept(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.invoke(invitesAccept, { code: this.code() });
      this.outcome.set(result.outcome);
      // The address loses ?join=1: a reload does not try again.
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { join: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      if (result.outcome === 'friends')
        this.toast.success(
          this.t.translate('invites.page.friends', { name: result.inviter.displayName }),
        );
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

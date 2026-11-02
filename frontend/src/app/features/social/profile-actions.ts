import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideEllipsis, lucideMessageCircle, lucideUserPlus } from '@ng-icons/lucide';

import {
  Api,
  type PublicUserDto,
  blocksBlock,
  blocksUnblock,
  socialFollow,
  socialUnfollow,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { ReportService } from '../reports/report-dialog';
import { profileUrl } from '../../core/navigation/user-links';
import { panelLink } from '../../core/navigation/panels';

/**
 * What a visitor can do on someone's page: add as friend (follow), see that
 * they are friends or following, message a friend, block or unblock. A block by the page owner is
 * never shown: the buttons are simply not there. Guests are sent to sign up first.
 */
@Component({
  selector: 'app-profile-actions',
  imports: [
    RouterLink,
    TranslocoPipe,
    NgIcon,
    ButtonDirective,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
  ],
  providers: [provideIcons({ lucideUserPlus, lucideCheck, lucideMessageCircle, lucideEllipsis })],
  template: `
    @if (!auth.user()) {
      <a
        appButton
        variant="secondary"
        size="sm"
        routerLink="/register"
        [queryParams]="{ returnTo: profileUrl(user().username) }"
        data-testid="friend-button"
      >
        <ng-icon name="lucideUserPlus" size="14" />{{ 'social.addFriend' | transloco }}
      </a>
    } @else if (user().relation; as rel) {
      <div class="flex flex-wrap items-center justify-end gap-2">
        @if (rel.followsYou && !rel.friends) {
          <span
            class="label-mono rounded-sm bg-shelf px-1.5 py-0.5 text-ink"
            data-testid="follows-you"
          >
            {{ 'social.followsYou' | transloco }}
          </span>
        }
        @if (rel.friends || rel.following) {
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            [cdkMenuTriggerFor]="friendMenu"
            data-testid="friend-button"
          >
            <ng-icon name="lucideCheck" size="14" />
            {{ (rel.friends ? 'social.friends' : 'social.following') | transloco }}
          </button>
        } @else if (rel.canFollow) {
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            (click)="follow()"
            data-testid="friend-button"
          >
            <ng-icon name="lucideUserPlus" size="14" />
            {{ (rel.followsYou ? 'social.addBack' : 'social.addFriend') | transloco }}
          </button>
        }
        @if (rel.canMessage) {
          <a
            appButton
            variant="secondary"
            size="sm"
            [routerLink]="panelLink('messages', user().username)"
            [queryParamsHandling]="'merge'"
            data-testid="message-button"
          >
            <ng-icon name="lucideMessageCircle" size="14" />{{ 'social.message' | transloco }}
          </a>
        }
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md border-2 border-line transition-colors hover:bg-surface"
          [cdkMenuTriggerFor]="moreMenu"
          [attr.aria-label]="'social.more' | transloco"
          data-testid="profile-more"
        >
          <ng-icon name="lucideEllipsis" size="16" />
        </button>
      </div>

      <ng-template #friendMenu>
        <div
          cdkMenu
          class="mt-1 flex w-56 flex-col rounded-md border-2 border-line bg-surface p-1 text-sm text-text shadow-hard"
        >
          <button
            cdkMenuItem
            type="button"
            class="rounded-sm px-3 py-1.5 text-left hover:bg-shelf"
            (click)="unfollow()"
          >
            {{ (rel.friends ? 'social.removeFriend' : 'social.unfollow') | transloco }}
          </button>
        </div>
      </ng-template>
      <ng-template #moreMenu>
        <div
          cdkMenu
          class="mt-1 flex w-56 flex-col rounded-md border-2 border-line bg-surface p-1 text-sm text-text shadow-hard"
        >
          @if (rel.blocked) {
            <button
              cdkMenuItem
              type="button"
              class="rounded-sm px-3 py-1.5 text-left hover:bg-shelf"
              (click)="unblock()"
            >
              {{ 'social.unblock' | transloco }}
            </button>
          } @else {
            <button
              cdkMenuItem
              type="button"
              class="rounded-sm px-3 py-1.5 text-left text-danger hover:bg-shelf"
              (click)="block()"
            >
              {{ 'social.block' | transloco }}
            </button>
          }
          <button
            cdkMenuItem
            type="button"
            class="rounded-sm px-3 py-1.5 text-left hover:bg-shelf"
            (click)="report()"
            data-testid="report-user"
          >
            {{ 'reports.button' | transloco }}
          </button>
        </div>
      </ng-template>
    }
  `,
})
export class ProfileActionsComponent {
  protected readonly panelLink = panelLink;
  protected readonly profileUrl = profileUrl;
  private readonly api = inject(Api);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly reports = inject(ReportService);
  protected readonly auth = inject(AuthStore);

  readonly user = input.required<PublicUserDto>();
  /** The relation changed: the page reloads the profile (counters, buttons). */
  readonly changed = output<void>();
  protected readonly busy = signal(false);

  protected follow(): Promise<void> {
    return this.run(async () => {
      const rel = await this.api.invoke(socialFollow, { username: this.user().username });
      this.toast.success(
        this.t.translate(rel.friends ? 'social.toast.friends' : 'social.toast.followed', {
          name: this.user().displayName,
        }),
      );
    });
  }

  protected unfollow(): Promise<void> {
    return this.run(() => this.api.invoke(socialUnfollow, { username: this.user().username }));
  }

  protected async block(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('social.confirmBlock', { name: this.user().displayName }),
      message: this.t.translate('social.confirmBlockText'),
      confirmLabel: this.t.translate('social.block'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.invoke(blocksBlock, { userId: this.user().id });
      this.toast.success(this.t.translate('social.toast.blocked'));
    });
  }

  protected report(): Promise<void> {
    return this.reports.open({
      targetType: 'USER',
      targetId: this.user().id,
      name: this.user().displayName,
    });
  }

  protected unblock(): Promise<void> {
    return this.run(async () => {
      await this.api.invoke(blocksUnblock, { userId: this.user().id });
      this.toast.success(this.t.translate('social.toast.unblocked'));
    });
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
      this.changed.emit();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

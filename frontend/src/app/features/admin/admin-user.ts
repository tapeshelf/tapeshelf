import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideEye } from '@ng-icons/lucide';

import {
  Api,
  type AdminUserDetailDto,
  type Role,
  type Tier,
  adminUsersBan,
  adminUsersDelete,
  adminUsersDetail,
  adminUsersNotice,
  adminUsersPasswordReset,
  adminUsersResetTwoFactor,
  adminUsersUnban,
  adminUsersUpdate,
  adminUsersViewAs,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ViewAsService } from '../../core/admin/view-as.service';
import { AuthStore } from '../../core/auth/auth.store';
import { describeSubscription } from '../../core/billing/subscription-text';
import { LanguageService } from '../../core/i18n/language.service';
import { SiteConfig } from '../../core/site/site-config';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { PromptService } from '../../shared/ui/prompt/prompt-dialog';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AdminBadgeComponent, TABLE, TABLE_WRAP, TD, TH, apiMessage, toneOf } from './admin-ui';
import { AdminUserVideosComponent } from './admin-user-videos';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { profileLink } from '../../core/navigation/user-links';

/** One account: profile, quota, sessions, videos, reports and every action. */
@Component({
  selector: 'app-admin-user',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    BytesPipe,
    NgIcon,
    AlertComponent,
    AvatarComponent,
    ButtonDirective,
    InputDirective,
    ProgressBarComponent,
    SpinnerComponent,
    AdminBadgeComponent,
    AdminUserVideosComponent,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideEye })],
  template: `
    <a routerLink="../" class="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ng-icon name="lucideArrowLeft" size="14" />{{ 'admin.nav.users' | transloco }}
    </a>
    @if (error(); as message) {
      <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
    } @else if (u(); as u) {
      <header
        class="mt-3 flex flex-wrap items-start gap-4 rounded-lg border-2 border-line bg-surface p-4"
        data-testid="admin-user"
      >
        <app-avatar [url]="u.avatarUrl" [name]="u.displayName || u.username" [size]="64" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="max-w-full min-w-0 font-display text-xl font-semibold">
              {{ u.displayName || ('common.deletedUser' | transloco) }}
            </h2>
            <app-admin-badge [tone]="tone(u.status)" data-testid="admin-user-status">{{
              'admin.status.' + u.status | transloco
            }}</app-admin-badge>
            @if (u.pageHidden) {
              <app-admin-badge data-testid="admin-user-page-hidden">{{
                'admin.users.pageHidden' | transloco
              }}</app-admin-badge>
            }
          </div>
          <p class="font-mono text-sm text-muted">
            @if (u.status === 'ACTIVE') {
              <a [routerLink]="profileLink(u.username)" class="hover:underline"
                >&#64;{{ u.username }}</a
              >
            } @else {
              &#64;{{ u.username }}
            }
          </p>
          <p class="mt-1 text-sm break-all">
            {{ u.email ?? '—' }}
            @if (u.email && !u.emailVerified) {
              <app-admin-badge tone="warn">{{
                'admin.users.unverified' | transloco
              }}</app-admin-badge>
            }
          </p>
          <p class="mt-1 text-xs text-muted">
            {{
              'admin.users.joinedAt' | transloco: { date: (u.createdAt | appDate: 'mediumDate') }
            }}
            · {{ 'admin.users.lastLogin' | transloco }}:
            {{ u.lastLoginAt ? (u.lastLoginAt | appDate: 'short') : '—' }}
            · {{ 'admin.users.signIn' | transloco }}:
            {{ u.hasPassword ? ('admin.users.password' | transloco) : '' }}
            {{ u.providers.join(', ') }}
            · {{ 'admin.users.twoFactor' | transloco }}:
            <span data-testid="admin-user-two-factor">{{
              (u.twoFactor ? 'admin.users.twoFactorOn' : 'admin.users.twoFactorOff') | transloco
            }}</span>
          </p>
          @if (u.status === 'BANNED') {
            <app-alert kind="error" class="mt-3 block">
              {{
                'admin.users.bannedSince'
                  | transloco: { date: (u.bannedAt | appDate: 'short'), reason: u.banReason }
              }}
            </app-alert>
          }
          @if (u.status === 'DELETED') {
            <app-alert kind="warning" class="mt-3 block">
              {{ 'admin.users.deletedAt' | transloco: { date: (u.deletedAt | appDate: 'short') } }}
            </app-alert>
          }
        </div>
        @if (u.status !== 'DELETED') {
          <div class="flex flex-col gap-2">
            <label class="flex items-center justify-between gap-3 text-sm">
              <span class="label-mono text-muted">{{ 'admin.users.role' | transloco }}</span>
              <app-select
                size="sm"
                class="w-36"
                [ngModel]="u.role"
                [disabled]="busy() || isSelf()"
                (ngModelChange)="changeRole($event)"
                data-testid="admin-user-role"
              >
                <app-option [value]="'USER'">{{ 'admin.role.USER' | transloco }}</app-option>
                <app-option [value]="'ADMIN'">{{ 'admin.role.ADMIN' | transloco }}</app-option>
              </app-select>
            </label>
            @if (site.hasTiers()) {
              <label class="flex items-center justify-between gap-3 text-sm">
                <span class="label-mono text-muted">{{ 'admin.users.tier' | transloco }}</span>
                <app-select
                  size="sm"
                  class="w-36"
                  [ngModel]="u.tier"
                  [disabled]="busy()"
                  (ngModelChange)="changeTier($event)"
                  data-testid="admin-user-tier"
                >
                  <app-option [value]="'BASIC'">{{ 'common.tier.BASIC' | transloco }}</app-option>
                  <app-option [value]="'PREMIUM'">{{
                    'common.tier.PREMIUM' | transloco
                  }}</app-option>
                </app-select>
              </label>
              @if (u.tier === 'PREMIUM') {
                <label class="flex items-center justify-between gap-3 text-sm">
                  <span class="label-mono text-muted">{{
                    'admin.users.tierUntil' | transloco
                  }}</span>
                  <input
                    appInput="sm"
                    type="date"
                    class="w-36"
                    [min]="today"
                    [value]="untilDay(u)"
                    [disabled]="busy()"
                    (change)="changeUntil($any($event.target).value)"
                    data-testid="admin-user-tier-until"
                  />
                </label>
                <p class="text-right text-xs text-muted">
                  {{ 'admin.users.tierUntilHint' | transloco }}
                </p>
              }
              @if (subscriptionText(); as text) {
                <p class="text-right text-xs" data-testid="admin-user-subscription">
                  {{ 'admin.users.subscription' | transloco }}: {{ text }}
                </p>
              }
            }
          </div>
        }
      </header>

      @if (u.status !== 'DELETED') {
        <div class="mt-4 flex flex-wrap gap-2">
          @if (u.status === 'ACTIVE' && !isSelf()) {
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              (click)="viewAs(u)"
              data-testid="admin-view-as"
            >
              <ng-icon name="lucideEye" size="14" />{{ 'admin.users.viewAs' | transloco }}
            </button>
          }
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            (click)="notice(u)"
          >
            {{ 'admin.users.notice' | transloco }}
          </button>
          @if (u.email && u.status === 'ACTIVE') {
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              [disabled]="busy()"
              (click)="passwordReset(u)"
            >
              {{ 'admin.users.passwordReset' | transloco }}
            </button>
          }
          @if (u.twoFactor && !isSelf()) {
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              [disabled]="busy()"
              (click)="resetTwoFactor(u)"
            >
              {{ 'admin.users.twoFactorReset' | transloco }}
            </button>
          }
          @if (!isSelf() && u.role !== 'ADMIN') {
            @if (u.status === 'BANNED') {
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="unban(u)"
              >
                {{ 'admin.users.unban' | transloco }}
              </button>
            } @else {
              <button
                type="button"
                appButton
                variant="danger"
                size="sm"
                [disabled]="busy()"
                (click)="ban(u)"
                data-testid="admin-ban"
              >
                {{ 'admin.users.ban' | transloco }}
              </button>
            }
            <button
              type="button"
              appButton
              variant="danger"
              size="sm"
              [disabled]="busy()"
              (click)="remove(u)"
            >
              {{ 'admin.users.delete' | transloco }}
            </button>
          }
        </div>
      }

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <section class="rounded-lg border-2 border-line bg-surface p-4">
          <h3 class="label-mono mb-2 text-muted">{{ 'admin.users.quota' | transloco }}</h3>
          @if (u.quotaBytes > 0) {
            <p class="font-mono text-sm">
              {{ u.storageUsedBytes | bytes }} / {{ u.quotaBytes | bytes }}
            </p>
            <app-progress-bar
              class="mt-2 block"
              [label]="'a11y.quota' | transloco"
              [value]="quotaPercent()"
            />
          } @else {
            <p class="font-mono text-sm">
              {{ u.storageUsedBytes | bytes }} · {{ 'admin.users.noQuota' | transloco }}
            </p>
          }
        </section>
        <section class="rounded-lg border-2 border-line bg-surface p-4 lg:col-span-2">
          <h3 class="label-mono mb-2 text-muted">{{ 'admin.users.counts' | transloco }}</h3>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            @for (c of countKeys; track c) {
              <div class="flex justify-between gap-2">
                <dt class="text-muted">{{ 'admin.users.count.' + c | transloco }}</dt>
                <dd class="font-mono">{{ u.counts[c] }}</dd>
              </div>
            }
          </dl>
        </section>
      </div>

      <app-admin-user-videos [username]="u.username" />

      <h3 class="mt-8 mb-3 text-lg font-semibold">{{ 'admin.users.sessions' | transloco }}</h3>
      @if (u.sessions.length === 0) {
        <p class="text-sm text-muted">{{ 'admin.nothing' | transloco }}</p>
      } @else {
        <div [class]="tableWrap">
          <table [class]="table">
            <thead>
              <tr>
                <th [class]="th">{{ 'admin.users.device' | transloco }}</th>
                <th [class]="th">{{ 'admin.users.ip' | transloco }}</th>
                <th [class]="th">{{ 'admin.users.lastUsed' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (s of u.sessions; track s.id) {
                <tr>
                  <td [class]="td" class="max-w-md truncate text-xs">{{ s.userAgent ?? '—' }}</td>
                  <td [class]="td" class="font-mono text-xs">{{ s.ip ?? '—' }}</td>
                  <td [class]="td" class="whitespace-nowrap">
                    {{ s.lastUsedAt | appDate: 'short' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <h3 class="mt-8 mb-3 text-lg font-semibold">{{ 'admin.users.reportsTitle' | transloco }}</h3>
      @if (u.reports.length === 0) {
        <p class="text-sm text-muted">{{ 'admin.nothing' | transloco }}</p>
      } @else {
        <ul
          class="flex flex-col divide-y divide-line/10 rounded-lg border-2 border-line bg-surface"
        >
          @for (r of u.reports; track r.id) {
            <li class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <app-admin-badge [tone]="tone(r.status)">{{
                'admin.reports.tab.' + r.status | transloco
              }}</app-admin-badge>
              <span class="font-semibold">{{
                'admin.reports.reason.' + r.reason | transloco
              }}</span>
              <span class="truncate text-muted">{{
                r.video?.title ?? ('admin.reports.profileShort' | transloco)
              }}</span>
              <span class="ml-auto font-mono text-xs text-muted"
                >&#64;{{ r.reporter.username }} · {{ r.createdAt | appDate: 'short' }}</span
              >
            </li>
          }
        </ul>
      }
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminUserPage {
  protected readonly profileLink = profileLink;
  /** Tiers exist only in the cloud: no tier or Pro end date self-hosted. */
  protected readonly site = inject(SiteConfig);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  /** The Paddle subscription behind a Pro (cloud): an admin's change is overridden by its next event. */
  protected readonly subscriptionText = computed(() => {
    this.language.loaded();
    const s = this.u()?.subscription;
    return s ? describeSubscription(s, (key, params) => this.t.translate(key, params)) : null;
  });
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly prompt = inject(PromptService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly viewAsService = inject(ViewAsService);

  readonly id = input.required<string>();
  protected readonly u = signal<AdminUserDetailDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly tone = toneOf;
  protected readonly isSelf = computed(() => this.u()?.id === this.auth.user()?.id);
  protected readonly quotaPercent = computed(() => {
    const u = this.u();
    return u && u.quotaBytes > 0 ? Math.min(100, (u.storageUsedBytes / u.quotaBytes) * 100) : 0;
  });
  protected readonly countKeys = [
    'videos',
    'received',
    'followers',
    'following',
    'openRequests',
    'reportsAgainst',
    'reportsFiled',
  ] as const;
  protected readonly today = localDay(new Date());
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected async changeRole(role: Role): Promise<void> {
    const u = this.u()!;
    const ok = await this.confirm.confirm({
      title: this.t.translate('admin.users.confirmRole', {
        name: u.username,
        role: this.t.translate(`admin.role.${role}`),
      }),
      confirmLabel: this.t.translate('common.save'),
    });
    if (!ok) {
      this.u.set({ ...u });
      return;
    }
    await this.run(() => this.api.invoke(adminUsersUpdate, { id: u.id, body: { role } }));
  }

  protected changeTier(tier: Tier): Promise<void> {
    return this.run(() => this.api.invoke(adminUsersUpdate, { id: this.u()!.id, body: { tier } }));
  }

  /** The last day of Pro, inclusive: the tier ends at the following local midnight. */
  protected changeUntil(day: string): Promise<void> {
    const [y, m, d] = day.split('-').map(Number);
    const tierUntil = day ? new Date(y!, m! - 1, d! + 1).toISOString() : null;
    return this.run(() =>
      this.api.invoke(adminUsersUpdate, { id: this.u()!.id, body: { tierUntil } }),
    );
  }

  protected untilDay(u: AdminUserDetailDto): string {
    return u.tierUntil ? localDay(new Date(new Date(u.tierUntil).getTime() - 1)) : '';
  }

  protected async ban(u: AdminUserDetailDto): Promise<void> {
    const reason = await this.prompt.prompt({
      title: this.t.translate('admin.users.banTitle', { name: u.username }),
      message: this.t.translate('admin.users.banText'),
      label: this.t.translate('admin.users.banReason'),
      confirmLabel: this.t.translate('admin.users.ban'),
      danger: true,
      required: true,
      multiline: true,
      maxLength: 1000,
    });
    if (!reason) return;
    await this.run(() => this.api.invoke(adminUsersBan, { id: u.id, body: { reason } }));
  }

  protected async unban(u: AdminUserDetailDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('admin.users.unbanTitle', { name: u.username }),
      confirmLabel: this.t.translate('admin.users.unban'),
    });
    if (ok) await this.run(() => this.api.invoke(adminUsersUnban, { id: u.id }));
  }

  protected async remove(u: AdminUserDetailDto): Promise<void> {
    const typed = await this.prompt.prompt({
      title: this.t.translate('admin.users.deleteTitle', { name: u.username }),
      message: this.t.translate('admin.users.deleteText'),
      label: this.t.translate('admin.users.typeUsername', { name: u.username }),
      confirmLabel: this.t.translate('admin.users.deleteForever'),
      danger: true,
      expect: u.username,
    });
    if (typed === null) return;
    await this.run(() => this.api.invoke(adminUsersDelete, { id: u.id, body: {} }));
  }

  protected async notice(u: AdminUserDetailDto): Promise<void> {
    const message = await this.prompt.prompt({
      title: this.t.translate('admin.users.noticeTitle', { name: u.username }),
      label: this.t.translate('admin.users.noticeLabel'),
      confirmLabel: this.t.translate('admin.users.noticeSend'),
      required: true,
      multiline: true,
      maxLength: 2000,
    });
    if (!message) return;
    await this.run(
      () => this.api.invoke(adminUsersNotice, { id: u.id, body: { message } }),
      'admin.users.noticeSent',
    );
  }

  protected async passwordReset(u: AdminUserDetailDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('admin.users.passwordResetTitle', { email: u.email }),
      confirmLabel: this.t.translate('admin.users.passwordReset'),
    });
    if (ok)
      await this.run(
        () => this.api.invoke(adminUsersPasswordReset, { id: u.id }),
        'admin.users.passwordResetSent',
      );
  }

  /** A lost phone and lost codes: only after checking it is the owner who asks. */
  protected async resetTwoFactor(u: AdminUserDetailDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('admin.users.twoFactorResetTitle', { username: u.username }),
      message: this.t.translate('admin.users.twoFactorResetMessage'),
      confirmLabel: this.t.translate('admin.users.twoFactorReset'),
      danger: true,
    });
    if (ok)
      await this.run(
        () => this.api.invoke(adminUsersResetTwoFactor, { id: u.id }),
        'admin.users.twoFactorResetDone',
      );
  }

  /** Read-only look at the site as this user: the banner on top leads back here. */
  protected async viewAs(u: AdminUserDetailDto): Promise<void> {
    try {
      const target = await this.api.invoke(adminUsersViewAs, { id: u.id });
      this.viewAsService.set({ ...target, returnTo: `/admin/users/${u.id}` });
      await this.auth.load();
      await this.router.navigate(profileLink(target.username));
    } catch (e) {
      this.viewAsService.clear();
      this.toast.error(apiMessage(e, this.t));
    }
  }

  private async run(fn: () => Promise<unknown>, done = 'admin.done'): Promise<void> {
    this.busy.set(true);
    try {
      const result = await fn();
      this.toast.success(this.t.translate(done));
      if (result && typeof result === 'object' && 'counts' in result)
        this.u.set(result as AdminUserDetailDto);
      else await this.load(this.id());
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
      await this.load(this.id());
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      this.u.set(await this.api.invoke(adminUsersDetail, { id }));
      this.error.set(null);
    } catch (e) {
      this.error.set(apiMessage(e, this.t));
    }
  }
}

/** yyyy-mm-dd of a moment in the local time zone (what <input type="date"> shows). */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

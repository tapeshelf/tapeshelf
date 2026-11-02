import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type AdminUserRowDto,
  type AdminUserSort,
  type Role,
  type Tier,
  type UserStatus,
  adminUsersList,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { SiteConfig } from '../../core/site/site-config';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  AdminBadgeComponent,
  AdminMoreComponent,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  apiMessage,
  toneOf,
  type RowsMode,
  fetchRows,
} from './admin-ui';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

interface Filters {
  q: string;
  status: UserStatus | '';
  role: Role | '';
  tier: Tier | '';
  sort: AdminUserSort;
}

/** Users: search by email or name, filters, sorting. */
@Component({
  selector: 'app-admin-users',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    BytesPipe,
    AlertComponent,
    AvatarComponent,
    InputDirective,
    SpinnerComponent,
    AdminBadgeComponent,
    AdminMoreComponent,
  ],
  template: `
    <div class="mb-4 flex flex-wrap gap-2">
      <input
        appInput
        type="search"
        maxlength="64"
        class="min-w-56 flex-1"
        [placeholder]="'admin.users.search' | transloco"
        [attr.aria-label]="'admin.users.search' | transloco"
        [value]="filters().q"
        (input)="search($any($event.target).value)"
        data-testid="admin-users-search"
      />
      <app-select
        [ariaLabel]="'admin.filterLabel.status' | transloco"
        class="w-auto"
        [ngModel]="filters().status"
        (ngModelChange)="set('status', $event)"
      >
        <app-option [value]="''">{{ 'admin.anyStatus' | transloco }}</app-option>
        @for (s of statuses; track s) {
          <app-option [value]="s">{{ 'admin.status.' + s | transloco }}</app-option>
        }
      </app-select>
      <app-select
        [ariaLabel]="'admin.filterLabel.role' | transloco"
        class="w-auto"
        [ngModel]="filters().role"
        (ngModelChange)="set('role', $event)"
      >
        <app-option [value]="''">{{ 'admin.users.anyRole' | transloco }}</app-option>
        <app-option [value]="'USER'">{{ 'admin.role.USER' | transloco }}</app-option>
        <app-option [value]="'ADMIN'">{{ 'admin.role.ADMIN' | transloco }}</app-option>
      </app-select>
      @if (site.hasTiers()) {
        <app-select
          [ariaLabel]="'admin.filterLabel.tier' | transloco"
          class="w-auto"
          [ngModel]="filters().tier"
          (ngModelChange)="set('tier', $event)"
        >
          <app-option [value]="''">{{ 'admin.users.anyTier' | transloco }}</app-option>
          <app-option [value]="'BASIC'">{{ 'common.tier.BASIC' | transloco }}</app-option>
          <app-option [value]="'PREMIUM'">{{ 'common.tier.PREMIUM' | transloco }}</app-option>
        </app-select>
      }
      <app-select
        [ariaLabel]="'admin.filterLabel.sort' | transloco"
        class="w-auto"
        [ngModel]="filters().sort"
        (ngModelChange)="set('sort', $event)"
      >
        @for (s of sorts; track s) {
          <app-option [value]="s">{{ 'admin.users.sort.' + s | transloco }}</app-option>
        }
      </app-select>
    </div>

    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else {
      <div [class]="tableWrap">
        <table [class]="table" data-testid="admin-users">
          <thead>
            <tr>
              <th [class]="th">{{ 'admin.users.user' | transloco }}</th>
              <th [class]="th">{{ 'admin.users.email' | transloco }}</th>
              <th [class]="th">{{ 'admin.users.access' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.users.videos' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.users.storage' | transloco }}</th>
              <th [class]="th">{{ 'admin.users.joined' | transloco }}</th>
              <th [class]="th">{{ 'admin.users.lastLogin' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (u of items(); track u.id) {
              <tr class="hover:bg-surface-2">
                <td [class]="td">
                  <a [routerLink]="[u.id]" class="flex items-center gap-2.5">
                    <app-avatar
                      [url]="u.avatarUrl"
                      [name]="u.displayName || u.username"
                      [size]="30"
                    />
                    <span class="min-w-0">
                      <span class="block truncate font-semibold">{{
                        u.displayName || ('common.deletedUser' | transloco)
                      }}</span>
                      <span class="block font-mono text-xs text-muted">&#64;{{ u.username }}</span>
                    </span>
                  </a>
                </td>
                <td [class]="td">
                  <span class="break-all">{{ u.email ?? '—' }}</span>
                  @if (u.email && !u.emailVerified) {
                    <app-admin-badge tone="warn">{{
                      'admin.users.unverified' | transloco
                    }}</app-admin-badge>
                  }
                </td>
                <td [class]="td">
                  <span class="flex flex-wrap gap-1">
                    <app-admin-badge [tone]="tone(u.status)">{{
                      'admin.status.' + u.status | transloco
                    }}</app-admin-badge>
                    @if (u.role === 'ADMIN') {
                      <app-admin-badge tone="accent">{{
                        'admin.role.ADMIN' | transloco
                      }}</app-admin-badge>
                    }
                    @if (site.hasTiers() && u.tier === 'PREMIUM') {
                      <app-admin-badge tone="ok">{{
                        'common.tier.PREMIUM' | transloco
                      }}</app-admin-badge>
                    }
                  </span>
                </td>
                <td [class]="td" class="text-right font-mono">{{ u.videoCount }}</td>
                <td [class]="td" class="text-right font-mono whitespace-nowrap">
                  {{ u.storageUsedBytes | bytes }}
                </td>
                <td [class]="td" class="whitespace-nowrap">
                  {{ u.createdAt | appDate: 'mediumDate' }}
                </td>
                <td [class]="td" class="whitespace-nowrap text-muted">
                  {{ u.lastLoginAt ? (u.lastLoginAt | appDate: 'short') : '—' }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td [class]="td" colspan="7" class="py-8 text-center text-muted">
                  {{ 'admin.nothing' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-admin-more [total]="total()" [count]="items().length" [load]="more" />
    }
  `,
})
export class AdminUsersPage {
  private readonly api = inject(Api);
  /** Tiers exist only in the cloud: no tier filter or Pro badge self-hosted. */
  protected readonly site = inject(SiteConfig);
  private readonly t = inject(TranslocoService);

  protected readonly statuses: UserStatus[] = ['ACTIVE', 'BANNED', 'DELETED'];
  protected readonly sorts: AdminUserSort[] = ['created', 'lastLogin', 'storage', 'username'];
  protected readonly filters = signal<Filters>({
    q: '',
    status: '',
    role: '',
    tier: '',
    sort: 'created',
  });
  protected readonly items = signal<AdminUserRowDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tone = toneOf;
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const f = this.filters();
      untracked(() => void this.load(f, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load(this.filters(), 'more');

  protected search(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.set('q', q), 300);
  }

  protected set<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  private async load(f: Filters, mode: RowsMode): Promise<void> {
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminUsersList, {
          q: f.q || undefined,
          status: f.status || undefined,
          role: f.role || undefined,
          tier: f.tier || undefined,
          sort: f.sort,
          offset,
          limit,
        }),
      );
      if (f !== this.filters()) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (f === this.filters()) this.error.set(apiMessage(e, this.t));
    }
  }
}

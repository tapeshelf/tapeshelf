import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type AdminReportDto,
  type ReportAction,
  type ReportStatus,
  adminReportsDismiss,
  adminReportsList,
  adminReportsResolve,
  adminUsersNotice,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { PromptService } from '../../shared/ui/prompt/prompt-dialog';
import { TakedownService } from './takedown-dialog';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AdminCounters } from './admin-layout';
import {
  AdminBadgeComponent,
  AdminMoreComponent,
  apiMessage,
  toneOf,
  type RowsMode,
  fetchRows,
} from './admin-ui';

const TABS: ReportStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];

/**
 * Reports: the open queue, oldest first. A decision closes every
 * open report on the same video or profile and tells each reporter.
 */
@Component({
  selector: 'app-admin-reports',
  imports: [
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    AlertComponent,
    AvatarComponent,
    ButtonDirective,
    SpinnerComponent,
    AdminBadgeComponent,
    AdminMoreComponent,
  ],
  template: `
    <nav class="mb-4 flex gap-1 border-b-2 border-line" role="tablist">
      @for (s of tabs; track s) {
        <button
          type="button"
          role="tab"
          class="-mb-0.5 border-b-[3px] px-3 py-2 text-sm font-medium transition-colors"
          [class]="
            status() === s
              ? 'border-accent text-text'
              : 'border-transparent text-muted hover:text-text'
          "
          [attr.aria-selected]="status() === s"
          (click)="status.set(s)"
        >
          {{ 'admin.reports.tab.' + s | transloco }}
        </button>
      }
    </nav>

    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else if (items().length === 0) {
      <p class="rounded-lg border-2 border-dashed border-line/40 p-10 text-center text-muted">
        {{ 'admin.reports.empty.' + status() | transloco }}
      </p>
    } @else {
      <ul class="flex flex-col gap-3" data-testid="admin-reports">
        @for (r of items(); track r.id) {
          <li
            class="grid gap-4 rounded-lg border-2 border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto]"
            data-testid="admin-report"
          >
            <div class="flex min-w-0 gap-4">
              @if (r.video; as v) {
                <a [routerLink]="['../videos', v.id]" class="shrink-0" [attr.aria-label]="v.title">
                  @if (v.thumbnailUrl) {
                    <img
                      [src]="v.thumbnailUrl"
                      alt=""
                      class="h-16 w-28 rounded-md border-2 border-line object-cover"
                    />
                  } @else {
                    <span
                      class="block h-16 w-28 rounded-md border-2 border-line bg-surface-3"
                    ></span>
                  }
                </a>
              } @else {
                <app-avatar
                  [url]="r.targetUser.avatarUrl"
                  [name]="r.targetUser.displayName || r.targetUser.username"
                  [size]="56"
                />
              }
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <app-admin-badge tone="accent">{{
                    'admin.reports.reason.' + r.reason | transloco
                  }}</app-admin-badge>
                  @if (r.video; as v) {
                    <a
                      [routerLink]="['../videos', v.id]"
                      class="truncate font-semibold hover:underline"
                      >{{ v.title }}</a
                    >
                    @if (v.deletedAt) {
                      <app-admin-badge tone="bad">{{
                        'admin.videos.deleted' | transloco
                      }}</app-admin-badge>
                    }
                  } @else {
                    <a
                      [routerLink]="['../users', r.targetUser.id]"
                      class="truncate font-semibold hover:underline"
                      >{{ r.targetUser.displayName || r.targetUser.username }}</a
                    >
                  }
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ (r.video ? 'admin.reports.author' : 'admin.reports.profile') | transloco }}
                  <a [routerLink]="['../users', r.targetUser.id]" class="font-mono hover:underline"
                    >&#64;{{ r.targetUser.username }}</a
                  >
                  @if (r.targetUser.status !== 'ACTIVE') {
                    <app-admin-badge [tone]="tone(r.targetUser.status)">{{
                      'admin.status.' + r.targetUser.status | transloco
                    }}</app-admin-badge>
                  }
                </p>
                @if (r.comment) {
                  <p class="mt-2 text-sm whitespace-pre-line">“{{ r.comment }}”</p>
                }
                <p class="mt-2 text-xs text-muted">
                  {{ 'admin.reports.from' | transloco }}
                  <a [routerLink]="['../users', r.reporter.id]" class="font-mono hover:underline"
                    >&#64;{{ r.reporter.username }}</a
                  >
                  · {{ r.createdAt | appDate: 'short' }}
                  @if (r.openOnTarget > 1) {
                    ·
                    <span class="font-semibold text-text">{{
                      'admin.reports.more' | transloco: { count: r.openOnTarget }
                    }}</span>
                  }
                </p>
                @if (r.status !== 'OPEN') {
                  <p class="mt-2 text-xs">
                    <app-admin-badge [tone]="tone(r.status)">{{
                      'admin.reports.tab.' + r.status | transloco
                    }}</app-admin-badge>
                    @if (r.action) {
                      {{ 'admin.reports.action.' + r.action | transloco }}
                    }
                    @if (r.resolvedAt) {
                      · {{ r.resolvedAt | appDate: 'short' }}
                    }
                    @if (r.note) {
                      · <span class="text-muted">{{ r.note }}</span>
                    }
                  </p>
                }
              </div>
            </div>
            @if (r.status === 'OPEN') {
              <div
                class="flex flex-wrap content-start items-start gap-2 md:w-56 md:flex-col md:items-stretch"
              >
                @if (r.video && !r.video.deletedAt) {
                  <button
                    type="button"
                    appButton
                    variant="danger"
                    size="sm"
                    [disabled]="busy()"
                    (click)="resolve(r, 'DELETE_VIDEO')"
                    data-testid="report-delete-video"
                  >
                    {{ 'admin.reports.deleteVideo' | transloco }}
                  </button>
                }
                @if (r.targetUser.status === 'ACTIVE') {
                  <button
                    type="button"
                    appButton
                    variant="danger"
                    size="sm"
                    [disabled]="busy()"
                    (click)="resolve(r, 'BAN_USER')"
                  >
                    {{
                      (r.video ? 'admin.reports.banAuthor' : 'admin.reports.banUser') | transloco
                    }}
                  </button>
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    size="sm"
                    [disabled]="busy()"
                    (click)="notice(r)"
                  >
                    {{ 'admin.users.notice' | transloco }}
                  </button>
                }
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="sm"
                  [disabled]="busy()"
                  (click)="resolve(r, 'NONE')"
                >
                  {{ 'admin.reports.resolveNone' | transloco }}
                </button>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="dismiss(r)"
                  data-testid="report-dismiss"
                >
                  {{ 'admin.reports.dismiss' | transloco }}
                </button>
              </div>
            }
          </li>
        }
      </ul>
      <app-admin-more [total]="total()" [count]="items().length" [load]="more" />
    }
  `,
})
export class AdminReportsPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly prompt = inject(PromptService);
  private readonly takedown = inject(TakedownService);
  private readonly counters = inject(AdminCounters);

  protected readonly tabs = TABS;
  protected readonly status = signal<ReportStatus>('OPEN');
  protected readonly items = signal<AdminReportDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tone = toneOf;

  constructor() {
    effect(() => {
      const status = this.status();
      untracked(() => void this.load(status, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load(this.status(), 'more');

  protected async resolve(r: AdminReportDto, action: ReportAction): Promise<void> {
    if (action === 'DELETE_VIDEO') return this.takeDown(r);
    const ban = action === 'BAN_USER';
    const note = await this.prompt.prompt({
      title: this.t.translate(`admin.reports.confirm.${action}`, {
        name: r.video?.title ?? r.targetUser.username,
        count: r.openOnTarget,
      }),
      message: this.t.translate('admin.reports.closesAll', { count: r.openOnTarget }),
      label: this.t.translate(ban ? 'admin.users.banReason' : 'admin.reports.note'),
      confirmLabel: this.t.translate(`admin.reports.action.${action}`),
      danger: action !== 'NONE',
      required: ban,
      multiline: true,
    });
    if (note === null) return;
    await this.run(() =>
      this.api.invoke(adminReportsResolve, { id: r.id, body: { action, note: note || undefined } }),
    );
  }

  /** Removal on a report: the reported rule goes to the author, the file is blocked by default. */
  private async takeDown(r: AdminReportDto): Promise<void> {
    const decision = await this.takedown.ask({
      title: this.t.translate('admin.reports.confirm.DELETE_VIDEO', {
        name: r.video?.title ?? r.targetUser.username,
        count: r.openOnTarget,
      }),
      text: this.t.translate('admin.reports.closesAll', { count: r.openOnTarget }),
      confirmLabel: this.t.translate('admin.reports.deleteVideo'),
      rule: r.reason,
      withNote: true,
      blockByDefault: true,
    });
    if (!decision) return;
    await this.run(() =>
      this.api.invoke(adminReportsResolve, {
        id: r.id,
        body: {
          action: 'DELETE_VIDEO',
          note: decision.note || undefined,
          message: decision.message || undefined,
          blockFile: decision.blockFile,
        },
      }),
    );
  }

  protected async dismiss(r: AdminReportDto): Promise<void> {
    const note = await this.prompt.prompt({
      title: this.t.translate('admin.reports.confirm.dismiss', { count: r.openOnTarget }),
      message: this.t.translate('admin.reports.closesAll', { count: r.openOnTarget }),
      label: this.t.translate('admin.reports.note'),
      confirmLabel: this.t.translate('admin.reports.dismiss'),
      multiline: true,
    });
    if (note === null) return;
    await this.run(() =>
      this.api.invoke(adminReportsDismiss, { id: r.id, body: { note: note || undefined } }),
    );
  }

  protected async notice(r: AdminReportDto): Promise<void> {
    const message = await this.prompt.prompt({
      title: this.t.translate('admin.users.noticeTitle', { name: r.targetUser.username }),
      label: this.t.translate('admin.users.noticeLabel'),
      confirmLabel: this.t.translate('admin.users.noticeSend'),
      required: true,
      multiline: true,
      maxLength: 2000,
    });
    if (!message) return;
    try {
      await this.api.invoke(adminUsersNotice, { id: r.targetUser.id, body: { message } });
      this.toast.success(this.t.translate('admin.users.noticeSent'));
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
    }
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.toast.success(this.t.translate('admin.done'));
      await this.load(this.status(), 'again');
      void this.counters.refresh();
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(status: ReportStatus, mode: RowsMode): Promise<void> {
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminReportsList, { status, offset, limit }),
      );
      if (status !== this.status()) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (status === this.status()) this.error.set(apiMessage(e, this.t));
    }
  }
}

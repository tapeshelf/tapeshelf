import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type AdminSupportRowDto,
  type SupportPriority,
  type SupportStatus,
  type SupportTopic,
  adminSupportList,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  AdminBadgeComponent,
  AdminMoreComponent,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  type RowsMode,
  type Tone,
  apiMessage,
  fetchRows,
} from './admin-ui';

export const SUPPORT_STATUSES: SupportStatus[] = ['OPEN', 'WAITING', 'RESOLVED', 'CLOSED'];
export const SUPPORT_PRIORITIES: SupportPriority[] = ['HIGH', 'NORMAL', 'LOW'];
const TOPICS: SupportTopic[] = ['QUESTION', 'BUG', 'ACCOUNT', 'IDEA'];

/** Waiting for support is the admin's move; solved is done; the rest is quiet. */
export function supportTone(status: SupportStatus): Tone {
  return status === 'OPEN' ? 'warn' : status === 'RESOLVED' ? 'ok' : 'muted';
}

export function priorityTone(priority: SupportPriority): Tone {
  return priority === 'HIGH' ? 'bad' : 'muted';
}

interface Query {
  q: string;
  status: SupportStatus | '';
  topic: SupportTopic | '';
  priority: SupportPriority | '';
}

/** Support: tickets waiting for support first, the urgent first, then the rest. */
@Component({
  selector: 'app-admin-support',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    InputDirective,
    SelectComponent,
    OptionComponent,
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
        [placeholder]="'admin.support.search' | transloco"
        [attr.aria-label]="'admin.support.search' | transloco"
        (input)="search($any($event.target).value)"
        data-testid="admin-support-search"
      />
      <app-select
        class="w-auto"
        [ariaLabel]="'admin.filterLabel.status' | transloco"
        [ngModel]="status()"
        (ngModelChange)="status.set($event)"
      >
        <app-option [value]="''">{{ 'admin.anyStatus' | transloco }}</app-option>
        @for (s of statuses; track s) {
          <app-option [value]="s">{{ 'admin.support.status.' + s | transloco }}</app-option>
        }
      </app-select>
      <app-select
        class="w-auto"
        [ariaLabel]="'admin.support.topic' | transloco"
        [ngModel]="topic()"
        (ngModelChange)="topic.set($event)"
      >
        <app-option [value]="''">{{ 'admin.support.anyTopic' | transloco }}</app-option>
        @for (t of topics; track t) {
          <app-option [value]="t">{{ 'admin.support.topics.' + t | transloco }}</app-option>
        }
      </app-select>
      <app-select
        class="w-auto"
        [ariaLabel]="'admin.support.priority' | transloco"
        [ngModel]="priority()"
        (ngModelChange)="priority.set($event)"
      >
        <app-option [value]="''">{{ 'admin.support.anyPriority' | transloco }}</app-option>
        @for (p of priorities; track p) {
          <app-option [value]="p">{{ 'admin.support.priorities.' + p | transloco }}</app-option>
        }
      </app-select>
    </div>
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else {
      <div [class]="tableWrap">
        <table [class]="table" data-testid="admin-support-table">
          <thead>
            <tr>
              <th [class]="th">{{ 'admin.support.subject' | transloco }}</th>
              <th [class]="th">{{ 'admin.support.user' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.status' | transloco }}</th>
              <th [class]="th">{{ 'admin.support.activity' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of items(); track r.id) {
              <tr class="hover:bg-surface-2">
                <td [class]="td">
                  <a [routerLink]="[r.id]" class="block max-w-sm hover:underline">
                    <span class="font-mono text-xs text-muted">#{{ r.number }}</span>
                    {{ r.subject }}
                  </a>
                  <span class="label-mono text-muted">{{
                    'admin.support.topics.' + r.topic | transloco
                  }}</span>
                </td>
                <td [class]="td">
                  <a
                    [routerLink]="['/admin/users', r.user.id]"
                    class="font-mono text-xs hover:underline"
                    >&#64;{{ r.user.username }}</a
                  >
                </td>
                <td [class]="td">
                  <span class="flex flex-wrap items-center gap-1">
                    <app-admin-badge [tone]="tone(r.status)">{{
                      'admin.support.status.' + r.status | transloco
                    }}</app-admin-badge>
                    @if (r.priority !== 'NORMAL') {
                      <app-admin-badge [tone]="priorityTone(r.priority)">{{
                        'admin.support.priorities.' + r.priority | transloco
                      }}</app-admin-badge>
                    }
                    @if (r.helped !== null) {
                      <span class="font-mono text-xs text-muted">{{
                        (r.helped ? 'admin.support.helped' : 'admin.support.notHelped') | transloco
                      }}</span>
                    }
                  </span>
                </td>
                <td [class]="td" class="whitespace-nowrap">
                  {{ r.activityAt | appDate: 'short' }}
                  <span class="block font-mono text-xs text-muted">{{
                    'admin.support.messages' | transloco: { count: r.messages }
                  }}</span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td [class]="td" colspan="4" class="py-8 text-center text-muted">
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
export class AdminSupportPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  protected readonly statuses = SUPPORT_STATUSES;
  protected readonly topics = TOPICS;
  protected readonly priorities = SUPPORT_PRIORITIES;
  protected readonly q = signal('');
  protected readonly status = signal<SupportStatus | ''>('');
  protected readonly topic = signal<SupportTopic | ''>('');
  protected readonly priority = signal<SupportPriority | ''>('');
  protected readonly items = signal<AdminSupportRowDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tone = supportTone;
  protected readonly priorityTone = priorityTone;
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => void this.load(query, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load(this.query(), 'more');

  protected search(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.q.set(q.trim().replace(/^@/, '')), 300);
  }

  private query(): Query {
    return { q: this.q(), status: this.status(), topic: this.topic(), priority: this.priority() };
  }

  private async load(query: Query, mode: RowsMode): Promise<void> {
    const generation = mode === 'more' ? this.generation : ++this.generation;
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminSupportList, {
          q: query.q || undefined,
          status: query.status || undefined,
          topic: query.topic || undefined,
          priority: query.priority || undefined,
          offset,
          limit,
        }),
      );
      if (generation !== this.generation) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (generation === this.generation) this.error.set(apiMessage(e, this.t));
    }
  }
}

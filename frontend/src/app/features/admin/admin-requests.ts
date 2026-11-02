import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type AdminRequestDto, type RequestStatus, adminRequests } from '../../api';
import { AlertComponent } from '../../shared/ui/alert/alert';
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

const STATUSES: RequestStatus[] = [
  'OPEN',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'BLOCKED',
  'INVALIDATED',
];

/** Requests and trades: every negotiation with its real status, read-only. */
@Component({
  selector: 'app-admin-requests',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    AlertComponent,
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
        [placeholder]="'admin.requests.search' | transloco"
        [attr.aria-label]="'admin.requests.search' | transloco"
        (input)="search($any($event.target).value)"
      />
      <app-select
        class="w-auto"
        [ariaLabel]="'admin.filterLabel.status' | transloco"
        [ngModel]="status()"
        (ngModelChange)="status.set($event)"
      >
        <app-option [value]="''">{{ 'admin.anyStatus' | transloco }}</app-option>
        @for (s of statuses; track s) {
          <app-option [value]="s">{{ 'admin.requestStatus.' + s | transloco }}</app-option>
        }
      </app-select>
    </div>
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else {
      <div [class]="tableWrap">
        <table [class]="table">
          <thead>
            <tr>
              <th [class]="th">{{ 'admin.requests.parties' | transloco }}</th>
              <th [class]="th">{{ 'admin.requests.videos' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.status' | transloco }}</th>
              <th [class]="th">{{ 'admin.requests.updated' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of items(); track r.id) {
              <tr class="hover:bg-surface-2">
                <td [class]="td">
                  <a [routerLink]="[r.id]" class="font-mono text-xs hover:underline">
                    &#64;{{ r.requester.username }} → &#64;{{ r.holder.username }}
                  </a>
                </td>
                <td [class]="td">
                  <span class="block max-w-xs truncate">{{ titles(r) }}</span>
                </td>
                <td [class]="td">
                  <span class="flex flex-wrap items-center gap-1">
                    <app-admin-badge [tone]="tone(r.status)">{{
                      'admin.requestStatus.' + r.status | transloco
                    }}</app-admin-badge>
                    @if (r.round > 0) {
                      <span class="font-mono text-xs text-muted">{{
                        'admin.requests.round' | transloco: { round: r.round }
                      }}</span>
                    }
                  </span>
                </td>
                <td [class]="td" class="whitespace-nowrap">{{ r.updatedAt | appDate: 'short' }}</td>
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
export class AdminRequestsPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  protected readonly statuses = STATUSES;
  protected readonly q = signal('');
  protected readonly status = signal<RequestStatus | ''>('');
  protected readonly items = signal<AdminRequestDto[]>([]);
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
      const query = { q: this.q(), status: this.status() };
      untracked(() => void this.load(query, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load({ q: this.q(), status: this.status() }, 'more');

  protected titles(r: AdminRequestDto): string {
    return r.requested.map((v) => v.title).join(', ');
  }

  protected search(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.q.set(q.trim().replace(/^@/, ''));
    }, 300);
  }

  private generation = 0;

  private async load(
    query: { q: string; status: RequestStatus | '' },
    mode: RowsMode,
  ): Promise<void> {
    const generation = mode === 'more' ? this.generation : ++this.generation;
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminRequests, {
          q: query.q || undefined,
          status: query.status || undefined,
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

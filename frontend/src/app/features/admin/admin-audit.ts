import { JsonPipe } from '@angular/common';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type AuditAction, type AuditEntryDto, adminAudit } from '../../api';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  AdminMoreComponent,
  type RowsMode,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  apiMessage,
  fetchRows,
} from './admin-ui';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

const ACTIONS: AuditAction[] = [
  'user.ban',
  'user.unban',
  'user.role',
  'user.tier',
  'user.passwordReset',
  'user.notice',
  'user.delete',
  'user.viewAs',
  'video.update',
  'video.delete',
  'video.reprocess',
  'video.purge',
  'video.restore',
  'video.edit',
  'report.resolve',
  'report.dismiss',
  'settings.update',
];

/** Audit: who did what to what, newest first. */
@Component({
  selector: 'app-admin-audit',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    JsonPipe,
    AlertComponent,
    InputDirective,
    SpinnerComponent,
    AdminMoreComponent,
  ],
  template: `
    <div class="mb-4 flex flex-wrap gap-2">
      <app-select
        class="w-auto"
        [ariaLabel]="'admin.filterLabel.action' | transloco"
        [ngModel]="action()"
        (ngModelChange)="action.set($event)"
      >
        <app-option [value]="''">{{ 'admin.audit.anyAction' | transloco }}</app-option>
        @for (a of actions; track a) {
          <app-option [value]="a">{{ 'admin.audit.action.' + a | transloco }}</app-option>
        }
      </app-select>
      <input
        appInput
        type="search"
        maxlength="64"
        class="w-48"
        [placeholder]="'admin.audit.actor' | transloco"
        [attr.aria-label]="'admin.audit.actor' | transloco"
        (input)="search($any($event.target).value)"
      />
    </div>
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else {
      <div [class]="tableWrap">
        <table [class]="table" data-testid="admin-audit">
          <thead>
            <tr>
              <th [class]="th">{{ 'admin.audit.when' | transloco }}</th>
              <th [class]="th">{{ 'admin.audit.who' | transloco }}</th>
              <th [class]="th">{{ 'admin.audit.what' | transloco }}</th>
              <th [class]="th">{{ 'admin.audit.target' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (e of items(); track e.id) {
              <tr class="align-top">
                <td [class]="td" class="whitespace-nowrap">{{ e.createdAt | appDate: 'short' }}</td>
                <td [class]="td">
                  @if (e.actor; as a) {
                    <a
                      [routerLink]="['/admin/users', a.id]"
                      class="font-mono text-xs hover:underline"
                      >&#64;{{ a.username }}</a
                    >
                  } @else {
                    —
                  }
                </td>
                <td [class]="td">
                  <span class="font-semibold">{{
                    'admin.audit.action.' + e.action | transloco
                  }}</span>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-xs text-muted">
                      {{ 'admin.audit.details' | transloco }}
                    </summary>
                    <pre
                      class="mt-1 max-w-md overflow-auto font-mono text-[11px] whitespace-pre-wrap"
                      >{{ e.meta | json }}</pre>
                  </details>
                </td>
                <td [class]="td">
                  @if (link(e); as l) {
                    <a [routerLink]="l" class="hover:underline">{{ label(e) }}</a>
                  } @else {
                    {{ label(e) }}
                  }
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
export class AdminAuditPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  protected readonly actions = ACTIONS;
  protected readonly action = signal<AuditAction | ''>('');
  protected readonly actor = signal('');
  protected readonly items = signal<AuditEntryDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const query = { action: this.action(), actor: this.actor() };
      untracked(() => void this.load(query, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load({ action: this.action(), actor: this.actor() }, 'more');

  protected search(actor: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.actor.set(actor.trim().replace(/^@/, ''));
    }, 300);
  }

  /** The name saved with the entry: a username, a video title, or the settings. */
  protected label(e: AuditEntryDto): string {
    const m = e.meta;
    if (typeof m['title'] === 'string') return `“${m['title']}”`;
    if (typeof m['username'] === 'string') return `@${m['username']}`;
    return this.t.translate(`admin.audit.targetType.${e.targetType}`);
  }

  protected link(e: AuditEntryDto): string[] | null {
    if (!e.targetId) return null;
    if (e.targetType === 'user') return ['/admin/users', e.targetId];
    if (e.targetType === 'video') return ['/admin/videos', e.targetId];
    return null;
  }

  private generation = 0;

  private async load(
    query: { action: AuditAction | ''; actor: string },
    mode: RowsMode,
  ): Promise<void> {
    const generation = mode === 'more' ? this.generation : ++this.generation;
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminAudit, {
          action: query.action || undefined,
          actor: query.actor || undefined,
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

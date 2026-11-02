import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideLifeBuoy, lucideStickyNote } from '@ng-icons/lucide';

import {
  Api,
  type AdminSupportTicketDto,
  type SupportMessageDto,
  type SupportPriority,
  type SupportStatus,
  adminSupportGet,
  adminSupportReply,
  adminSupportUpdate,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TAB_LIST, tabClass } from '../../shared/ui/tabs/tabs';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  PicturePickerComponent,
  PictureStripComponent,
  SUPPORT_BODY_MAX,
} from '../support/support-ui';
import { AdminCounters } from './admin-layout';
import { AdminBadgeComponent, apiMessage } from './admin-ui';
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, priorityTone, supportTone } from './admin-support';

const CONTEXT_ORDER = [
  'browser',
  'os',
  'screen',
  'window',
  'pixelRatio',
  'language',
  'appLanguage',
  'theme',
  'timeZone',
  'page',
  'version',
  'userAgent',
];

/**
 * One ticket for admins: the conversation with the author (answers signed
 * "Support" for them, who answered shown here), notes only admins see, and at the side the status,
 * the priority, the video, what the browser said and the rating.
 */
@Component({
  selector: 'app-admin-support-ticket',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    NgIcon,
    AppDatePipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    SelectComponent,
    OptionComponent,
    SpinnerComponent,
    AdminBadgeComponent,
    PicturePickerComponent,
    PictureStripComponent,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideLifeBuoy, lucideStickyNote })],
  template: `
    <a routerLink="../" class="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ng-icon name="lucideArrowLeft" size="14" />{{ 'admin.nav.support' | transloco }}
    </a>
    @if (error(); as message) {
      <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
    } @else if (ticket(); as t) {
      <div class="mt-3 flex flex-wrap items-center gap-2" data-testid="admin-support-ticket">
        <h2 class="font-display text-xl font-semibold">
          <span class="font-mono text-base text-muted">#{{ t.number }}</span> {{ t.subject }}
        </h2>
        <app-admin-badge [tone]="tone(t.status)" data-testid="admin-support-status">{{
          'admin.support.status.' + t.status | transloco
        }}</app-admin-badge>
        @if (t.priority !== 'NORMAL') {
          <app-admin-badge [tone]="priorityTone(t.priority)">{{
            'admin.support.priorities.' + t.priority | transloco
          }}</app-admin-badge>
        }
      </div>
      <p class="mt-1 text-sm text-muted">
        <a [routerLink]="['/admin/users', t.user.id]" class="font-mono hover:underline"
          >&#64;{{ t.user.username }}</a
        >
        @if (t.userEmail) {
          · {{ t.userEmail }}
        }
        · {{ 'admin.support.topics.' + t.topic | transloco }} ·
        {{ t.createdAt | appDate: 'medium' }}
      </p>

      <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0">
          <ol class="flex flex-col gap-3" data-testid="admin-support-messages">
            @for (m of t.messages; track m.id) {
              <li
                class="rounded-lg border-2 p-4"
                [class]="messageClass(m)"
                [attr.data-testid]="'admin-support-message-' + m.kind"
              >
                <p class="label-mono mb-2 flex flex-wrap items-center gap-1.5 text-muted">
                  @if (m.kind === 'NOTE') {
                    <ng-icon name="lucideStickyNote" size="12" />{{
                      'admin.support.note' | transloco
                    }}
                  } @else if (m.kind === 'SUPPORT') {
                    <ng-icon name="lucideLifeBuoy" size="12" />{{
                      'admin.support.answer' | transloco
                    }}
                  }
                  <span>&#64;{{ m.author?.username }}</span>
                  <span>· {{ m.createdAt | appDate: 'short' }}</span>
                </p>
                @if (m.body) {
                  <p class="text-sm break-words whitespace-pre-wrap">{{ m.body }}</p>
                }
                @if (m.attachments.length) {
                  <app-picture-strip class="mt-2" [attachments]="m.attachments" />
                }
              </li>
            }
          </ol>

          <form
            class="mt-4 rounded-lg border-2 border-line bg-surface p-4"
            (ngSubmit)="send(false)"
            data-testid="admin-support-composer"
          >
            <div [class]="tabList" role="tablist" class="mb-3">
              <button
                type="button"
                role="tab"
                [class]="tabClass(!note())"
                [attr.aria-selected]="!note()"
                (click)="note.set(false)"
              >
                {{ 'admin.support.replyTab' | transloco }}
              </button>
              <button
                type="button"
                role="tab"
                [class]="tabClass(note())"
                [attr.aria-selected]="note()"
                (click)="note.set(true)"
                data-testid="admin-support-note-tab"
              >
                {{ 'admin.support.noteTab' | transloco }}
              </button>
            </div>
            <p class="mb-2 text-xs text-muted">
              {{
                (note()
                  ? 'admin.support.noteHint'
                  : t.status === 'RESOLVED' || t.status === 'CLOSED'
                    ? 'admin.support.reopenHint'
                    : 'admin.support.replyHint'
                ) | transloco
              }}
            </p>
            <textarea
              appInput
              name="draft"
              rows="4"
              [maxlength]="bodyMax"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              (paste)="picker()?.paste($event)"
              [attr.aria-label]="
                (note() ? 'admin.support.noteTab' : 'admin.support.replyTab') | transloco
              "
              data-testid="admin-support-draft"
            ></textarea>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <app-picture-picker [(files)]="files" />
              <div class="flex flex-wrap gap-2">
                @if (!note()) {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    size="sm"
                    [disabled]="!canSend()"
                    (click)="send(true)"
                    data-testid="admin-support-send-resolve"
                  >
                    {{ 'admin.support.sendResolve' | transloco }}
                  </button>
                }
                <button
                  type="submit"
                  appButton
                  size="sm"
                  [disabled]="!canSend()"
                  data-testid="admin-support-send"
                >
                  {{ (note() ? 'admin.support.saveNote' : 'admin.support.send') | transloco }}
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside class="flex flex-col gap-4">
          <section class="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
            <label class="flex items-center justify-between gap-3 text-sm">
              <span class="label-mono text-muted">{{ 'admin.videos.status' | transloco }}</span>
              <app-select
                size="sm"
                class="w-52"
                [ariaLabel]="'admin.videos.status' | transloco"
                [ngModel]="t.status"
                (ngModelChange)="update({ status: $event })"
                data-testid="admin-support-status-select"
              >
                @for (s of statuses; track s) {
                  <app-option [value]="s">{{ 'admin.support.status.' + s | transloco }}</app-option>
                }
              </app-select>
            </label>
            <label class="flex items-center justify-between gap-3 text-sm">
              <span class="label-mono text-muted">{{ 'admin.support.priority' | transloco }}</span>
              <app-select
                size="sm"
                class="w-52"
                [ariaLabel]="'admin.support.priority' | transloco"
                [ngModel]="t.priority"
                (ngModelChange)="update({ priority: $event })"
                data-testid="admin-support-priority"
              >
                @for (p of priorities; track p) {
                  <app-option [value]="p">{{
                    'admin.support.priorities.' + p | transloco
                  }}</app-option>
                }
              </app-select>
            </label>
            @if (t.helped !== null) {
              <p class="text-sm">
                <span class="label-mono text-muted">{{ 'admin.support.rating' | transloco }}</span>
                {{ (t.helped ? 'admin.support.helped' : 'admin.support.notHelped') | transloco }}
              </p>
            }
          </section>
          @if (t.video; as v) {
            <section class="rounded-lg border-2 border-line bg-surface p-4">
              <p class="label-mono mb-2 text-muted">{{ 'admin.support.video' | transloco }}</p>
              <a
                [routerLink]="['/admin/videos', v.id]"
                class="flex items-center gap-3 hover:underline"
              >
                <span class="h-10 w-16 shrink-0 overflow-hidden rounded bg-surface-2">
                  @if (v.thumbnailUrl) {
                    <img [src]="v.thumbnailUrl" alt="" class="h-full w-full object-cover" />
                  }
                </span>
                <span class="min-w-0 truncate text-sm">{{ v.title }}</span>
              </a>
            </section>
          }
          @if (t.context; as c) {
            <section
              class="rounded-lg border-2 border-line bg-surface p-4"
              data-testid="admin-support-context"
            >
              <p class="label-mono mb-2 text-muted">{{ 'admin.support.context' | transloco }}</p>
              <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                @for (row of contextRows(c); track row[0]) {
                  <dt class="font-mono text-muted">{{ row[0] }}</dt>
                  <dd class="break-words">{{ row[1] }}</dd>
                }
              </dl>
            </section>
          }
        </aside>
      </div>
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminSupportTicketPage {
  readonly id = input.required<string>();
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly counters = inject(AdminCounters);
  protected readonly picker = viewChild(PicturePickerComponent);

  protected readonly statuses = SUPPORT_STATUSES;
  protected readonly priorities = SUPPORT_PRIORITIES;
  protected readonly tone = supportTone;
  protected readonly priorityTone = priorityTone;
  protected readonly bodyMax = SUPPORT_BODY_MAX;
  protected readonly tabList = TAB_LIST;
  protected readonly tabClass = tabClass;

  protected readonly ticket = signal<AdminSupportTicketDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly note = signal(false);
  protected readonly draft = signal('');
  protected readonly files = signal<File[]>([]);

  /** The ticket shown, and its loads numbered: a late answer for another one is dropped. */
  private shown: string | null = null;
  private loads = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        // Another ticket: the answer being written for the last one does not go to this one.
        if (id !== this.shown) {
          this.shown = id;
          this.ticket.set(null);
          this.draft.set('');
          this.note.set(false);
          this.picker()?.clear();
          this.error.set(null);
        }
        void this.load(id);
      });
    });
  }

  protected canSend(): boolean {
    return !this.busy() && (!!this.draft().trim() || this.files().length > 0);
  }

  protected messageClass(m: SupportMessageDto): string {
    switch (m.kind) {
      case 'NOTE':
        return 'border-dashed border-warning/60 bg-warning/10';
      case 'SUPPORT':
        return 'border-line bg-shelf/40 lg:ml-10';
      default:
        return 'border-line bg-surface lg:mr-10';
    }
  }

  /** In the order the form shows them (the database keeps its own); anything else after. */
  protected contextRows(c: Record<string, string>): [string, string][] {
    const at = (k: string) => CONTEXT_ORDER.indexOf(k) + 1 || CONTEXT_ORDER.length + 1;
    return Object.entries(c).sort(([a], [b]) => at(a) - at(b));
  }

  protected async send(resolve: boolean): Promise<void> {
    if (!this.canSend()) return;
    const note = this.note();
    const id = this.id();
    await this.run(async () => {
      const t = await this.api.invoke(adminSupportReply, {
        id,
        body: {
          body: this.draft().trim() || undefined,
          note: note || undefined,
          resolve: (!note && resolve) || undefined,
          files: this.files(),
        },
      });
      if (this.id() === id) {
        this.draft.set('');
        this.picker()?.clear();
      }
      return t;
    });
  }

  protected async update(change: {
    status?: SupportStatus;
    priority?: SupportPriority;
  }): Promise<void> {
    const t = this.ticket();
    if (
      !t ||
      ((change.status ?? t.status) === t.status && (change.priority ?? t.priority) === t.priority)
    )
      return;
    await this.run(() => this.api.invoke(adminSupportUpdate, { id: this.id(), body: change }));
  }

  private async run(action: () => Promise<AdminSupportTicketDto>): Promise<void> {
    this.busy.set(true);
    const id = this.id();
    try {
      const ticket = await action();
      if (this.id() === id) this.ticket.set(ticket);
      this.toast.success(this.t.translate('admin.done'));
      void this.counters.refresh();
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
      await this.load(this.id());
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const seq = ++this.loads;
    try {
      const ticket = await this.api.invoke(adminSupportGet, { id });
      if (seq !== this.loads) return;
      this.ticket.set(ticket);
      this.error.set(null);
    } catch (e) {
      if (seq === this.loads) this.error.set(apiMessage(e, this.t));
    }
  }
}

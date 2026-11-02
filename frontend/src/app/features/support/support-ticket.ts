import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCheck,
  lucideLifeBuoy,
  lucidePlus,
  lucideSendHorizontal,
  lucideThumbsDown,
  lucideThumbsUp,
} from '@ng-icons/lucide';

import {
  Api,
  type SupportMessageDto,
  type SupportTicketDto,
  supportGet,
  supportRate,
  supportReply,
  supportResolve,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { SupportStore } from '../../core/support/support.store';
import { NotFoundPage } from '../not-found/not-found';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  PicturePickerComponent,
  PictureStripComponent,
  SUPPORT_BODY_MAX,
  TOPIC_ICON,
  TOPIC_ICONS,
  supportStatusClass,
  topicKey,
} from './support-ui';

/**
 * One ticket: the messages as a conversation — mine on the right, the
 * answers of "Support" on the left — and below them what can be done now: write (pictures too),
 * say the question is solved, or say whether the answer helped.
 */
@Component({
  selector: 'app-support-ticket',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    NgIcon,
    AppDatePipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    PageHeadComponent,
    SpinnerComponent,
    PicturePickerComponent,
    PictureStripComponent,
    NotFoundPage,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideLifeBuoy,
      lucidePlus,
      lucideSendHorizontal,
      lucideThumbsDown,
      lucideThumbsUp,
      ...TOPIC_ICONS,
    }),
  ],
  host: {
    '(dragover)': 'onDragOver($event)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <a
      [routerLink]="panelLink('support')"
      [queryParamsHandling]="'merge'"
      class="label-mono mb-4 inline-flex items-center gap-1.5 text-muted hover:text-text"
    >
      <ng-icon name="lucideArrowLeft" size="14" />{{ 'support.back' | transloco }}
    </a>
    @if (notFound()) {
      <app-not-found />
    } @else if (error(); as error) {
      <app-alert kind="error">{{ error }}</app-alert>
    } @else if (ticket(); as t) {
      <article data-testid="support-ticket">
        <app-page-head [title]="t.subject" [kicker]="'#' + t.number">
          <span
            pageHeadBadge
            class="rounded px-2 py-0.5 font-sans text-xs font-normal tracking-normal"
            [class]="statusClass(t.status)"
            data-testid="support-status"
            >{{ 'support.status.' + t.status | transloco }}</span
          >
        </app-page-head>
        <p class="-mt-3 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <ng-icon [name]="topicIcon[t.topic]" size="14" />
          {{ topicKey(t.topic, site.hasTiers()) | transloco }} ·
          {{ t.createdAt | appDate: 'medium' }}
        </p>
        @if (t.video; as v) {
          <a
            [routerLink]="v.deleted ? null : ['/', v.code]"
            class="mb-5 flex items-center gap-3 rounded-xl border-2 border-line/25 bg-surface p-2"
            data-testid="support-video"
          >
            <span class="h-10 w-16 shrink-0 overflow-hidden rounded bg-surface-2">
              @if (v.thumbnailUrl) {
                <img [src]="v.thumbnailUrl" alt="" class="h-full w-full object-cover" />
              }
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ v.title }}</span>
              <span class="label-mono text-muted">{{
                (v.deleted ? 'support.video.deleted' : 'support.video.status.' + v.status)
                  | transloco
              }}</span>
            </span>
          </a>
        }

        <div class="rounded-xl bg-canvas/60" data-testid="support-messages">
          @for (m of t.messages; track m.id; let i = $index) {
            @if (newDay(t.messages, i)) {
              <div class="label-mono my-3 flex items-center gap-3 text-faint">
                <span class="h-px flex-1 bg-ink/10"></span>{{ m.createdAt | appDate: 'mediumDate'
                }}<span class="h-px flex-1 bg-ink/10"></span>
              </div>
            }
            <div class="mb-3 flex" [class.justify-end]="m.kind === 'USER'">
              <div class="flex max-w-[85%] flex-col" [class.items-end]="m.kind === 'USER'">
                @if (m.kind !== 'USER') {
                  <span class="label-mono mb-1 flex items-center gap-1.5 text-muted">
                    <ng-icon name="lucideLifeBuoy" size="12" />{{ 'support.signature' | transloco }}
                  </span>
                }
                @if (m.body) {
                  <div
                    class="rounded-lg border-2 border-line text-sm"
                    [class]="
                      m.kind === 'USER'
                        ? 'rounded-br-sm bg-accent text-accent-fg'
                        : 'rounded-bl-sm bg-surface text-text'
                    "
                    [attr.data-testid]="'support-message-' + m.kind"
                  >
                    <p class="px-3 py-2 break-words whitespace-pre-wrap">{{ m.body }}</p>
                  </div>
                }
                @if (m.attachments.length) {
                  <app-picture-strip class="mt-1.5" [attachments]="m.attachments" />
                }
                <span class="label-mono mt-1 text-faint">{{
                  m.createdAt | appDate: 'shortTime'
                }}</span>
              </div>
            </div>
          }
        </div>

        @if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
          <div
            class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-line bg-surface p-4 shadow-hard-sm"
            data-testid="support-rating"
          >
            <span class="text-sm font-semibold">{{ 'support.rating.question' | transloco }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                appButton
                size="sm"
                [variant]="t.helped === true ? 'primary' : 'secondary'"
                [attr.aria-pressed]="t.helped === true"
                (click)="rate(true)"
                data-testid="support-helped"
              >
                <ng-icon name="lucideThumbsUp" size="16" />{{ 'support.rating.yes' | transloco }}
              </button>
              <button
                type="button"
                appButton
                size="sm"
                [variant]="t.helped === false ? 'primary' : 'secondary'"
                [attr.aria-pressed]="t.helped === false"
                (click)="rate(false)"
              >
                <ng-icon name="lucideThumbsDown" size="16" />{{ 'support.rating.no' | transloco }}
              </button>
            </div>
            @if (t.helped !== null) {
              <span class="text-sm text-muted">{{ 'support.rating.thanks' | transloco }}</span>
            }
          </div>
        }

        <!-- Solved or closed is over: no more words in it; a new ticket if the problem stays. -->
        @if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
          <div
            class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-line bg-surface-2 px-4 py-3 text-sm text-muted"
            data-testid="support-closed"
          >
            {{ 'support.closedNote' | transloco }}
            <a
              appButton
              size="sm"
              [routerLink]="panelLink('support', 'new')"
              [queryParamsHandling]="'merge'"
            >
              <ng-icon name="lucidePlus" size="16" />{{ 'support.newButton' | transloco }}
            </a>
          </div>
        } @else {
          <form
            class="mt-4 rounded-xl border-2 border-line bg-surface p-3"
            (ngSubmit)="send()"
            data-testid="support-composer"
          >
            <textarea
              appInput
              name="draft"
              rows="3"
              [maxlength]="bodyMax"
              [placeholder]="'support.replyHint' | transloco"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
              (paste)="picker()?.paste($event)"
              (keydown.control.enter)="send()"
              (keydown.meta.enter)="send()"
              [attr.aria-label]="'support.replyHint' | transloco"
              data-testid="support-reply"
            ></textarea>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <app-picture-picker [(files)]="files" />
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="resolve()"
                  data-testid="support-resolve"
                >
                  <ng-icon name="lucideCheck" size="16" />{{ 'support.resolve' | transloco }}
                </button>
                <button
                  type="submit"
                  appButton
                  size="sm"
                  [disabled]="busy() || (!draft().trim() && !files().length)"
                  data-testid="support-reply-send"
                >
                  <ng-icon name="lucideSendHorizontal" size="16" />{{ 'support.send' | transloco }}
                </button>
              </div>
            </div>
          </form>
        }
      </article>
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class SupportTicketPage {
  readonly id = input.required<string>();
  protected readonly panelLink = panelLink;
  protected readonly topicIcon = TOPIC_ICON;
  protected readonly topicKey = topicKey;
  protected readonly statusClass = supportStatusClass;
  protected readonly bodyMax = SUPPORT_BODY_MAX;
  protected readonly site = inject(SiteConfig);
  private readonly api = inject(Api);
  private readonly store = inject(SupportStore);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly picker = viewChild(PicturePickerComponent);

  protected readonly ticket = signal<SupportTicketDto | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly draft = signal('');
  protected readonly files = signal<File[]>([]);

  /** The ticket shown, and its loads numbered: a late answer for another one is dropped. */
  private shown: string | null = null;
  private loads = 0;

  constructor() {
    // Support wrote while it is open: the messages come again.
    effect(() => {
      const id = this.id();
      this.store.version();
      untracked(() => {
        // Another ticket (a notification's link): what was written for the last one stays there.
        if (id !== this.shown) {
          this.shown = id;
          this.ticket.set(null);
          this.draft.set('');
          this.picker()?.clear();
          this.error.set(null);
          this.notFound.set(false);
        }
        void this.load(id);
      });
    });
  }

  protected newDay(messages: SupportMessageDto[], i: number): boolean {
    return (
      i === 0 || messages[i]!.createdAt.slice(0, 10) !== messages[i - 1]!.createdAt.slice(0, 10)
    );
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }

  protected onDrop(e: DragEvent): void {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    this.picker()?.add(files);
  }

  protected async send(): Promise<void> {
    const body = this.draft().trim();
    if (this.busy() || (!body && !this.files().length)) return;
    const id = this.id();
    await this.run(async () => {
      const t = await this.api.invoke(supportReply, {
        id,
        body: { body: body || undefined, files: this.files() },
      });
      if (this.id() === id) {
        this.draft.set('');
        this.picker()?.clear();
      }
      return t;
    });
  }

  protected async resolve(): Promise<void> {
    await this.run(() => this.api.invoke(supportResolve, { id: this.id() }));
  }

  protected async rate(helped: boolean): Promise<void> {
    await this.run(() => this.api.invoke(supportRate, { id: this.id(), body: { helped } }));
  }

  private async run(action: () => Promise<SupportTicketDto>): Promise<void> {
    this.busy.set(true);
    const id = this.id();
    try {
      const ticket = await action();
      if (this.id() === id) this.ticket.set(ticket);
      this.store.changed();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const seq = ++this.loads;
    try {
      const ticket = await this.api.invoke(supportGet, { id });
      if (seq !== this.loads) return;
      this.ticket.set(ticket);
      this.error.set(null);
      this.notFound.set(false);
      void this.store.refresh();
    } catch (e) {
      if (seq !== this.loads) return;
      const err = toApiError(e);
      if (err.statusCode === 404) this.notFound.set(true);
      else this.error.set(err.message || this.t.translate('errors.unknown'));
    }
  }
}

import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PRIMARY_OUTLET, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideExternalLink } from '@ng-icons/lucide';

import {
  Api,
  type SupportFaqItemDto,
  type SupportTopic,
  type SupportVideoDto,
  supportCreate,
  supportFaqList,
  supportVideos,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { SupportStore } from '../../core/support/support.store';
import { ThemeService } from '../../core/theme/theme.service';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { matchFaq } from './faq-match';
import {
  PicturePickerComponent,
  SUPPORT_BODY_MAX,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_TOPICS,
  TOPIC_ICON,
  TOPIC_ICONS,
  techContext,
  topicKey,
} from './support-ui';

/**
 * A new ticket: the topic, a subject with matching questions of the FAQ under it,
 * the message with pictures (picked, dropped or pasted), one of my own videos if it is about one.
 * A bug report shows what it carries about the browser.
 */
@Component({
  selector: 'app-support-new',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    NgIcon,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    PageHeadComponent,
    SelectComponent,
    OptionComponent,
    PicturePickerComponent,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideExternalLink, ...TOPIC_ICONS })],
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
    <app-page-head [title]="'support.new.title' | transloco" />
    <form class="flex flex-col gap-5" (ngSubmit)="send()" data-testid="support-form">
      <fieldset>
        <legend class="label-mono mb-2 text-muted">{{ 'support.new.topic' | transloco }}</legend>
        <div class="grid gap-2 sm:grid-cols-2">
          @for (t of topics; track t) {
            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm transition-colors"
              [class]="
                topic() === t
                  ? 'border-line bg-shelf text-ink'
                  : 'border-line/25 bg-surface hover:bg-surface-2'
              "
              [attr.data-testid]="'support-topic-' + t"
            >
              <input
                type="radio"
                name="topic"
                class="sr-only"
                [value]="t"
                [checked]="topic() === t"
                (change)="topic.set(t)"
              />
              <ng-icon [name]="topicIcon[t]" size="18" class="mt-0.5 shrink-0" />
              <span>
                <span class="block font-semibold">{{
                  topicKey(t, site.hasTiers()) | transloco
                }}</span>
                <span class="block text-xs opacity-75">{{
                  'support.topicHints.' + (t === 'ACCOUNT' && !site.hasTiers() ? 'ACCOUNT_FREE' : t)
                    | transloco
                }}</span>
              </span>
            </label>
          }
        </div>
        <p class="mt-2 text-xs text-muted">{{ 'support.new.notReports' | transloco }}</p>
      </fieldset>

      <div>
        <app-field [label]="'support.new.subject' | transloco">
          <input
            appInput
            name="subject"
            [maxlength]="subjectMax"
            [placeholder]="'support.new.subjectHint' | transloco"
            [ngModel]="subject()"
            (ngModelChange)="subject.set($event)"
            data-testid="support-subject"
          />
        </app-field>
        @if (hints().length) {
          <div class="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm" data-testid="support-faq">
            <p class="label-mono mb-1 text-muted">{{ 'support.new.faq' | transloco }}</p>
            <ul class="flex flex-col gap-1">
              @for (h of hints(); track h.key) {
                <li>
                  <a
                    [href]="h.url"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
                    >{{ h.question }}<ng-icon name="lucideExternalLink" size="12" class="shrink-0"
                  /></a>
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <app-field [label]="'support.new.message' | transloco">
        <textarea
          appInput
          name="body"
          rows="6"
          [maxlength]="bodyMax"
          [placeholder]="'support.new.messageHint.' + topic() | transloco"
          [ngModel]="body()"
          (ngModelChange)="body.set($event)"
          (paste)="picker()?.paste($event)"
          data-testid="support-body"
        ></textarea>
      </app-field>

      <div>
        <p class="label-mono mb-2 text-muted">{{ 'support.picture.label' | transloco }}</p>
        <app-picture-picker [(files)]="files" />
        <p class="mt-1.5 text-xs text-muted">{{ 'support.picture.hint' | transloco }}</p>
      </div>

      @if (videos().length) {
        <app-field optional [label]="'support.new.video' | transloco">
          <app-select
            [ariaLabel]="'support.new.video' | transloco"
            [ngModel]="videoId()"
            (ngModelChange)="videoId.set($event)"
            name="video"
          >
            <app-option [value]="''">{{ 'support.new.noVideo' | transloco }}</app-option>
            @for (v of videos(); track v.id) {
              <app-option [value]="v.id">{{ v.title }}</app-option>
            }
          </app-select>
        </app-field>
      }

      @if (topic() === 'BUG') {
        <div
          class="rounded-xl border-2 border-line/25 bg-surface p-4"
          data-testid="support-context"
        >
          <p class="text-sm font-semibold">{{ 'support.new.contextTitle' | transloco }}</p>
          <p class="mt-1 text-xs text-muted">{{ 'support.new.contextLead' | transloco }}</p>
          <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
            @for (row of contextRows(); track row[0]) {
              <dt class="label-mono text-muted">{{ 'support.context.' + row[0] | transloco }}</dt>
              <dd class="truncate">{{ row[1] }}</dd>
            }
          </dl>
        </div>
      }

      @if (error(); as message) {
        <p class="text-sm text-danger">{{ message }}</p>
      }
      <div class="flex justify-end gap-2">
        <a
          appButton
          variant="ghost"
          [routerLink]="panelLink('support')"
          [queryParamsHandling]="'merge'"
        >
          {{ 'common.cancel' | transloco }}
        </a>
        <button
          type="submit"
          appButton
          [disabled]="!canSend() || busy()"
          data-testid="support-send"
        >
          {{ (busy() ? 'support.sending' : 'support.send') | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class SupportNewPage {
  protected readonly panelLink = panelLink;
  protected readonly topics = SUPPORT_TOPICS;
  protected readonly topicIcon = TOPIC_ICON;
  protected readonly topicKey = topicKey;
  protected readonly subjectMax = SUPPORT_SUBJECT_MAX;
  protected readonly bodyMax = SUPPORT_BODY_MAX;
  protected readonly site = inject(SiteConfig);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(SupportStore);
  private readonly theme = inject(ThemeService);
  protected readonly picker = viewChild(PicturePickerComponent);

  protected readonly topic = signal<SupportTopic>('QUESTION');
  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly files = signal<File[]>([]);
  protected readonly videoId = signal('');
  protected readonly videos = signal<SupportVideoDto[]>([]);
  private readonly faq = signal<SupportFaqItemDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly hints = computed(() => matchFaq(this.subject(), this.faq(), 3));
  protected readonly canSend = computed(
    () => this.subject().trim().length > 0 && this.body().trim().length > 0,
  );
  /** What a bug report carries: the page under the panel, not the panel itself. */
  private readonly context = computed(() =>
    techContext(this.pageUnder(), this.theme.resolved(), this.t.getActiveLang()),
  );
  protected readonly contextRows = computed(() =>
    Object.entries(this.context()).filter(([k]) => k !== 'userAgent'),
  );

  constructor() {
    void this.loadExtras();
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
    if (!this.canSend() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const ticket = await this.api.invoke(supportCreate, {
        body: {
          topic: this.topic(),
          subject: this.subject().trim(),
          body: this.body().trim(),
          videoId: this.videoId() || undefined,
          context: this.topic() === 'BUG' ? JSON.stringify(this.context()) : undefined,
          files: this.files(),
        },
      });
      this.toast.success(this.t.translate('support.sent', { number: ticket.number }));
      this.store.changed();
      await this.router.navigate(panelLink('support', ticket.id), {
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadExtras(): Promise<void> {
    const [videos, faq] = await Promise.all([
      this.api.invoke(supportVideos, {}).catch(() => []),
      this.site.siteUrl() ? this.api.invoke(supportFaqList).catch(() => []) : Promise.resolve([]),
    ]);
    this.videos.set(videos);
    this.faq.set(faq);
  }

  private pageUnder(): string {
    const tree = this.router.parseUrl(this.router.url);
    const primary = tree.root.children[PRIMARY_OUTLET];
    tree.root.children = primary ? { [PRIMARY_OUTLET]: primary } : {};
    tree.queryParams = {};
    return this.router.serializeUrl(tree);
  }
}

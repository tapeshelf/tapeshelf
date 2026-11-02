import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';

import { Api, type SupportTicketSummaryDto, supportList } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { SupportStore } from '../../core/support/support.store';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TOPIC_ICON, TOPIC_ICONS, supportStatusClass, topicKey } from './support-ui';

const PAGE = 20;

/** Support: my tickets, the latest activity first, and a new one. */
@Component({
  selector: 'app-support-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NgIcon,
    AppDatePipe,
    AlertComponent,
    AutoMoreComponent,
    ButtonDirective,
    EmptyStateComponent,
    PageHeadComponent,
    SpinnerComponent,
  ],
  providers: [provideIcons({ lucidePlus, ...TOPIC_ICONS })],
  template: `
    <div>
      <app-page-head [title]="'support.title' | transloco">
        <a
          appButton
          size="sm"
          [routerLink]="panelLink('support', 'new')"
          [queryParamsHandling]="'merge'"
          data-testid="support-new"
        >
          <ng-icon name="lucidePlus" size="16" />{{ 'support.newButton' | transloco }}
        </a>
      </app-page-head>
      <p class="mb-6 text-sm text-muted">{{ 'support.lead' | transloco }}</p>
      @if (error(); as error) {
        <app-alert kind="error">{{ error }}</app-alert>
      } @else if (!loaded()) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (items().length === 0) {
        <app-empty-state [text]="'support.empty' | transloco" [seed]="31" />
      } @else {
        <ul class="flex flex-col gap-2" data-testid="support-list">
          @for (t of items(); track t.id) {
            <li>
              <a
                [routerLink]="panelLink('support', t.id)"
                [queryParamsHandling]="'merge'"
                class="flex items-center gap-3 rounded-xl border bg-surface p-3 transition-colors hover:bg-surface-2"
                [class]="
                  t.unread ? 'border-accent shadow-[3px_3px_0_0_var(--vs-accent)]' : 'border-line'
                "
                data-testid="support-row"
              >
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted"
                >
                  <ng-icon [name]="topicIcon[t.topic]" size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2 text-sm">
                    <span class="label-mono text-muted">#{{ t.number }}</span>
                    <span class="truncate font-medium">{{ t.subject }}</span>
                    @if (t.unread) {
                      <span
                        class="h-2 w-2 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      ></span>
                    }
                  </span>
                  <span class="block truncate text-xs text-muted">
                    {{ topicKey(t.topic, site.hasTiers()) | transloco }} ·
                    {{ t.activityAt | appDate: 'medium' }}
                  </span>
                </span>
                <span
                  class="shrink-0 rounded px-1.5 py-0.5 text-[11px]"
                  [class]="statusClass(t.status)"
                  data-testid="support-row-status"
                >
                  {{ 'support.status.' + t.status | transloco }}
                </span>
              </a>
            </li>
          }
        </ul>
        <app-auto-more
          class="mt-2"
          [more]="!!nextCursor()"
          [count]="items().length"
          [busy]="loading()"
          [load]="next"
        />
      }
    </div>
  `,
})
export class SupportPage {
  protected readonly panelLink = panelLink;
  protected readonly topicIcon = TOPIC_ICON;
  protected readonly topicKey = topicKey;
  protected readonly statusClass = supportStatusClass;
  protected readonly site = inject(SiteConfig);
  private readonly api = inject(Api);
  private readonly store = inject(SupportStore);
  private readonly t = inject(TranslocoService);

  protected readonly items = signal<SupportTicketSummaryDto[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly next = () => this.loadMore();

  constructor() {
    // Support wrote, or I did: the list comes again.
    effect(() => {
      this.store.version();
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.api.invoke(supportList, { limit: PAGE });
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.error.set(null);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loaded.set(true);
      this.loading.set(false);
    }
  }

  private async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loading()) return;
    this.loading.set(true);
    try {
      const page = await this.api.invoke(supportList, { cursor, limit: PAGE });
      const seen = new Set(this.items().map((t) => t.id));
      this.items.update((list) => [...list, ...page.items.filter((t) => !seen.has(t.id))]);
      this.nextCursor.set(page.nextCursor);
    } finally {
      this.loading.set(false);
    }
  }
}

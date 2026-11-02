import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type ExchangeTab, type RequestSummaryDto, exchangeList } from '../../api';
import { errorText } from '../../core/api/api-error';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TAB_LIST, tabClass } from '../../shared/ui/tabs/tabs';
import { groupByCounterpart } from './request-groups';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { panelLink } from '../../core/navigation/panels';
import { nameless } from '../../core/navigation/user-links';

const TABS: ExchangeTab[] = ['incoming', 'outgoing', 'history'];
const PAGE = 30;

/** /exchange — incoming (awaiting me), outgoing, history. */
@Component({
  selector: 'app-exchange-page',
  imports: [
    EmptyStateComponent,
    TranslocoPipe,
    SensitiveBlurDirective,
    AppDatePipe,
    NgTemplateOutlet,
    RouterLink,
    AlertComponent,
    AutoMoreComponent,
    SpinnerComponent,
    PageHeadComponent,
  ],
  template: `
    <div>
      <app-page-head [title]="'exchange.title' | transloco" />
      <nav [class]="tabList" role="tablist">
        @for (t of tabs; track t) {
          <button
            type="button"
            role="tab"
            [class]="tabClass(activeTab() === t)"
            [attr.aria-selected]="activeTab() === t"
            (click)="setTab(t)"
          >
            {{ 'exchange.tabs.' + t | transloco }}
            @if (t === 'incoming' && exchange.awaitingMe() > 0) {
              <span
                class="inline-flex h-5 min-w-5 -rotate-6 items-center justify-center rounded-sm border border-accent-edge bg-accent px-1 font-mono text-[11px] font-bold text-accent-fg"
                >{{ exchange.awaitingMe() }}</span
              >
            }
          </button>
        }
      </nav>
      @if (error(); as error) {
        <app-alert kind="error">{{ error }}</app-alert>
      } @else if (!loaded()) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (items().length === 0) {
        <app-empty-state [text]="'exchange.empty.' + activeTab() | transloco" [seed]="13" />
      } @else {
        <ul class="flex flex-col gap-2" data-testid="request-list">
          @if (activeTab() === 'incoming') {
            @for (g of groups(); track g.counterpart.id) {
              @if (g.items.length > 1) {
                <li class="rounded-xl bg-surface-2/50 p-2" data-testid="request-group">
                  <p class="label-mono mb-2 px-1 text-muted">
                    {{
                      'exchange.list.group'
                        | transloco
                          : {
                              name: g.counterpart.guest
                                ? ('common.guest' | transloco)
                                : g.counterpart.displayName ||
                                  (nameless(g.counterpart) | transloco),
                              count: g.items.length,
                            }
                    }}
                  </p>
                  <ul class="flex flex-col gap-2">
                    @for (r of g.items; track r.id) {
                      <li><ng-container *ngTemplateOutlet="row; context: { $implicit: r }" /></li>
                    }
                  </ul>
                </li>
              } @else {
                <li>
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: g.items[0] }" />
                </li>
              }
            }
          } @else {
            @for (r of items(); track r.id) {
              <li><ng-container *ngTemplateOutlet="row; context: { $implicit: r }" /></li>
            }
          }
        </ul>
        <ng-template #row let-r>
          <a
            [routerLink]="panelLink('exchange', r.id)"
            [queryParamsHandling]="'merge'"
            class="flex items-center gap-3 rounded-xl border border-transparent bg-surface p-3 transition-colors hover:bg-surface-2"
            [class]="
              r.awaitingMe ? 'border-accent shadow-[3px_3px_0_0_var(--vs-accent)]' : 'border-line'
            "
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent text-sm font-semibold text-accent-fg"
            >
              @if (r.counterpart.avatarUrl) {
                <img [src]="r.counterpart.avatarUrl" alt="" class="h-full w-full object-cover" />
              } @else {
                {{
                  r.counterpart.guest
                    ? '?'
                    : (r.counterpart.displayName || '?').slice(0, 1).toUpperCase()
                }}
              }
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">
                {{
                  (r.role === 'holder' ? 'exchange.list.from' : 'exchange.list.to')
                    | transloco
                      : {
                          name: r.counterpart.guest
                            ? ('common.guest' | transloco)
                            : r.counterpart.displayName || (nameless(r.counterpart) | transloco),
                        }
                }}
              </span>
              <span class="block truncate text-xs text-muted">
                {{
                  'exchange.list.videos'
                    | transloco: { count: r.requested.length, title: r.requested[0]?.title ?? '' }
                }}
                · {{ r.updatedAt | appDate: 'medium' }}
              </span>
              <!-- What is on the table now and the last words said. -->
              <span class="block truncate text-xs text-muted" data-testid="request-deal">
                <span class="font-medium text-text">{{
                  'exchange.list.deal' | transloco: { give: r.deal.give, get: r.deal.get }
                }}</span>
                @if (r.deal.lastMessage) {
                  · {{ 'exchange.list.dealMessage' | transloco: { message: r.deal.lastMessage } }}
                }
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              @if (r.round > 0) {
                <span class="text-xs text-muted">{{
                  'exchange.round' | transloco: { n: r.round }
                }}</span>
              }
              <span class="rounded px-1.5 py-0.5 text-[11px]" [class]="badgeClass(r)">
                {{
                  (r.status === 'OPEN'
                    ? r.awaitingMe
                      ? 'exchange.status.awaitingMe'
                      : 'exchange.status.awaitingThem'
                    : 'exchange.status.' + r.status
                  ) | transloco
                }}
              </span>
            </span>
            <span class="flex -space-x-2">
              @for (v of r.requested.slice(0, 3); track v.id) {
                <span class="h-8 w-12 overflow-hidden rounded border border-surface bg-surface-2">
                  @if (v.thumbnailUrl) {
                    <img
                      [src]="v.thumbnailUrl"
                      [appSensitiveBlur]="v.sensitive && r.role !== 'holder'"
                      alt=""
                      class="h-full w-full object-cover"
                    />
                  }
                </span>
              }
            </span>
          </a>
        </ng-template>
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
export class ExchangePage {
  protected readonly nameless = nameless;
  protected readonly panelLink = panelLink;
  protected readonly tabList = TAB_LIST;
  protected readonly tabClass = tabClass;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly exchange = inject(ExchangeStore);

  readonly tab = input<string | undefined>(undefined);
  protected readonly tabs = TABS;
  protected readonly activeTab = signal<ExchangeTab>('incoming');
  protected readonly items = signal<RequestSummaryDto[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  /** The next page, as the end of the list comes near. */
  protected readonly next = () => this.loadMore();
  protected readonly error = signal<string | null>(null);
  protected readonly isEmpty = computed(() => this.loaded() && this.items().length === 0);
  protected readonly groups = computed(() => groupByCounterpart(this.items()));

  constructor() {
    effect(() => {
      const t = this.tab();
      if (t && (TABS as string[]).includes(t))
        untracked(() => this.activeTab.set(t as ExchangeTab));
    });
    effect(() => {
      this.activeTab();
      this.exchange.version();
      untracked(() => void this.load());
    });
  }

  protected setTab(tab: ExchangeTab): void {
    this.activeTab.set(tab);
    // merge: the page under the panel keeps its own address (`?folder=`, `?category=`)
    void this.router.navigate([], {
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected badgeClass(r: RequestSummaryDto): string {
    if (r.status === 'OPEN')
      return r.awaitingMe ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted';
    if (r.status === 'ACCEPTED') return 'bg-success/15 text-success';
    if (r.status === 'DECLINED') return 'bg-danger/15 text-danger';
    return 'bg-surface-2 text-muted';
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.invoke(exchangeList, { tab: this.activeTab(), limit: PAGE });
      this.items.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loading()) return;
    this.loading.set(true);
    try {
      const page = await this.api.invoke(exchangeList, {
        tab: this.activeTab(),
        cursor,
        limit: PAGE,
      });
      this.items.update((list) => [
        ...list,
        ...page.items.filter((i) => !list.some((x) => x.id === i.id)),
      ]);
      this.nextCursor.set(page.nextCursor);
    } finally {
      this.loading.set(false);
    }
  }
}

import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideArrowLeftRight } from '@ng-icons/lucide';

import {
  Api,
  type SocialCountsDto,
  type SocialList,
  type SocialListItemDto,
  socialList,
} from '../../api';
import { errorText, toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TAB_LIST, tabClass } from '../../shared/ui/tabs/tabs';
import { NotFoundPage } from '../not-found/not-found';
import { profileLink } from '../../core/navigation/user-links';

const LISTS: SocialList[] = ['friends', 'followers', 'following'];
const PAGE = 50;

/** /@username/friends?list= — public lists of friends, followers and following. */
@Component({
  selector: 'app-friends-page',
  imports: [
    EmptyStateComponent,
    TranslocoPipe,
    RouterLink,
    NgIcon,
    AlertComponent,
    AutoMoreComponent,
    SpinnerComponent,
    NotFoundPage,
    PageHeadComponent,
    AvatarComponent,
  ],
  providers: [provideIcons({ lucideArrowLeft, lucideArrowLeftRight })],
  template: `
    @if (notFound()) {
      <app-not-found />
    } @else {
      <div>
        <a
          [routerLink]="profileLink(username())"
          class="label-mono mb-4 inline-flex items-center gap-1.5 text-muted hover:text-text"
        >
          <ng-icon name="lucideArrowLeft" size="14" />&#64;{{ username() }}
        </a>
        <app-page-head [title]="'social.listsTitle' | transloco" />
        <nav [class]="tabList" role="tablist">
          @for (l of lists; track l) {
            <button
              type="button"
              role="tab"
              [class]="tabClass(activeList() === l)"
              [attr.aria-selected]="activeList() === l"
              (click)="setList(l)"
            >
              {{ 'social.counts.' + l | transloco }}
              @if (counts(); as c) {
                <span class="font-mono text-xs opacity-70">{{ c[l] }}</span>
              }
            </button>
          }
        </nav>
        @if (error(); as message) {
          <app-alert kind="error">{{ message }}</app-alert>
        } @else if (!loaded()) {
          <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
        } @else if (items().length === 0) {
          <app-empty-state [text]="'social.empty.' + activeList() | transloco" [seed]="9" />
        } @else {
          <!-- One person per row: the name on its own line, below it in small
               light type the handle, the exchanges with the list's owner (owner only, a quiet
               accent chip with just the number) and their videos. -->
          <ul class="flex flex-col gap-2" data-testid="social-list">
            @for (u of items(); track u.id) {
              <li>
                <!-- Someone who hid their page is here for the list's owner, without a link. -->
                <a
                  [routerLink]="u.pageHidden && !auth.isAdmin() ? null : profileLink(u.username)"
                  class="group flex items-center gap-4 rounded-xl bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <app-avatar [url]="u.avatarUrl" [name]="u.displayName" [size]="48" />
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-[15px] font-semibold group-hover:text-accent-text"
                      data-testid="person-name"
                      >{{ u.displayName }}</span
                    >
                    <span
                      class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-light text-muted"
                    >
                      <span class="font-mono">&#64;{{ u.username }}</span>
                      @if (u.exchanges) {
                        <span
                          class="inline-flex h-5 items-center gap-1 rounded-full bg-accent-soft px-2 font-mono text-[11px] font-semibold text-accent-text"
                          [attr.title]="
                            'social.stats.exchanges' | transloco: { count: u.exchanges }
                          "
                          [attr.aria-label]="
                            'social.stats.exchanges' | transloco: { count: u.exchanges }
                          "
                          data-testid="exchanges"
                        >
                          <ng-icon name="lucideArrowLeftRight" size="12" />{{ u.exchanges }}
                        </span>
                      }
                      <span class="flex items-center gap-x-1.5" data-testid="video-counts">
                        <!-- The number inside the text: a language agrees the word with it. -->
                        <span>{{
                          'social.stats.public' | transloco: { count: u.videos.public }
                        }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{
                          'social.stats.private' | transloco: { count: u.videos.private }
                        }}</span>
                        <span aria-hidden="true">·</span>
                        <span>{{
                          'social.stats.received' | transloco: { count: u.videos.received }
                        }}</span>
                      </span>
                    </span>
                  </span>
                </a>
              </li>
            }
          </ul>
          <app-auto-more
            class="mt-2"
            [more]="items().length < total()"
            [count]="items().length"
            [busy]="loading()"
            [load]="next"
          />
        }
      </div>
    }
  `,
})
export class FriendsPage {
  protected readonly profileLink = profileLink;
  protected readonly tabList = TAB_LIST;
  protected readonly tabClass = tabClass;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthStore);

  readonly username = input.required<string>();
  /** Query parameter `list`. */
  readonly list = input<string>();

  protected readonly lists = LISTS;
  protected readonly activeList = computed<SocialList>(() => {
    const l = this.list();
    return LISTS.includes(l as SocialList) ? (l as SocialList) : 'friends';
  });
  protected readonly items = signal<SocialListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly counts = signal<SocialCountsDto | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  /** The next page, as the end of the list comes near. */
  protected readonly next = () => this.loadMore();
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);

  constructor() {
    effect(() => {
      const username = this.username();
      const list = this.activeList();
      untracked(() => {
        this.items.set([]);
        this.loaded.set(false);
        void this.fetch(username, list, 0);
      });
    });
  }

  protected setList(list: SocialList): void {
    void this.router.navigate([], {
      queryParams: { list },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected loadMore(): void {
    void this.fetch(this.username(), this.activeList(), this.items().length);
  }

  private async fetch(username: string, list: SocialList, offset: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.invoke(socialList, { username, list, offset, limit: PAGE });
      if (username !== this.username() || list !== this.activeList()) return;
      this.items.update((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      this.total.set(page.total);
      this.counts.set(page.counts);
      this.loaded.set(true);
    } catch (e) {
      const err = toApiError(e);
      if (err.statusCode === 404) this.notFound.set(true);
      else this.error.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }
}

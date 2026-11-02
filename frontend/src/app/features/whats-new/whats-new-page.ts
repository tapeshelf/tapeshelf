import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type WhatsNewItemDto, whatsNewList } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { closingPanel } from '../../core/navigation/panels';
import { profileLink, videoLink, videoState } from '../../core/navigation/user-links';
import { WhatsNewStore } from '../../core/whats-new/whats-new.store';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';

const PAGE = 30;

/**
 * "What's new": the new videos of the people I follow, newest first, no ranking.
 * What came since the last look carries a dot; opening the panel is looking.
 */
@Component({
  selector: 'app-whats-new-page',
  imports: [
    TranslocoPipe,
    RouterLink,
    AlertComponent,
    AutoMoreComponent,
    EmptyStateComponent,
    PageHeadComponent,
    SpinnerComponent,
    ThumbScrubComponent,
    AppDatePipe,
    DurationPipe,
  ],
  template: `
    <div>
      <app-page-head [title]="'whatsNew.title' | transloco" />
      <p class="mb-5 text-sm text-muted">{{ 'whatsNew.lead' | transloco }}</p>
      @if (error(); as message) {
        <app-alert kind="error">{{ message }}</app-alert>
      } @else if (!loaded()) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (items().length === 0) {
        <app-empty-state [text]="'whatsNew.empty' | transloco" [seed]="31" />
      } @else {
        <ul class="flex flex-col gap-1.5" data-testid="whats-new-list">
          @for (item of items(); track item.video.id) {
            <li
              class="flex items-center gap-3 rounded-lg p-1.5 hover:bg-surface-2"
              [attr.data-testid]="item.isNew ? 'whats-new-item-new' : 'whats-new-item'"
            >
              <a
                class="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2"
                [routerLink]="videoOf(item)"
                [state]="stateOf(item)"
                [attr.aria-label]="item.video.title"
                tabindex="-1"
              >
                <app-thumb-scrub
                  [thumbnailUrl]="item.video.thumbnailUrl"
                  [frameUrls]="item.video.frameUrls"
                  [alt]="''"
                  [restricted]="sensitive.blurs(item.video)"
                />
                @if (item.video.durationSec) {
                  <span
                    class="pointer-events-none absolute right-1 bottom-1 rounded bg-scrim px-1 font-mono text-[10px] text-white"
                    >{{ item.video.durationSec | duration }}</span
                  >
                }
              </a>
              <div class="min-w-0 flex-1">
                <a
                  class="block truncate text-sm font-semibold hover:underline"
                  [routerLink]="videoOf(item)"
                  [state]="stateOf(item)"
                  >{{ item.video.title }}</a
                >
                <p class="label-mono flex items-center gap-2 truncate text-muted">
                  <a class="truncate hover:text-text" [routerLink]="authorOf(item)">{{
                    item.video.author.displayName
                  }}</a>
                  <span aria-hidden="true">·</span>
                  <span class="shrink-0">{{ item.at | appDate: 'short' }}</span>
                  @if (item.video.visibility === 'PRIVATE') {
                    <span class="shrink-0">· {{ 'whatsNew.private' | transloco }}</span>
                  }
                </p>
              </div>
              @if (item.isNew) {
                <span
                  class="mr-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                  role="img"
                  [attr.aria-label]="'whatsNew.new' | transloco"
                ></span>
              }
            </li>
          }
        </ul>
        <app-auto-more
          class="mt-2"
          [more]="hasMore()"
          [count]="items().length"
          [busy]="loading()"
          [load]="next"
        />
      }
    </div>
  `,
})
export class WhatsNewPage {
  private readonly api = inject(Api);
  private readonly store = inject(WhatsNewStore);
  private readonly t = inject(TranslocoService);
  protected readonly sensitive = inject(SensitiveContentService);
  protected readonly items = signal<WhatsNewItemDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The last page said more follows (the server reads one row ahead instead of counting all). */
  protected readonly hasMore = signal(false);
  /** The next page, as the end of the list comes near. */
  protected readonly next = () => this.load();

  constructor() {
    void this.load().then(() => this.store.markSeen());
  }

  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      const page = await this.api.invoke(whatsNewList, {
        offset: this.items().length,
        limit: PAGE,
      });
      this.items.update((list) => [
        ...list,
        ...page.items.filter((i) => !list.some((x) => x.video.id === i.video.id)),
      ]);
      this.hasMore.set(page.hasMore);
      this.loaded.set(true);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loading.set(false);
    }
  }

  /** A video opens as a page in the author's shelf; the panel closes on the way. */
  protected videoOf(item: WhatsNewItemDto): unknown[] {
    return closingPanel(videoLink(item.video.code));
  }

  protected stateOf(item: WhatsNewItemDto) {
    return videoState(item.video.author.username);
  }

  protected authorOf(item: WhatsNewItemDto): unknown[] {
    return closingPanel(profileLink(item.video.author.username));
  }
}

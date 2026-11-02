import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { type NotificationDto } from '../../api';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { NotificationItemComponent } from './notification-item';
import { isPanelLink, panelLink } from '../../core/navigation/panels';

/** /notifications — the full list. */
@Component({
  selector: 'app-notifications-page',
  imports: [
    EmptyStateComponent,
    TranslocoPipe,
    RouterLink,
    AlertComponent,
    AutoMoreComponent,
    ButtonDirective,
    SpinnerComponent,
    NotificationItemComponent,
    PageHeadComponent,
  ],
  template: `
    <div>
      <app-page-head [title]="'notifications.title' | transloco">
        <a
          [routerLink]="panelLink('settings', 'notifications')"
          [queryParamsHandling]="'merge'"
          appButton
          variant="ghost"
          size="sm"
        >
          {{ 'notifications.settings' | transloco }}
        </a>
        @if (store.unread() > 0) {
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            (click)="store.markAllRead()"
          >
            {{ 'notifications.markAllRead' | transloco }}
          </button>
        }
      </app-page-head>
      @if (store.error(); as error) {
        <app-alert kind="error">{{ error }}</app-alert>
      } @else if (!store.loaded()) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (store.items().length === 0) {
        <app-empty-state [text]="'notifications.empty' | transloco" [seed]="5" />
      } @else {
        <ul class="divide-y divide-border overflow-hidden rounded-xl bg-surface">
          @for (item of store.items(); track item.id) {
            <li>
              <button
                type="button"
                class="w-full text-left hover:bg-surface-2"
                (click)="open(item)"
              >
                <app-notification-item [item]="item" />
              </button>
            </li>
          }
        </ul>
        <app-auto-more
          class="mt-2"
          [more]="store.hasMore()"
          [count]="store.items().length"
          [busy]="store.loading()"
          [load]="loadMore"
        />
      }
    </div>
  `,
})
export class NotificationsPage {
  protected readonly panelLink = panelLink;
  protected readonly store = inject(NotificationsStore);
  /** The next page, as the end of the list comes near. */
  protected readonly loadMore = () => this.store.loadMore();
  private readonly router = inject(Router);

  constructor() {
    void this.store.load();
  }

  protected open(item: NotificationDto): void {
    void this.store.markRead(item.id);
    const { link, query } = NotificationItemComponent.targetOf(item);
    if (link)
      void this.router.navigate(
        link,
        isPanelLink(link) ? { queryParamsHandling: 'merge' } : { queryParams: query },
      );
  }
}

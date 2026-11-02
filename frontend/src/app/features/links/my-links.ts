import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCopy,
  lucideLockKeyhole,
  lucideMail,
  lucideSquareArrowOutUpRight,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type MyLinkDto, linksMine, linksRevoke } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { MyExchangeLinks } from '../deals/my-exchange-links';
import { MyAnonymousLinks } from './my-anonymous-links';
import { linkUrl, timeLeft } from './links';

/**
 * "My links": the temporary links that still work, with the time left,
 * whether they have a password or an address; copy one again, or take it back (then it is a 404).
 * Below them the links for an exchange and the anonymous links to the shelf.
 */
@Component({
  selector: 'app-my-links',
  imports: [
    NgIcon,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    ButtonDirective,
    EmptyStateComponent,
    PageHeadComponent,
    SpinnerComponent,
    MyExchangeLinks,
    MyAnonymousLinks,
  ],
  providers: [
    provideIcons({ lucideCopy, lucideLockKeyhole, lucideMail, lucideSquareArrowOutUpRight }),
  ],
  template: `
    <div>
      <app-page-head [title]="'links.mine.title' | transloco" />
      <p class="mb-5 text-sm text-muted">{{ 'links.mine.lead' | transloco }}</p>
      @if (error(); as message) {
        <app-alert kind="error">{{ message }}</app-alert>
      } @else if (links() === null) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (links()!.length === 0) {
        <app-empty-state [text]="'links.mine.empty' | transloco" [seed]="152" />
      } @else {
        <ul class="flex flex-col gap-2" data-testid="my-links">
          @for (link of links(); track link.id) {
            @let left = remaining(link);
            <li
              class="flex flex-wrap items-center gap-3 rounded-lg border-2 border-border p-2.5"
              data-testid="my-link"
            >
              <div class="flex min-w-[15rem] flex-1 items-center gap-3">
                <span class="flex shrink-0 -space-x-6" aria-hidden="true">
                  @for (pic of link.pictures; track $index) {
                    <span
                      class="h-12 w-16 overflow-hidden rounded-md border-2 border-surface bg-surface-2 shadow-sm"
                      ><img [src]="pic" alt="" class="h-full w-full object-cover"
                    /></span>
                  }
                </span>
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 text-sm font-semibold">
                    {{ 'links.mine.count' | transloco: { count: link.count } }}
                    @if (link.hasPassword) {
                      <ng-icon
                        name="lucideLockKeyhole"
                        size="14"
                        class="text-muted"
                        [attr.aria-label]="'links.mine.password' | transloco"
                        [attr.title]="'links.mine.password' | transloco"
                      />
                    }
                    @if (link.email) {
                      <ng-icon
                        name="lucideMail"
                        size="14"
                        class="text-muted"
                        [attr.aria-label]="link.email"
                        [attr.title]="link.email"
                      />
                    }
                  </p>
                  <p class="label-mono text-muted" data-testid="my-link-left">
                    @if (left.days) {
                      {{ 'links.page.days' | transloco: { d: left.days } }}
                    }
                    {{ left.clock }} ·
                    {{
                      'links.mine.until'
                        | transloco: { date: link.expiresAt | appDate: 'd MMMM, HH:mm' }
                    }}
                    @if (link.opened) {
                      · {{ 'links.mine.opened' | transloco }}
                    }
                  </p>
                </div>
              </div>
              <div class="ml-auto flex shrink-0 gap-1">
                <a
                  appButton
                  variant="ghost"
                  size="sm"
                  target="_blank"
                  rel="noopener"
                  [href]="url(link)"
                  [attr.aria-label]="'links.mine.open' | transloco"
                  [attr.title]="'links.mine.open' | transloco"
                  ><ng-icon name="lucideSquareArrowOutUpRight" size="15"
                /></a>
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="sm"
                  data-testid="my-link-copy"
                  (click)="copy(link)"
                >
                  <ng-icon name="lucideCopy" size="14" />{{ 'links.dialog.copy' | transloco }}
                </button>
                <button
                  type="button"
                  appButton
                  variant="danger"
                  size="sm"
                  [disabled]="busy()"
                  data-testid="my-link-revoke"
                  (click)="revoke(link)"
                >
                  {{ 'links.mine.revoke' | transloco }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
      <app-my-exchange-links />
      <app-my-anonymous-links />
    </div>
  `,
})
export class MyLinksPage {
  private readonly api = inject(Api);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  protected readonly links = signal<MyLinkDto[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly now = signal(Date.now());
  protected readonly url = (link: MyLinkDto) => linkUrl(link.code);

  constructor() {
    void this.load();
    // The time left ticks; a link that ran out leaves the list.
    const timer = setInterval(() => {
      this.now.set(Date.now());
      this.links.update((all) => all?.filter((l) => this.left(l) > 0) ?? all);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected remaining(link: MyLinkDto): { days: number; clock: string } {
    return timeLeft(this.left(link));
  }

  protected async copy(link: MyLinkDto): Promise<void> {
    await this.clipboard.copy(linkUrl(link.code), 'links.dialog.copied');
  }

  protected async revoke(link: MyLinkDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('links.mine.revokeTitle'),
      message: this.t.translate('links.mine.revokeText'),
      confirmLabel: this.t.translate('links.mine.revoke'),
      danger: true,
    });
    if (!ok || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(linksRevoke, { id: link.id });
      this.links.update((all) => all?.filter((l) => l.id !== link.id) ?? all);
      this.toast.success(this.t.translate('links.mine.revoked'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  /** By the seconds the server gave, from when the list came: not by this device's clock. */
  private left(link: MyLinkDto): number {
    return this.loadedAt + link.expiresInSec * 1000 - this.now();
  }

  private loadedAt = Date.now();

  private async load(): Promise<void> {
    try {
      const links = await this.api.invoke(linksMine);
      this.loadedAt = Date.now();
      this.links.set(links);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

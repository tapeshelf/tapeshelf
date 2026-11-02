import { Component, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideSquareArrowOutUpRight } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { exchangeLinksMine } from '../../api/fn/deals/exchange-links-mine';
import { exchangeLinksRevoke } from '../../api/fn/deals/exchange-links-revoke';
import type { MyExchangeLinkDto } from '../../api/models/my-exchange-link-dto';
import { errorText } from '../../core/api/api-error';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { exchangeLinkUrl } from './exchange-links';

/** "My links" → links for an exchange: they work until taken back; copy one again or take it back. */
@Component({
  selector: 'app-my-exchange-links',
  imports: [NgIcon, TranslocoPipe, ButtonDirective],
  providers: [provideIcons({ lucideCopy, lucideSquareArrowOutUpRight })],
  template: `
    @if (links()?.length) {
      <h2 class="mt-8 mb-1 text-base font-semibold">{{ 'deals.mine.title' | transloco }}</h2>
      <p class="mb-4 text-sm text-muted">{{ 'deals.mine.lead' | transloco }}</p>
      <ul class="flex flex-col gap-2" data-testid="my-exchange-links">
        @for (link of links(); track link.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-lg border-2 border-border p-2.5"
            data-testid="my-exchange-link"
          >
            <div class="flex min-w-[15rem] flex-1 items-center gap-3">
              <span class="flex shrink-0 -space-x-6" aria-hidden="true">
                @for (v of link.videos.slice(0, 3); track v.id) {
                  <span
                    class="h-12 w-16 overflow-hidden rounded-md border-2 border-surface bg-surface-2 shadow-sm"
                  >
                    @if (v.thumbnailUrl) {
                      <img [src]="v.thumbnailUrl" alt="" class="h-full w-full object-cover" />
                    }
                  </span>
                }
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">
                  {{
                    link.videos.length === 1
                      ? link.videos[0]!.title
                      : ('links.mine.count' | transloco: { count: link.videos.length })
                  }}
                </p>
                <p class="label-mono text-muted">
                  {{ 'deals.mine.deals' | transloco: { count: link.deals } }}
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
              <button type="button" appButton variant="secondary" size="sm" (click)="copy(link)">
                <ng-icon name="lucideCopy" size="14" />{{ 'links.dialog.copy' | transloco }}
              </button>
              <button
                type="button"
                appButton
                variant="danger"
                size="sm"
                [disabled]="busy()"
                data-testid="my-exchange-link-revoke"
                (click)="revoke(link)"
              >
                {{ 'links.mine.revoke' | transloco }}
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class MyExchangeLinks {
  private readonly api = inject(Api);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  protected readonly links = signal<MyExchangeLinkDto[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly url = (link: MyExchangeLinkDto) => exchangeLinkUrl(link.code);

  constructor() {
    this.api
      .invoke(exchangeLinksMine)
      .then((links) => this.links.set(links))
      .catch(() => this.links.set([]));
  }

  protected async copy(link: MyExchangeLinkDto): Promise<void> {
    await this.clipboard.copy(exchangeLinkUrl(link.code), 'deals.linkCopied');
  }

  protected async revoke(link: MyExchangeLinkDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('deals.mine.revokeTitle'),
      message: this.t.translate('deals.mine.revokeText'),
      confirmLabel: this.t.translate('links.mine.revoke'),
      danger: true,
    });
    if (!ok || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(exchangeLinksRevoke, { id: link.id });
      this.links.update((all) => all?.filter((l) => l.id !== link.id) ?? all);
      this.toast.success(this.t.translate('links.mine.revoked'));
    } catch (e) {
      this.toast.error(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

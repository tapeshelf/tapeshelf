import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { exchangeLinksCreate } from '../../api/fn/deals/exchange-links-create';
import { errorText } from '../../core/api/api-error';
import { ToastService } from '../../shared/ui/toast/toast.service';

/** The address of an exchange link. */
export function exchangeLinkUrl(code: string): string {
  return `${location.origin}/x/${code}`;
}

/** "Copy link → For an exchange": makes (or finds) the link and puts it on the clipboard. */
@Injectable({ providedIn: 'root' })
export class ExchangeLinks {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  async copy(videoIds: string[]): Promise<void> {
    if (!videoIds.length) return;
    const url = this.api
      .invoke(exchangeLinksCreate, { body: { videoIds } })
      .then((link) => exchangeLinkUrl(link.code));
    try {
      // The clipboard takes the text still to come within the click, as Safari wants it.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': url.then((u) => new Blob([u], { type: 'text/plain' })),
          }),
        ]);
      else await navigator.clipboard.writeText(await url);
      this.toast.success(this.t.translate('deals.linkCopied'));
    } catch {
      // The server's refusal, else the clipboard's: the link was made and is in "My links".
      const refused = await url.then(
        () => null,
        (err: unknown) => err,
      );
      this.toast.error(refused ? errorText(refused) : this.t.translate('deals.linkNotCopied'));
    }
  }
}

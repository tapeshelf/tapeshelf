import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { ToastService } from '../../shared/ui/toast/toast.service';

/** Puts a text on the clipboard and says so in a toast — or says it could not. */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  /** `done` is the dictionary key of the toast on success; resolves to whether it worked. */
  async copy(text: string, done: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(this.t.translate(done));
      return true;
    } catch {
      this.toast.error(this.t.translate('errors.unknown'));
      return false;
    }
  }
}

import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ButtonDirective } from '../button/button.directive';

export interface ConfirmOptions {
  /** Already translated. */
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslocoPipe, ButtonDirective],
  template: `
    <div
      class="w-[min(420px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="alertdialog"
      [attr.aria-label]="data.title"
    >
      <h2 class="text-base font-semibold">{{ data.title }}</h2>
      @if (data.message) {
        <p class="mt-2 text-sm text-muted">{{ data.message }}</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(false)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="button"
          appButton
          [variant]="data.danger ? 'danger' : 'primary'"
          cdkFocusInitial
          (click)="ref.close(true)"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean>(ConfirmDialogComponent, {
      data: options,
      backdropClass: 'vs-backdrop',
      autoFocus: '[cdkFocusInitial]',
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}

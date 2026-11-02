import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { type HintStateDto } from '../../api';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { ButtonDirective } from '../../shared/ui/button/button.directive';

/** Guest modal: only registered users can request; log in or sign up and come back. */
@Component({
  selector: 'app-guest-request-dialog',
  imports: [TranslocoPipe, RouterLink, ButtonDirective],
  template: `
    <div
      class="w-[min(440px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'exchange.guest.title' | transloco"
      data-testid="guest-dialog"
    >
      <h2 class="text-base font-semibold">{{ 'exchange.guest.title' | transloco }}</h2>
      <p class="mt-2 text-sm text-muted">{{ 'exchange.guest.text' | transloco }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <a
          appButton
          variant="secondary"
          routerLink="/login"
          [queryParams]="{ returnTo: returnTo }"
          (click)="ref.close()"
        >
          {{ 'nav.login' | transloco }}
        </a>
        <a
          appButton
          routerLink="/register"
          [queryParams]="{ returnTo: returnTo }"
          (click)="ref.close()"
        >
          {{ 'nav.register' | transloco }}
        </a>
      </div>
    </div>
  `,
})
export class GuestRequestDialog {
  protected readonly ref = inject(DialogRef);
  protected readonly returnTo = inject(Router).url;
}

export interface HintDialogData {
  state: HintStateDto;
}

/** Hint modal: explains requests; "don't show again" unlocks after N shows. */
@Component({
  selector: 'app-request-hint-dialog',
  imports: [TranslocoPipe, FormsModule, ButtonDirective],
  template: `
    <div
      class="w-[min(520px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'exchange.hint.title' | transloco"
      data-testid="hint-dialog"
    >
      <h2 class="text-base font-semibold">{{ 'exchange.hint.title' | transloco }}</h2>
      <p class="mt-2 text-sm">{{ 'exchange.hint.text' | transloco }}</p>
      @if (data.state.collectionEmpty) {
        <p class="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-text">
          {{ 'exchange.hint.emptyTip' | transloco }}
        </p>
      }
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        @if (data.state.seenCount >= data.state.minShows) {
          <label class="inline-flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" [(ngModel)]="dontShow" />
            {{ 'exchange.hint.dontShow' | transloco }}
          </label>
        } @else {
          <span></span>
        }
        <div class="flex gap-2">
          <button type="button" appButton variant="ghost" (click)="ref.close(null)">
            {{ 'common.cancel' | transloco }}
          </button>
          <button type="button" appButton (click)="ref.close({ dontShow })">
            {{ 'exchange.hint.confirm' | transloco }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RequestHintDialog {
  protected readonly data = inject<HintDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<{ dontShow: boolean } | null>>(DialogRef);
  protected dontShow = false;
}

/** Shows the right modal before a request is sent; resolves true when the user wants to proceed. */
@Injectable({ providedIn: 'root' })
export class RequestGate {
  private readonly dialog = inject(Dialog);
  private readonly exchange = inject(ExchangeStore);
  readonly busy = signal(false);

  guest(): void {
    this.dialog.open(GuestRequestDialog, {
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
  }

  /** Hint every time until dismissed; counts the show on the server. */
  async confirm(): Promise<boolean> {
    const state = this.exchange.hint() ?? (await this.exchange.loadHint());
    if (state.dismissed) return true;
    await this.exchange.hintSeen();
    const ref = this.dialog.open<{ dontShow: boolean } | null>(RequestHintDialog, {
      data: { state: this.exchange.hint() ?? state },
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    const result = await firstValueFrom(ref.closed);
    if (!result) return false;
    if (result.dontShow) await this.exchange.hintDismiss().catch(() => undefined);
    return true;
  }
}

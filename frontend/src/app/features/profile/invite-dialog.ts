import { DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type InviteDto, invitesMine, invitesRenew } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';

/** "Invite a friend" on the own shelf: the link, its terms, a new one. */
@Component({
  selector: 'app-invite-dialog',
  imports: [
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
  ],
  template: `
    <div
      class="flex w-[min(520px,calc(100vw-2rem))] flex-col gap-4 rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'invites.dialogTitle' | transloco"
      data-testid="invite-dialog"
    >
      <div>
        <h2 class="text-base font-semibold">{{ 'invites.dialogTitle' | transloco }}</h2>
        <p class="mt-1 text-sm text-muted">{{ 'invites.dialogLead' | transloco }}</p>
      </div>
      @if (error(); as message) {
        <app-alert kind="error">{{ message }}</app-alert>
      }
      @if (invite(); as i) {
        <div class="flex gap-2">
          <input
            appInput
            type="text"
            readonly
            class="min-w-0 flex-1 font-mono text-xs"
            [value]="url()"
            [attr.aria-label]="'invites.dialogTitle' | transloco"
            data-testid="invite-link"
            (focus)="$any($event.target).select()"
          />
          <button type="button" appButton (click)="copy()">
            {{ 'invites.copy' | transloco }}
          </button>
        </div>
        <p class="label-mono text-muted" data-testid="invite-terms">
          {{
            'invites.terms'
              | transloco
                : { date: i.expiresAt | appDate: 'mediumDate', uses: i.uses, max: i.maxUses }
          }}
        </p>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            appButton
            variant="ghost"
            size="sm"
            [disabled]="busy()"
            [attr.title]="'invites.renewHint' | transloco"
            data-testid="invite-renew"
            (click)="renew()"
          >
            {{ 'invites.renew' | transloco }}
          </button>
          <button type="button" appButton variant="secondary" (click)="ref.close()">
            {{ 'common.close' | transloco }}
          </button>
        </div>
      } @else if (!error()) {
        <div class="flex justify-center py-4 text-muted"><app-spinner /></div>
      }
    </div>
  `,
})
export class InviteDialog {
  protected readonly ref = inject(DialogRef);
  private readonly api = inject(Api);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  protected readonly invite = signal<InviteDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly url = computed(() => {
    const i = this.invite();
    return i ? `${location.origin}/invite/${i.code}` : '';
  });

  constructor() {
    void this.load(() => this.api.invoke(invitesMine));
  }

  protected renew(): Promise<void> {
    return this.load(() => this.api.invoke(invitesRenew));
  }

  protected async copy(): Promise<void> {
    await this.clipboard.copy(this.url(), 'invites.copied');
  }

  private async load(fn: () => Promise<InviteDto>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.invite.set(await fn());
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

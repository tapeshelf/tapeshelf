import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import {
  Api,
  twoFactorConfirm,
  twoFactorConfirmApp,
  twoFactorConfirmPasskey,
  twoFactorConfirmPasskeyOptions,
} from '../../../api';
import type { AppSetupDto } from '../../../api/models/app-setup-dto';
import { errorText } from '../../../core/api/api-error';
import { usePasskey } from '../../../core/auth/passkeys';
import { ClipboardService } from '../../../core/clipboard/clipboard.service';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { InputDirective } from '../../../shared/ui/field/input.directive';

const BOX =
  'w-[min(460px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard';

/** The app's QR code and key, then its first code. Closes with the recovery codes when it turned the step on. */
@Component({
  selector: 'app-two-factor-app-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputDirective,
    AutofocusDirective,
    AlertComponent,
  ],
  template: `
    <form
      [class]="box"
      role="dialog"
      [attr.aria-label]="'settings.security.twoFactor.setup.title' | transloco"
      (ngSubmit)="submit()"
    >
      <h2 class="text-base font-semibold">
        {{ 'settings.security.twoFactor.setup.title' | transloco }}
      </h2>
      <p class="mt-2 text-sm text-muted">
        {{ 'settings.security.twoFactor.setup.scan' | transloco }}
      </p>
      <img
        [src]="data.qr"
        alt=""
        class="mx-auto mt-4 size-48 rounded-md border-2 border-line bg-white p-1"
        data-testid="two-factor-qr"
      />
      <p class="label-mono mt-4 text-muted">
        {{ 'settings.security.twoFactor.setup.key' | transloco }}
      </p>
      <p class="mt-1 font-mono text-sm break-all select-all" data-testid="two-factor-secret">
        {{ grouped }}
      </p>
      <div class="mt-4">
        <label for="two-factor-app-code" class="label-mono mb-1 block text-muted">{{
          'settings.security.twoFactor.setup.code' | transloco
        }}</label>
        <input
          id="two-factor-app-code"
          appInput
          appAutofocus
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="123456"
          [(ngModel)]="code"
          data-testid="two-factor-app-code"
        />
      </div>
      @if (error(); as message) {
        <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(undefined)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton [disabled]="busy() || code().trim().length !== 6">
          {{ 'settings.security.twoFactor.setup.submit' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class TwoFactorAppDialog {
  protected readonly data = inject<AppSetupDto>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<{ recoveryCodes: string[] | null }>>(DialogRef);
  private readonly api = inject(Api);
  protected readonly box = BOX;
  protected readonly grouped = this.data.secret.replace(/(.{4})/g, '$1 ').trim();
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invoke(twoFactorConfirmApp, {
        body: { code: this.code().trim() },
      });
      this.ref.close({ recoveryCodes: res.recoveryCodes ?? null });
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Recovery codes, shown once: copy, download, "I saved them". */
@Component({
  selector: 'app-recovery-codes-dialog',
  imports: [TranslocoPipe, ButtonDirective],
  template: `
    <div
      [class]="box"
      role="dialog"
      [attr.aria-label]="'settings.security.twoFactor.recovery.title' | transloco"
    >
      <h2 class="text-base font-semibold">
        {{ 'settings.security.twoFactor.recovery.title' | transloco }}
      </h2>
      <p class="mt-2 text-sm text-muted">
        {{ 'settings.security.twoFactor.recovery.text' | transloco }}
      </p>
      <ul
        class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border-2 border-line bg-surface-2 p-3 font-mono text-sm"
        data-testid="recovery-codes"
      >
        @for (c of codes; track c) {
          <li>{{ c }}</li>
        }
      </ul>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="copy()">
          {{ 'settings.security.twoFactor.recovery.copy' | transloco }}
        </button>
        <button type="button" appButton variant="ghost" (click)="download()">
          {{ 'settings.security.twoFactor.recovery.download' | transloco }}
        </button>
        <button type="button" appButton (click)="ref.close()">
          {{ 'settings.security.twoFactor.recovery.done' | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class RecoveryCodesDialog {
  protected readonly codes = inject<string[]>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly clipboard = inject(ClipboardService);
  protected readonly box = BOX;

  protected copy(): void {
    void this.clipboard.copy(this.codes.join('\n'), 'settings.security.twoFactor.recovery.copied');
  }

  protected download(): void {
    const url = URL.createObjectURL(
      new Blob([`${this.codes.join('\n')}\n`], { type: 'text/plain' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${location.hostname}-recovery-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** The second step again in this session: before changing the step, and for the admin panel. */
@Component({
  selector: 'app-confirm-step-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputDirective,
    AutofocusDirective,
    AlertComponent,
  ],
  template: `
    <form
      [class]="box"
      role="dialog"
      [attr.aria-label]="'settings.security.twoFactor.confirm.title' | transloco"
      (ngSubmit)="submit()"
    >
      <h2 class="text-base font-semibold">
        {{ 'settings.security.twoFactor.confirm.title' | transloco }}
      </h2>
      <p class="mt-2 text-sm text-muted">
        {{ 'settings.security.twoFactor.confirm.text' | transloco }}
      </p>
      @if (passkeys) {
        <button
          type="button"
          appButton
          variant="secondary"
          class="mt-4 w-full"
          [disabled]="busy()"
          (click)="passkey()"
        >
          {{ 'auth.secondStep.usePasskey' | transloco }}
        </button>
      }
      <div class="mt-4">
        <label for="confirm-step-code" class="label-mono mb-1 block text-muted">{{
          'settings.security.twoFactor.confirm.code' | transloco
        }}</label>
        <input
          id="confirm-step-code"
          appInput
          appAutofocus
          name="code"
          autocomplete="one-time-code"
          maxlength="16"
          [(ngModel)]="code"
          data-testid="confirm-step-code"
        />
      </div>
      @if (error(); as message) {
        <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(false)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton [disabled]="busy() || !filled()">
          {{ 'settings.security.twoFactor.confirm.submit' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class ConfirmStepDialog {
  protected readonly passkeys = inject<boolean>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(Api);
  protected readonly box = BOX;
  protected readonly code = signal('');
  protected readonly filled = computed(() => this.code().trim().length > 0);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): Promise<void> {
    return this.attempt(async () => {
      await this.api.invoke(twoFactorConfirm, { body: { code: this.code().trim() } });
      return true;
    });
  }

  protected passkey(): Promise<void> {
    return this.attempt(async () => {
      const { options } = await this.api.invoke(twoFactorConfirmPasskeyOptions);
      const response = await usePasskey(options);
      if (!response) return false;
      await this.api.invoke(twoFactorConfirmPasskey, { body: { response } });
      return true;
    });
  }

  private async attempt(run: () => Promise<boolean>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (await run()) this.ref.close(true);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class TwoFactorDialogs {
  private readonly dialog = inject(Dialog);

  /** Undefined when cancelled; else the recovery codes when this turned the step on. */
  async app(setup: AppSetupDto): Promise<{ recoveryCodes: string[] | null } | undefined> {
    return this.open(TwoFactorAppDialog, setup);
  }

  async recoveryCodes(codes: string[]): Promise<void> {
    await this.open(RecoveryCodesDialog, codes, true);
  }

  /** True once the step was passed. */
  async confirm(passkeys: boolean): Promise<boolean> {
    return (await this.open<boolean>(ConfirmStepDialog, passkeys)) ?? false;
  }

  private async open<R>(
    component: unknown,
    data: unknown,
    mustClose = false,
  ): Promise<R | undefined> {
    const ref = this.dialog.open<R>(component as never, {
      data,
      backdropClass: 'vs-backdrop',
      // The codes are shown once: closed with the button, not by a stray click or Escape.
      disableClose: mustClose,
    });
    return firstValueFrom(ref.closed);
  }
}

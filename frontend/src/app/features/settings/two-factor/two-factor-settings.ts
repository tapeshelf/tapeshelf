import { Component, computed, inject, resource, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  twoFactorAddPasskey,
  twoFactorNewRecoveryCodes,
  twoFactorPasskeyOptions,
  twoFactorRemoveApp,
  twoFactorRemovePasskey,
  twoFactorStartApp,
  twoFactorStatus,
  twoFactorTurnOff,
} from '../../../api';
import { errorText, toApiError } from '../../../core/api/api-error';
import { createPasskey, deviceName, passkeysSupported } from '../../../core/auth/passkeys';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../../shared/ui/alert/alert';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { ConfirmService } from '../../../shared/ui/confirm/confirm-dialog';
import { PromptService } from '../../../shared/ui/prompt/prompt-dialog';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from '../settings-section';
import { TwoFactorDialogs } from './two-factor-dialogs';

const ROW =
  'flex items-center justify-between gap-4 rounded-lg border-2 border-line bg-surface px-3 py-2 text-sm';

/**
 * Settings → Security → two-step sign-in: the authenticator app, passkeys and
 * recovery codes. Turning it on asks for the password; changing it later, for the step itself.
 */
@Component({
  selector: 'app-two-factor-settings',
  imports: [SettingsSectionComponent, TranslocoPipe, AppDatePipe, ButtonDirective, AlertComponent],
  template: `
    <app-settings-section
      [title]="'settings.security.twoFactor.title' | transloco"
      [description]="'settings.security.twoFactor.hint' | transloco"
    >
      @if (state(); as s) {
        @if (!s.available) {
          <p class="text-sm text-muted">
            {{ 'settings.security.twoFactor.needsPassword' | transloco }}
          </p>
        } @else {
          @if (s.required && !s.enabled) {
            <app-alert kind="warning" class="mb-4 block" data-testid="two-factor-admin">{{
              'settings.security.twoFactor.adminRequired' | transloco
            }}</app-alert>
          } @else if (s.required && !s.sessionConfirmed) {
            <app-alert kind="warning" class="mb-4 block">
              {{ 'settings.security.twoFactor.adminConfirm' | transloco }}
              <button
                type="button"
                appButton
                size="sm"
                variant="secondary"
                class="mt-2"
                (click)="confirmSession()"
              >
                {{ 'settings.security.twoFactor.confirm.submit' | transloco }}
              </button>
            </app-alert>
          }
          <p class="mb-4 text-sm" data-testid="two-factor-state">
            <span
              class="rounded px-1.5 py-0.5 text-xs"
              [class]="s.enabled ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted'"
              >{{
                (s.enabled ? 'settings.security.twoFactor.on' : 'settings.security.twoFactor.off')
                  | transloco
              }}</span
            >
          </p>
          <ul class="flex max-w-xl flex-col gap-2">
            <li [class]="row">
              <div class="min-w-0">
                <p>{{ 'settings.security.twoFactor.app.title' | transloco }}</p>
                <p class="text-xs text-muted">
                  {{ 'settings.security.twoFactor.app.hint' | transloco }}
                </p>
              </div>
              @if (s.app) {
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="removeApp()"
                >
                  {{ 'settings.security.twoFactor.remove' | transloco }}
                </button>
              } @else {
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="sm"
                  [disabled]="busy()"
                  (click)="addApp()"
                  data-testid="two-factor-add-app"
                >
                  {{ 'settings.security.twoFactor.app.add' | transloco }}
                </button>
              }
            </li>
            @for (k of s.passkeys; track k.id) {
              <li [class]="row" data-testid="passkey-row">
                <div class="min-w-0">
                  <p class="truncate">{{ k.name }}</p>
                  <p class="text-xs text-muted">
                    {{ 'settings.security.twoFactor.passkeys.added' | transloco }}
                    {{ k.createdAt | appDate: 'medium' }}
                    @if (k.lastUsedAt) {
                      · {{ 'settings.security.lastUsed' | transloco }}
                      {{ k.lastUsedAt | appDate: 'medium' }}
                    }
                  </p>
                </div>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="removePasskey(k.id, k.name)"
                >
                  {{ 'settings.security.twoFactor.remove' | transloco }}
                </button>
              </li>
            }
            <li [class]="row">
              <div class="min-w-0">
                <p>{{ 'settings.security.twoFactor.passkeys.title' | transloco }}</p>
                <p class="text-xs text-muted">
                  {{
                    (canMakePasskeys
                      ? 'settings.security.twoFactor.passkeys.hint'
                      : 'settings.security.twoFactor.passkeys.unsupported'
                    ) | transloco
                  }}
                </p>
              </div>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="busy() || !canMakePasskeys"
                (click)="addPasskey()"
                data-testid="two-factor-add-passkey"
              >
                {{ 'settings.security.twoFactor.passkeys.add' | transloco }}
              </button>
            </li>
            @if (s.enabled) {
              <li [class]="row">
                <div class="min-w-0">
                  <p>{{ 'settings.security.twoFactor.codes.title' | transloco }}</p>
                  <p class="text-xs text-muted" data-testid="recovery-left">
                    {{
                      'settings.security.twoFactor.codes.left'
                        | transloco: { count: s.recoveryCodesLeft }
                    }}
                  </p>
                </div>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="newCodes()"
                >
                  {{ 'settings.security.twoFactor.codes.renew' | transloco }}
                </button>
              </li>
            }
          </ul>
          @if (s.enabled) {
            @if (s.required) {
              <p class="mt-4 text-xs text-muted">
                {{ 'settings.security.twoFactor.adminKeeps' | transloco }}
              </p>
            } @else {
              <button
                type="button"
                appButton
                variant="danger"
                class="mt-4"
                [disabled]="busy()"
                (click)="turnOff()"
              >
                {{ 'settings.security.twoFactor.turnOff' | transloco }}
              </button>
            }
          }
        }
      }
    </app-settings-section>
  `,
})
export class TwoFactorSettingsComponent {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmService);
  private readonly prompt = inject(PromptService);
  private readonly dialogs = inject(TwoFactorDialogs);

  protected readonly row = ROW;
  protected readonly canMakePasskeys = passkeysSupported();
  protected readonly busy = signal(false);
  private readonly status = resource({ loader: () => this.api.invoke(twoFactorStatus) });
  protected readonly state = computed(() => this.status.value());

  async addApp(): Promise<void> {
    await this.change(async () => {
      const password = await this.password();
      if (password === null) return;
      const setup = await this.stepFirst(() =>
        this.api.invoke(twoFactorStartApp, { body: { password } }),
      );
      if (!setup) return;
      const done = await this.dialogs.app(setup);
      if (!done) return;
      await this.added(done.recoveryCodes, 'settings.security.twoFactor.toasts.appAdded');
    });
  }

  async addPasskey(): Promise<void> {
    await this.change(async () => {
      const password = await this.password();
      if (password === null) return;
      const res = await this.stepFirst(() =>
        this.api.invoke(twoFactorPasskeyOptions, { body: { password } }),
      );
      if (!res) return;
      const response = await createPasskey(res.options);
      if (!response) return;
      const added = await this.api.invoke(twoFactorAddPasskey, {
        body: { name: deviceName(), response },
      });
      await this.added(
        added.recoveryCodes ?? null,
        'settings.security.twoFactor.toasts.passkeyAdded',
      );
    });
  }

  async removeApp(): Promise<void> {
    if (!(await this.ask('removeApp'))) return;
    await this.change(async () => {
      if ((await this.stepFirst(() => this.api.invoke(twoFactorRemoveApp))) === null) return;
      this.toast.success(this.t.translate('settings.security.twoFactor.toasts.appRemoved'));
    });
  }

  async removePasskey(id: string, name: string): Promise<void> {
    if (!(await this.ask('removePasskey', { name }))) return;
    await this.change(async () => {
      if ((await this.stepFirst(() => this.api.invoke(twoFactorRemovePasskey, { id }))) === null)
        return;
      this.toast.success(this.t.translate('settings.security.twoFactor.toasts.passkeyRemoved'));
    });
  }

  async newCodes(): Promise<void> {
    if (!(await this.ask('renewCodes'))) return;
    await this.change(async () => {
      const res = await this.stepFirst(() => this.api.invoke(twoFactorNewRecoveryCodes));
      if (res?.recoveryCodes) await this.dialogs.recoveryCodes(res.recoveryCodes);
    });
  }

  async turnOff(): Promise<void> {
    if (!(await this.ask('turnOff', {}, true))) return;
    await this.change(async () => {
      if ((await this.stepFirst(() => this.api.invoke(twoFactorTurnOff))) === null) return;
      this.toast.success(this.t.translate('settings.security.twoFactor.toasts.off'));
    });
  }

  async confirmSession(): Promise<void> {
    if (await this.dialogs.confirm(this.hasPasskeys())) {
      this.toast.success(this.t.translate('settings.security.twoFactor.toasts.confirmed'));
      this.status.reload();
    }
  }

  /** Runs a change and reads the state again afterwards, whatever happened. */
  private async change(run: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await run();
    } catch (e) {
      this.toast.error(errorText(e));
    } finally {
      this.busy.set(false);
      this.status.reload();
    }
  }

  /**
   * The server asks for the second step before a change once the step is on and was not passed in
   * the last ten minutes: asked here, then the change is sent again. Null when it was not passed.
   */
  private async stepFirst<T>(call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch (e) {
      if (toApiError(e).code !== 'twoFactorConfirm') throw e;
      if (!(await this.dialogs.confirm(this.hasPasskeys()))) return null;
      return call();
    }
  }

  /** Turning the step on asks for the password; once it is on, the step itself guards changes. */
  private async password(): Promise<string | undefined | null> {
    if (this.state()?.enabled) return undefined;
    return this.prompt.prompt({
      title: this.t.translate('settings.security.twoFactor.password.title'),
      message: this.t.translate('settings.security.twoFactor.password.text'),
      label: this.t.translate('auth.currentPassword'),
      confirmLabel: this.t.translate('settings.security.twoFactor.password.submit'),
      inputType: 'password',
      required: true,
    });
  }

  private async added(codes: string[] | null, toast: string): Promise<void> {
    if (codes) {
      await this.dialogs.recoveryCodes(codes);
      this.toast.success(this.t.translate('settings.security.twoFactor.toasts.on'));
    } else this.toast.success(this.t.translate(toast));
  }

  private ask(
    kind: string,
    params: Record<string, unknown> = {},
    danger = false,
  ): Promise<boolean> {
    const key = `settings.security.twoFactor.ask.${kind}`;
    return this.confirmDialog.confirm({
      title: this.t.translate(`${key}.title`, params),
      message: this.t.translate(`${key}.message`, params),
      confirmLabel: this.t.translate(`${key}.confirm`),
      danger,
    });
  }

  private hasPasskeys(): boolean {
    return (this.state()?.passkeys.length ?? 0) > 0;
  }
}

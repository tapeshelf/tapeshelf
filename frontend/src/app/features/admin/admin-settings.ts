import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type Tier, adminSettings, adminUpdateSettings } from '../../api';
import { SiteConfig } from '../../core/site/site-config';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { TABLE, TABLE_WRAP, TD, TH, apiMessage } from './admin-ui';
import {
  type InstanceForm,
  type SettingsForm,
  type TierForm,
  fromForm,
  toForm,
} from './settings-form';

/**
 * Settings, applied without a restart: limits by tier in the cloud, one
 * set of limits on a self-hosted instance.
 */
@Component({
  selector: 'app-admin-settings',
  imports: [
    FormsModule,
    TranslocoPipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
  ],
  template: `
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (form(); as f) {
      <form class="flex max-w-3xl flex-col gap-6" (ngSubmit)="save()" data-testid="admin-settings">
        <section class="grid items-end gap-4 sm:grid-cols-3">
          <label class="flex flex-col gap-1">
            <span class="label-mono text-muted">{{
              'admin.settings.usernameChangeDays' | transloco
            }}</span>
            <input
              appInput
              type="number"
              min="0"
              max="3650"
              name="ucd"
              [(ngModel)]="f.usernameChangeDays"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="label-mono text-muted">{{
              'admin.settings.requestCooldownDays' | transloco
            }}</span>
            <input
              appInput
              type="number"
              min="0"
              max="3650"
              name="rcd"
              [(ngModel)]="f.requestCooldownDays"
              data-testid="setting-cooldown"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="label-mono text-muted">{{
              'admin.settings.requestHintMinShows' | transloco
            }}</span>
            <input
              appInput
              type="number"
              min="0"
              max="100"
              name="hint"
              [(ngModel)]="f.requestHintMinShows"
            />
          </label>
          <label class="flex items-center gap-2 sm:col-span-full">
            <input
              type="checkbox"
              name="registration"
              [(ngModel)]="f.registrationOpen"
              data-testid="setting-registration"
            />
            <span>{{ 'admin.settings.registrationOpen' | transloco }}</span>
          </label>
        </section>

        @if (site.hasTiers()) {
          <label class="flex max-w-xs flex-col gap-1">
            <span class="label-mono text-muted">{{
              'admin.settings.paymentGraceDays' | transloco
            }}</span>
            <input
              appInput
              type="number"
              min="0"
              max="60"
              name="grace"
              [(ngModel)]="f.paymentGraceDays"
              data-testid="setting-grace"
            />
          </label>
          <div [class]="tableWrap">
            <table [class]="table">
              <thead>
                <tr>
                  <th [class]="th">{{ 'admin.settings.limit' | transloco }}</th>
                  @for (tier of tiers; track tier) {
                    <th [class]="th">{{ 'common.tier.' + tier | transloco }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows; track row.key) {
                  <tr>
                    <td [class]="td">{{ row.label | transloco }}</td>
                    @for (tier of tiers; track tier) {
                      <td [class]="td">
                        <input
                          appInput="sm"
                          type="number"
                          [min]="row.min"
                          [max]="row.max"
                          [step]="row.step"
                          [name]="row.key + tier"
                          [attr.aria-label]="
                            (row.label | transloco) + ' · ' + ('common.tier.' + tier | transloco)
                          "
                          [(ngModel)]="f.tiers[tier][row.key]"
                          [attr.data-testid]="'setting-' + row.key + '-' + tier"
                        />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-sm text-muted">{{ 'admin.settings.hint' | transloco }}</p>
        } @else {
          <section class="grid items-end gap-4 sm:grid-cols-2" data-testid="instance-limits">
            @for (row of instanceRows; track row.key) {
              <label class="flex flex-col gap-1">
                <span class="label-mono text-muted">{{ row.label | transloco }}</span>
                <input
                  appInput
                  type="number"
                  [min]="row.min"
                  [max]="row.max"
                  [step]="row.step"
                  [name]="'instance-' + row.key"
                  [(ngModel)]="f.limits[row.key]"
                  [attr.data-testid]="'setting-' + row.key"
                />
              </label>
            }
          </section>
          <p class="text-sm text-muted">{{ 'admin.settings.instanceHint' | transloco }}</p>
        }
        <div>
          <button appButton type="submit" [disabled]="busy()" data-testid="admin-settings-save">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </form>
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminSettingsPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly site = inject(SiteConfig);
  protected readonly tiers: Tier[] = ['BASIC', 'PREMIUM'];
  /** Self-hosted: no tiers, downloads never limited; 0 GiB = no limit on file or shelf. */
  protected readonly instanceRows: {
    key: keyof InstanceForm;
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    { key: 'maxFileGiB', label: 'admin.settings.maxFile', min: 0, max: 1024, step: 0.001 },
    { key: 'storageQuotaGiB', label: 'admin.settings.quota', min: 0, max: 102400, step: 1 },
    { key: 'requestsPerDay', label: 'admin.settings.requestsPerDay', min: 0, max: 10000, step: 1 },
    {
      key: 'trashRetentionDays',
      label: 'admin.settings.trashRetentionDays',
      min: 1,
      max: 3650,
      step: 1,
    },
    {
      key: 'extensionPerDay',
      label: 'admin.settings.extensionPerDay',
      min: 0,
      max: 10000,
      step: 1,
    },
  ];
  /** One row per tier limit; 0 means "no limit" for the download ones (hint below the table). */
  protected readonly rows: {
    key: keyof TierForm;
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    { key: 'maxFileGiB', label: 'admin.settings.maxFile', min: 0.001, max: 1024, step: 0.001 },
    { key: 'storageQuotaGiB', label: 'admin.settings.quota', min: 0.001, max: 102400, step: 1 },
    { key: 'requestsPerDay', label: 'admin.settings.requestsPerDay', min: 0, max: 10000, step: 1 },
    {
      key: 'downloadsPerMonth',
      label: 'admin.settings.downloadsPerMonth',
      min: 0,
      max: 100000,
      step: 1,
    },
    {
      key: 'downloadSpeedMiB',
      label: 'admin.settings.downloadSpeed',
      min: 0,
      max: 10240,
      step: 0.1,
    },
    {
      key: 'downloadConcurrency',
      label: 'admin.settings.downloadConcurrency',
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: 'trashRetentionDays',
      label: 'admin.settings.trashRetentionDays',
      min: 1,
      max: 3650,
      step: 1,
    },
    {
      key: 'extensionPerDay',
      label: 'admin.settings.extensionPerDay',
      min: 0,
      max: 10000,
      step: 1,
    },
    {
      key: 'apiRateMultiplier',
      label: 'admin.settings.rateMultiplier',
      min: 0.1,
      max: 100,
      step: 0.1,
    },
  ];
  protected readonly form = signal<SettingsForm | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE.replace('min-w-[640px]', 'min-w-[420px]');
  protected readonly th = TH;
  protected readonly td = TD;

  constructor() {
    this.api
      .invoke(adminSettings)
      .then((s) => this.form.set(toForm(s)))
      .catch((e: unknown) => this.error.set(apiMessage(e, this.t)));
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    this.busy.set(true);
    try {
      this.form.set(toForm(await this.api.invoke(adminUpdateSettings, { body: fromForm(f) })));
      this.toast.success(this.t.translate('common.saved'));
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
    } finally {
      this.busy.set(false);
    }
  }
}

import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, authMe } from '../../api';
import { AuthStore } from '../../core/auth/auth.store';
import { BillingPortal } from '../../core/billing/billing-portal';
import { describeSubscription } from '../../core/billing/subscription-text';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { SettingsSectionComponent } from './settings-section';
import { LanguageService } from '../../core/i18n/language.service';
import { panelLink } from '../../core/navigation/panels';

/**
 * Settings → Plan (cloud only): the account's tier, when Pro ends and what the shelf may
 * hold; the subscription and Paddle's portal, or the way to Pro. The numbers come from the
 * account's plan (GET /api/auth/me), never from the dictionaries.
 */
@Component({
  selector: 'app-plan-settings',
  imports: [
    SettingsSectionComponent,
    RouterLink,
    TranslocoPipe,
    BytesPipe,
    ButtonDirective,
    ProgressBarComponent,
  ],
  template: `
    @if (plan(); as p) {
      <app-settings-section
        [title]="'settings.plan.title' | transloco"
        [description]="'settings.plan.hint' | transloco"
      >
        <div class="rounded-xl border-2 border-line bg-surface p-5" data-testid="plan-card">
          <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="font-display text-3xl leading-none font-bold" data-testid="plan-tier">{{
              'common.tier.' + p.tier | transloco
            }}</span>
            @if (p.tier === 'PREMIUM' && !p.subscription) {
              <span class="label-mono text-muted" data-testid="plan-until">
                @if (untilText(); as date) {
                  {{ 'settings.plan.until' | transloco: { date } }}
                } @else {
                  {{ 'settings.plan.noEnd' | transloco }}
                }
              </span>
            }
          </p>
          <dl class="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.shelf' | transloco }}</dt>
              <dd class="mt-1 text-sm">
                <span data-testid="plan-shelf">{{
                  'settings.plan.used'
                    | transloco
                      : {
                          used: p.usage.storageBytes | bytes,
                          quota: p.limits.storageQuotaBytes | bytes,
                        }
                }}</span>
                <app-progress-bar
                  class="mt-2"
                  [label]="'a11y.quota' | transloco"
                  [value]="shelfPercent()"
                />
              </dd>
            </div>
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.file' | transloco }}</dt>
              <dd class="mt-1 text-sm" data-testid="plan-file">
                {{ 'settings.plan.upTo' | transloco: { size: p.limits.maxFileBytes | bytes } }}
              </dd>
            </div>
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.requests' | transloco }}</dt>
              <dd class="mt-1 text-sm">{{ p.limits.requestsPerDay }}</dd>
            </div>
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.downloads' | transloco }}</dt>
              <dd class="mt-1 text-sm" data-testid="plan-downloads">
                @if (p.limits.downloadsPerMonth > 0) {
                  {{
                    'settings.plan.downloadsUsed'
                      | transloco
                        : { used: p.usage.downloadsThisMonth, limit: p.limits.downloadsPerMonth }
                  }}
                } @else {
                  {{ 'settings.plan.downloadsNoCount' | transloco }}
                }
              </dd>
            </div>
            <!-- Views and downloads this month. -->
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.traffic' | transloco }}</dt>
              <dd class="mt-1 text-sm">
                @if (p.limits.trafficBytesPerMonth > 0) {
                  <span data-testid="plan-traffic">{{
                    'settings.plan.used'
                      | transloco
                        : {
                            used: p.usage.trafficBytesThisMonth | bytes,
                            quota: p.limits.trafficBytesPerMonth | bytes,
                          }
                  }}</span>
                  <app-progress-bar
                    class="mt-2"
                    [label]="'settings.plan.traffic' | transloco"
                    [value]="trafficPercent()"
                  />
                } @else {
                  <span data-testid="plan-traffic">{{
                    'settings.plan.unlimited' | transloco
                  }}</span>
                }
              </dd>
            </div>
            <!-- The browser extension's daily limit. -->
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.extension' | transloco }}</dt>
              <dd class="mt-1 text-sm" data-testid="plan-extension">
                @if (p.limits.extensionPerDay > 0) {
                  {{
                    'settings.plan.extensionPerDay' | transloco: { count: p.limits.extensionPerDay }
                  }}
                } @else {
                  {{ 'settings.plan.unlimited' | transloco }}
                }
              </dd>
            </div>
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.trash' | transloco }}</dt>
              <dd class="mt-1 text-sm" data-testid="plan-trash">
                {{ 'settings.plan.trashDays' | transloco: { count: p.limits.trashRetentionDays } }}
              </dd>
            </div>
            <div>
              <dt class="label-mono text-muted">{{ 'settings.plan.speed' | transloco }}</dt>
              <dd class="mt-1 text-sm" data-testid="plan-speed">
                @if (speedMb(); as mb) {
                  {{ 'settings.plan.speedValue' | transloco: { mb } }}
                } @else {
                  {{ 'settings.plan.fullSpeed' | transloco }}
                }
              </dd>
            </div>
          </dl>
          @if (p.limits.trafficBytesPerMonth > 0) {
            <p class="mt-4 text-sm text-muted" data-testid="plan-traffic-note">
              {{ 'settings.plan.trafficNote' | transloco }}
            </p>
          }
        </div>
        <div class="mt-5 flex flex-col gap-3" data-testid="plan-billing">
          @if (p.subscription; as s) {
            <p
              [class.text-danger]="s.status === 'PAST_DUE'"
              [attr.role]="s.status === 'PAST_DUE' ? 'alert' : null"
              data-testid="plan-subscription"
            >
              {{ subscriptionText() }}
            </p>
            <div class="flex flex-wrap gap-2">
              @if (s.status === 'PAST_DUE') {
                <button
                  appButton
                  type="button"
                  [disabled]="portal.busy()"
                  (click)="portal.open('payment')"
                >
                  {{ 'billing.updatePayment' | transloco }}
                </button>
              }
              <button
                appButton
                variant="secondary"
                type="button"
                [disabled]="portal.busy()"
                (click)="portal.open()"
                data-testid="plan-manage"
              >
                {{ 'billing.manage' | transloco }}
              </button>
            </div>
          } @else if (p.tier === 'BASIC') {
            <p class="text-sm text-muted">{{ 'billing.upgradeHint' | transloco }}</p>
            <div>
              <a
                appButton
                [routerLink]="panelLink('pro')"
                [queryParamsHandling]="'merge'"
                data-testid="plan-upgrade"
                >{{ 'billing.upgrade' | transloco }}</a
              >
            </div>
          }
        </div>
      </app-settings-section>
    }
  `,
})
export class PlanSettingsPage {
  protected readonly panelLink = panelLink;
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly portal = inject(BillingPortal);

  protected readonly plan = computed(() => this.auth.user()?.plan ?? null);
  /** Date and time: the end is a moment (often midnight), a bare date would read a day late. */
  protected readonly untilText = computed(() => {
    const until = this.plan()?.until;
    return until
      ? new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          dateStyle: 'long',
          timeStyle: 'short',
          hourCycle: 'h23', // "00:00", not "12:00 AM": an end at midnight must not read as noon
        }).format(new Date(until))
      : null;
  });
  protected readonly subscriptionText = computed(() => {
    this.language.loaded();
    const s = this.plan()?.subscription;
    return s ? describeSubscription(s, (key, params) => this.t.translate(key, params)) : '';
  });
  /** Download speed in MB/s with at most one decimal; null = full speed. */
  protected readonly speedMb = computed(() => {
    const speed = this.plan()?.limits.downloadSpeedBytesPerSec ?? 0;
    return speed > 0 ? String(Math.round((speed / 1024 ** 2) * 10) / 10) : null;
  });
  protected readonly trafficPercent = computed(() => {
    const p = this.plan();
    return p && p.limits.trafficBytesPerMonth > 0
      ? Math.min(100, (p.usage.trafficBytesThisMonth / p.limits.trafficBytesPerMonth) * 100)
      : 0;
  });
  protected readonly shelfPercent = computed(() => {
    const p = this.plan();
    return p && p.limits.storageQuotaBytes > 0
      ? (p.usage.storageBytes / p.limits.storageQuotaBytes) * 100
      : 0;
  });

  constructor() {
    // Usage and the end date change outside this page (uploads, an admin): read them fresh. A
    // failure keeps what is shown (unlike AuthStore.load, which would sign the page out).
    this.api
      .invoke(authMe)
      .then((me) => this.auth.setUser(me))
      .catch(() => undefined);
  }
}

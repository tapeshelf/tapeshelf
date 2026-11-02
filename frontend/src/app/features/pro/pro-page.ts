import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  type CheckoutSettings,
  type Paddle,
  type PaddleEventData,
  initializePaddle,
} from '@paddle/paddle-js';

import {
  Api,
  type BillingConfigDto,
  type TierLimitsDto,
  authMe,
  billingCheckoutConfig,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { closingPanel } from '../../core/navigation/panels';
import { profileLink } from '../../core/navigation/user-links';
import { AuthStore } from '../../core/auth/auth.store';
import { BillingPortal } from '../../core/billing/billing-portal';
import { describeSubscription, formatMoment } from '../../core/billing/subscription-text';
import { SiteConfig } from '../../core/site/site-config';
import { ThemeService } from '../../core/theme/theme.service';
import { formatBytes } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { TAB_LIST, tabClass } from '../../shared/ui/tabs/tabs';
import { formatMoney, yearlyOffer } from './pro-pricing';

/** After payment the webhook makes the account Pro; the page asks this often, this many times. */
const POLL_MS = 2000;
const POLL_TRIES = 30;

type State = 'idle' | 'opening' | 'activating' | 'activated' | 'slow';

/**
 * The Pro page in the app: the yearly price first ("€5/month, billed
 * €59.99 a year, save 50 %"), monthly on a switch, Free and Pro side by side, and Paddle's overlay
 * checkout. The account turns Pro when Paddle's webhook arrives, which the page waits for. Cloud only.
 * It is also the account's default payment link in Paddle: a link Paddle sends with `?_ptxn=<id>`
 * lands here, and Paddle.js opens the checkout for that transaction as soon as it loads.
 */
@Component({
  selector: 'app-pro-page',
  imports: [TranslocoPipe, AlertComponent, ButtonDirective, PageHeadComponent, SpinnerComponent],
  template: `
    <app-page-head [title]="'pro.title' | transloco" />
    <div class="mx-auto flex max-w-3xl flex-col gap-8">
      <p class="text-lg text-muted">{{ 'pro.lead' | transloco }}</p>

      @switch (state()) {
        @case ('activating') {
          <app-alert data-testid="pro-activating">{{ 'pro.activating' | transloco }}</app-alert>
        }
        @case ('activated') {
          <app-alert kind="success" data-testid="pro-activated">{{
            'pro.activated' | transloco
          }}</app-alert>
        }
        @case ('slow') {
          <app-alert kind="warning">{{ 'pro.slow' | transloco }}</app-alert>
        }
      }
      @if (checkoutError(); as message) {
        <app-alert kind="error" data-testid="pro-checkout-error">{{ message }}</app-alert>
      }

      @if (plan(); as p) {
        @if (p.tier === 'PREMIUM') {
          <section class="rounded-xl border-2 border-line bg-surface p-6" data-testid="pro-yours">
            <h2 class="font-display text-2xl font-bold">{{ 'pro.yours' | transloco }}</h2>
            @if (p.subscription; as s) {
              <p class="mt-2" data-testid="pro-subscription">{{ subscriptionText() }}</p>
              <div class="mt-5 flex flex-wrap gap-2">
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
                  [variant]="s.status === 'PAST_DUE' ? 'secondary' : 'primary'"
                  type="button"
                  [disabled]="portal.busy()"
                  (click)="portal.open()"
                  data-testid="pro-manage"
                >
                  {{ 'billing.manage' | transloco }}
                </button>
              </div>
            } @else if (p.until) {
              <p class="mt-2">{{ 'pro.granted' | transloco: { date: until() } }}</p>
            } @else {
              <p class="mt-2">{{ 'pro.grantedForever' | transloco }}</p>
            }
          </section>
        } @else if (config(); as c) {
          <section class="rounded-xl border-2 border-line bg-surface p-6" data-testid="pro-offer">
            <div [class]="tabList" role="group" [attr.aria-label]="'pro.period' | transloco">
              @for (option of intervals; track option) {
                <button
                  type="button"
                  [class]="tab(interval() === option)"
                  [attr.aria-pressed]="interval() === option"
                  (click)="interval.set(option)"
                  [attr.data-testid]="'pro-' + option"
                >
                  {{ 'pro.' + option | transloco }}
                </button>
              }
            </div>
            <p class="font-display text-5xl leading-none font-bold" data-testid="pro-price">
              {{ 'pro.perMonth' | transloco: { price: perMonth() } }}
            </p>
            @if (interval() === 'year') {
              <p class="mt-3 text-lg" data-testid="pro-billed">
                {{ 'pro.billedYearly' | transloco: { price: money(c.year.amount) } }}
              </p>
              @if (offer(); as o) {
                @if (o.savings > 0) {
                  <p class="label-mono mt-1 text-accent-text" data-testid="pro-savings">
                    {{
                      'pro.savings' | transloco: { percent: o.percent, amount: money(o.savings) }
                    }}
                  </p>
                }
              }
            } @else {
              <p class="mt-3 text-lg" data-testid="pro-billed">
                {{ 'pro.billedMonthly' | transloco }}
              </p>
            }
            <button
              appButton
              type="button"
              class="mt-6"
              [disabled]="state() === 'opening' || state() === 'activating'"
              (click)="buy(c)"
              data-testid="pro-buy"
            >
              {{ (state() === 'opening' ? 'pro.opening' : 'pro.buy') | transloco }}
            </button>
            @if (checkoutFailed()) {
              <p class="mt-3 text-sm text-danger" role="alert" data-testid="pro-load-failed">
                {{ 'pro.loadFailed' | transloco }}
              </p>
            }
            <p class="mt-4 text-sm text-muted">{{ 'pro.finePrint' | transloco }}</p>
          </section>
        } @else if (error(); as message) {
          <app-alert kind="error">{{ message }}</app-alert>
        } @else {
          <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
        }
      }

      <section>
        <h2 class="label-mono mb-3 text-muted">{{ 'pro.compare' | transloco }}</h2>
        <div class="overflow-x-auto rounded-xl border-2 border-line bg-surface">
          <table class="w-full border-collapse text-left text-sm" data-testid="pro-compare">
            <thead>
              <tr>
                <th class="label-mono border-b-2 border-line px-4 py-2 font-normal">
                  <span class="sr-only">{{ 'pro.feature' | transloco }}</span>
                </th>
                <th class="label-mono border-b-2 border-line px-4 py-2 font-normal">
                  {{ 'common.tier.BASIC' | transloco }}
                </th>
                <th class="label-mono border-b-2 border-line px-4 py-2 font-normal">
                  {{ 'common.tier.PREMIUM' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.label) {
                <tr>
                  <td class="border-b border-line/10 px-4 py-2.5 text-muted">
                    {{ row.label | transloco }}
                  </td>
                  <td class="border-b border-line/10 px-4 py-2.5">{{ row.free }}</td>
                  <td class="border-b border-line/10 px-4 py-2.5 font-semibold">{{ row.pro }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class ProPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly theme = inject(ThemeService);
  private readonly site = inject(SiteConfig);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private paddle: Paddle | null = null;
  protected readonly portal = inject(BillingPortal);
  private destroyed = false;

  protected readonly intervals = ['year', 'month'] as const;
  protected readonly tabList = TAB_LIST.replace('mb-7', 'mb-6');
  protected readonly tab = tabClass;
  protected readonly config = signal<BillingConfigDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly interval = signal<'year' | 'month'>('year');
  protected readonly state = signal<State>('idle');
  protected readonly checkoutFailed = signal(false);
  /** Why the checkout did not open, with Paddle's own reason: its overlay only says "try later". */
  protected readonly checkoutError = signal<string | null>(null);
  protected readonly plan = computed(() => this.auth.user()?.plan ?? null);
  protected readonly offer = computed(() => {
    const c = this.config();
    return c ? yearlyOffer(c.month, c.year) : null;
  });
  protected readonly perMonth = computed(() => {
    const c = this.config();
    if (!c) return '';
    return this.money(this.interval() === 'year' ? this.offer()!.perMonth : c.month.amount);
  });
  protected readonly until = computed(() => formatMoment(this.plan()?.until ?? null));
  protected readonly subscriptionText = computed(() => {
    this.language.loaded();
    const s = this.plan()?.subscription;
    return s ? describeSubscription(s, (key, params) => this.t.translate(key, params)) : '';
  });
  /** Free and Pro side by side, from the limits this instance publishes. */
  protected readonly rows = computed(() => {
    this.language.loaded();
    const { BASIC: free, PREMIUM: pro } = this.site.plans();
    const t = (key: string, params?: Record<string, unknown>) => this.t.translate(key, params);
    const size = (bytes: number) =>
      bytes > 0 ? t('pro.upTo', { size: formatBytes(bytes) }) : t('pro.unlimited');
    const downloads = (l: TierLimitsDto) =>
      l.downloadsPerMonth > 0
        ? t('pro.downloadsLimited', {
            count: l.downloadsPerMonth,
            mb: Math.round((l.downloadSpeedBytesPerSec / 1024 ** 2) * 10) / 10,
          })
        : t('pro.unlimited');
    return [
      { label: 'pro.rows.file', free: size(free.maxFileBytes), pro: size(pro.maxFileBytes) },
      {
        label: 'pro.rows.shelf',
        free: size(free.storageQuotaBytes),
        pro: size(pro.storageQuotaBytes),
      },
      { label: 'pro.rows.downloads', free: downloads(free), pro: downloads(pro) },
      {
        label: 'pro.rows.trash',
        free: t('pro.days', { count: free.trashRetentionDays }),
        pro: t('pro.days', { count: pro.trashRetentionDays }),
      },
      // Pro features rather than limits.
      { label: 'pro.rows.editor', free: t('pro.notIncluded'), pro: t('pro.included') },
      { label: 'pro.rows.hiddenPage', free: t('pro.notIncluded'), pro: t('pro.included') },
      { label: 'pro.rows.links', free: t('pro.notIncluded'), pro: t('pro.included') },
      { label: 'pro.rows.anonymousLinks', free: t('pro.notIncluded'), pro: t('pro.included') },
    ];
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    const transaction = this.route.snapshot.queryParamMap.get('_ptxn');
    this.api
      .invoke(billingCheckoutConfig)
      .then((c) => {
        this.config.set(c);
        // A payment link from Paddle: loading Paddle.js is enough, it opens that checkout itself.
        if (transaction) {
          this.loadPaddle(c).catch(() =>
            this.checkoutError.set(this.t.translate('pro.loadFailed')),
          );
        }
      })
      .catch((e: unknown) =>
        this.error.set(toApiError(e).message || this.t.translate('errors.unknown')),
      );
    // The plan may have changed elsewhere (the portal, an admin): read it fresh.
    this.api
      .invoke(authMe)
      .then((me) => this.auth.setUser(me))
      .catch(() => undefined);
  }

  protected money(cents: number): string {
    return formatMoney(
      cents,
      this.config()?.month.currency ?? 'EUR',
      document.documentElement.lang || undefined,
    );
  }

  /** Paddle's overlay checkout for the chosen price; the account id rides along to the webhook. */
  protected async buy(c: BillingConfigDto): Promise<void> {
    const user = this.auth.user();
    if (!user || this.state() === 'opening') return;
    this.state.set('opening');
    this.checkoutFailed.set(false);
    this.checkoutError.set(null);
    try {
      const paddle = await this.loadPaddle(c);
      paddle.Checkout.open({
        items: [{ priceId: c[this.interval()].id, quantity: 1 }],
        ...(user.email ? { customer: { email: user.email } } : {}),
        customData: { userId: user.id },
        settings: this.checkoutSettings(),
      });
      this.state.set('idle');
    } catch {
      // Blocked by an extension or the network: say so, keep the offer.
      this.state.set('idle');
      this.checkoutFailed.set(true);
    }
  }

  /**
   * Paddle.js with this page's checkout look; loading it again only updates the options. The
   * settings also apply to a checkout Paddle.js opens by itself for `?_ptxn=`.
   */
  private async loadPaddle(c: BillingConfigDto): Promise<Paddle> {
    // Paddle Retain knows the customer by Paddle's own id; someone who never bought has none yet.
    const customerId = this.plan()?.subscription?.customerId;
    const paddle = await initializePaddle({
      environment: c.environment,
      token: c.clientToken,
      pwCustomer: customerId ? { id: customerId } : {},
      checkout: { settings: this.checkoutSettings() },
      eventCallback: (event: PaddleEventData) => this.onPaddleEvent(event),
    });
    if (!paddle) throw new Error('Paddle.js did not load');
    this.paddle = paddle;
    return paddle;
  }

  private checkoutSettings(): CheckoutSettings {
    return {
      displayMode: 'overlay',
      variant: 'one-page',
      theme: this.theme.resolved(),
      locale: paddleLocale(document.documentElement.lang),
      allowLogout: false,
    };
  }

  private onPaddleEvent(event: PaddleEventData): void {
    if (event.name === 'checkout.completed') void this.waitForPro();
    if (event.name === 'checkout.error') {
      // E.g. "transaction_default_checkout_url_not_set": shown on the page and kept in the console.
      console.error('Paddle checkout error', event);
      const reason = event.detail || event.code || this.t.translate('errors.unknown');
      this.checkoutError.set(this.t.translate('pro.checkoutError', { reason }));
    }
  }

  /**
   * Pro is on: Paddle's window closes by itself and the own shelf opens with what the plan
   * brings — whether the payer still looked at Paddle's "thank you" or had closed it already.
   */
  private welcome(username: string): void {
    try {
      this.paddle?.Checkout.close();
    } catch {
      // already closed
    }
    if (this.destroyed) return;
    void this.router.navigate(closingPanel(profileLink(username)), {
      queryParams: { welcome: 'pro' },
    });
  }

  /** Paid: the account turns Pro once Paddle's webhook is in, usually within seconds. */
  private async waitForPro(): Promise<void> {
    if (this.state() === 'activating') return;
    this.state.set('activating');
    for (let i = 0; i < POLL_TRIES && !this.destroyed; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const me = await this.api.invoke(authMe).catch(() => null);
      if (!me) continue;
      this.auth.setUser(me);
      if (me.plan.tier === 'PREMIUM') {
        this.state.set('activated');
        this.welcome(me.username);
        return;
      }
    }
    if (!this.destroyed) this.state.set('slow');
  }
}

/** The checkout's language: the page's where Paddle speaks it, English otherwise. */
function paddleLocale(lang: string): string {
  const own: Record<string, string> = { zh: 'zh-Hans' };
  const paddle = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'zh'];
  return paddle.includes(lang) ? (own[lang] ?? lang) : 'en';
}

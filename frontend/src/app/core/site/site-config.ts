import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, CanMatchFn } from '@angular/router';

import { Api } from '../../api/api';
import { siteInfo } from '../../api/fn/site/site-info';
import type { SiteInfoDto } from '../../api/models/site-info-dto';

const GiB = 1024 ** 3;

/**
 * What the app assumes until /api/site answers (or when it cannot): the software's own name and the
 * server's default limits, so texts never show an empty number.
 */
export const SITE_FALLBACK: SiteInfoDto = {
  name: 'tapeshelf',
  contactEmail: null,
  siteUrl: null,
  legal: { terms: false, privacy: false, imprint: false },
  edition: 'community',
  captchaSiteKey: null,
  demo: null,
  emailEnabled: true,
  registrationOpen: true,
  mediaOrigin: null,
  plans: {
    BASIC: {
      maxFileBytes: 2 * GiB,
      storageQuotaBytes: 30 * GiB,
      requestsPerDay: 30,
      downloadsPerMonth: 10,
      downloadSpeedBytesPerSec: 1024 ** 2,
      downloadConcurrency: 1,
      trashRetentionDays: 30,
      apiRateMultiplier: 1,
      extensionPerDay: 3,
    },
    PREMIUM: {
      maxFileBytes: 5 * GiB,
      storageQuotaBytes: 200 * GiB,
      requestsPerDay: 30,
      downloadsPerMonth: 0,
      downloadSpeedBytesPerSec: 0,
      downloadConcurrency: 0,
      trashRetentionDays: 90,
      apiRateMultiplier: 3,
      extensionPerDay: 0,
    },
  },
};

/**
 * This instance as its operator configured it (SITE_NAME, CONTACT_EMAIL, LEGAL_DIR): loaded once
 * before the first render, so every text and route already sees the right values.
 */
@Injectable({ providedIn: 'root' })
export class SiteConfig {
  // Resolved on load only, so texts (SiteTranspiler) can use the config without an HTTP stack.
  private readonly injector = inject(Injector);
  readonly info = signal<SiteInfoDto>(SITE_FALLBACK);

  readonly name = computed(() => this.info().name);
  readonly contactEmail = computed(() => this.info().contactEmail);
  /** The operator's website in front of the app (SITE_URL, tapeshelf.com); null = none. */
  readonly siteUrl = computed(() => this.info().siteUrl);
  readonly legal = computed(() => this.info().legal);
  /** community = self-hosted; cloud = tapeshelf.com (subscriptions, links to its site). */
  readonly edition = computed(() => this.info().edition);
  /** Cloudflare Turnstile key for a repeated sign-up from one IP; null = no captcha. */
  readonly captchaSiteKey = computed(() => this.info().captchaSiteKey);
  /** The public demo's shared account; null = not the demo. */
  readonly demo = computed(() => this.info().demo);
  /** Without email there is no way to reset a forgotten password from the sign-in page. */
  readonly emailEnabled = computed(() => this.info().emailEnabled);
  /** Whether new accounts can be made: its links are hidden, the sign-up page says why. */
  readonly registrationOpen = computed(() => this.info().registrationOpen);
  /** Only the cloud has tiers: Free/Pro, the plan tab, offers of Pro. */
  readonly hasTiers = computed(() => this.edition() === 'cloud');
  /** Tier limits: the only source of numbers in texts. */
  readonly plans = computed(() => this.info().plans);

  async load(): Promise<void> {
    try {
      const info = await this.injector.get(Api).invoke(siteInfo);
      this.info.set(info);
      if (info.mediaOrigin) preconnect(info.mediaOrigin);
    } catch {
      // offline or an old API: keep the fallback rather than block the app
    }
  }
}

/**
 * The first tile's picture comes from the storage's own address: its DNS, TCP and TLS are done while
 * the profile and the shelf are still being fetched. Both kinds of request go there:
 * plain images and CORS fetches (the HLS playlists and keys of public videos).
 */
function preconnect(origin: string): void {
  if (typeof document === 'undefined' || origin === location.origin) return;
  for (const cors of [false, true]) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    if (cors) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

/**
 * Route guard of the rules (/terms, /privacy): an operator with a website (SITE_URL) keeps them
 * there, so the app leaves for that page with a full load; otherwise the app shows LEGAL_DIR's texts.
 */
export const toOperatorSite: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const site = inject(SiteConfig).siteUrl();
  if (!site) return true;
  location.assign(`${site}/${route.routeConfig?.path ?? ''}`);
  return false;
};
/** Route guard: pages about tiers, which a self-hosted instance does not have. */
export const tiersOnly: CanMatchFn = () => inject(SiteConfig).hasTiers();
/** Route guard: support, which the public demo does not have. */
export const supportOpen: CanActivateFn = () => inject(SiteConfig).demo() === null;

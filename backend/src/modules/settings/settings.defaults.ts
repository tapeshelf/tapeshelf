import type { Tier } from '../../generated/prisma/enums.js';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

export interface TierLimits {
  maxFileBytes: number;
  storageQuotaBytes: number;
  /** Outgoing exchange requests per day (incoming ones do not count). */
  requestsPerDay: number;
  /** Downloads per calendar month (UTC); 0 = no limit. */
  downloadsPerMonth: number;
  /** Speed of a download streamed through the API; 0 = straight from storage, full speed. */
  downloadSpeedBytesPerSec: number;
  /** Downloads running at once; 0 = no limit. */
  downloadConcurrency: number;
  /** Days a video the author deleted stays restorable before its files are erased. */
  trashRetentionDays: number;
  /** Signed-in rate limits are multiplied by this; guests always get ×1. */
  apiRateMultiplier: number;
  /** Videos a day (UTC) saved through the browser extension; 0 = no limit. */
  extensionPerDay: number;
}

/**
 * Limits of a self-hosted instance: it has no tiers, one set applies to every account and 0
 * means no limit. Downloads are never limited there and rate limits are not multiplied.
 */
export interface InstanceLimits {
  maxFileBytes: number;
  storageQuotaBytes: number;
  requestsPerDay: number;
  trashRetentionDays: number;
  /** Videos a day saved through the browser extension; 0 = no limit, the default. */
  extensionPerDay: number;
}

/**
 * Site settings with their defaults. Admin
 * overrides live in SiteSetting; a stored object that lacks a newer key gets the default for it.
 */
export const SETTING_DEFAULTS = {
  /** Days between username changes. */
  usernameChangeDays: 30,
  /** Days before the same video can be requested again after a decline. */
  requestCooldownDays: 7,
  /** How many times the request hint must be shown before "don't show again" is allowed. */
  requestHintMinShows: 3,
  /** Limits per account tier: Free and Pro. */
  tiers: {
    BASIC: {
      maxFileBytes: 1 * GiB,
      storageQuotaBytes: 20 * GiB,
      requestsPerDay: 30,
      downloadsPerMonth: 10,
      downloadSpeedBytesPerSec: 1 * MiB,
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
  } as Record<Tier, TierLimits>,
  /** Whether new accounts can be made; only existing ones sign in when it's off. */
  registrationOpen: true as boolean,
  /** Days Pro is kept after the first failed renewal of a subscription. */
  paymentGraceDays: 7,
  /** The one set of limits of a self-hosted instance; the cloud uses `tiers`. */
  limits: {
    maxFileBytes: 0,
    storageQuotaBytes: 0,
    requestsPerDay: 30,
    trashRetentionDays: 90,
    extensionPerDay: 0,
  } as InstanceLimits,
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

/** The default's keys with the stored values where present; keys the default lacks are dropped. */
function mergeKeys<T extends object>(fallback: T, stored: unknown): T {
  const own = (stored ?? {}) as Partial<T>;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [
      key,
      own[key as keyof T] ?? value,
    ]),
  ) as T;
}

/**
 * A stored value over the default: limit objects (per tier, and the instance's) are merged key by
 * key (keys that no longer exist, such as publicDownloadAllowed, are dropped), plain values replace.
 */
export function withDefaults<K extends SettingKey>(
  key: K,
  stored: unknown,
): Settings[K] {
  const fallback = SETTING_DEFAULTS[key];
  if (key === 'limits')
    return mergeKeys(fallback as object, stored) as Settings[K];
  if (key !== 'tiers') return (stored ?? fallback) as Settings[K];
  const tiers = (stored ?? {}) as Partial<Record<Tier, unknown>>;
  const merged = {} as Record<Tier, TierLimits>;
  for (const [tier, limits] of Object.entries(SETTING_DEFAULTS.tiers))
    merged[tier as Tier] = mergeKeys(limits, tiers[tier as Tier]);
  return merged as Settings[K];
}

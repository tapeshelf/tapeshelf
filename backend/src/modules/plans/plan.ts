import type { Tier, TierSource } from '../../generated/prisma/enums.js';
import type {
  InstanceLimits,
  TierLimits,
} from '../settings/settings.defaults.js';

const DAY_MS = 24 * 3600 * 1000;

export interface TierState {
  tier: Tier;
  tierUntil: Date | null;
}

/**
 * The tier an account has right now: PREMIUM past its end date counts as BASIC at once,
 * the hourly tier.expire job only writes it down and tells the user.
 */
export function effectiveTier(u: TierState, now = new Date()): Tier {
  return u.tier === 'PREMIUM' && u.tierUntil !== null && u.tierUntil <= now
    ? 'BASIC'
    : u.tier;
}

/** Whether `value` is over `limit`, where a limit of 0 means none. */
export function overLimit(value: number, limit: number): boolean {
  return limit > 0 && value > limit;
}

/** Reminders about the end of PREMIUM: a week before (7) and on the last day (1). */
export type TierReminder = 7 | 1;

/**
 * Which reminder is due for a PREMIUM with an end date, given the one already sent; null = none.
 * A short grant (less than a day left) gets only the last-day reminder.
 */
export function dueReminder(
  u: TierState & { tierReminder: number | null },
  now = new Date(),
): TierReminder | null {
  if (u.tier !== 'PREMIUM' || u.tierUntil === null) return null;
  const left = u.tierUntil.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= DAY_MS) return u.tierReminder === 1 ? null : 1;
  if (left <= 7 * DAY_MS) return u.tierReminder === null ? 7 : null;
  return null;
}

export interface Plan {
  tier: Tier;
  /** End of PREMIUM; null = no end (and always null for BASIC). */
  until: Date | null;
  source: TierSource | null;
  limits: TierLimits;
}

/** What an account may do: its effective tier and that tier's limits. */
export function planOf(
  u: TierState & { tierSource: TierSource | null },
  tiers: Record<Tier, TierLimits>,
  now = new Date(),
): Plan {
  const tier = effectiveTier(u, now);
  return {
    tier,
    until: tier === 'PREMIUM' ? u.tierUntil : null,
    source: tier === 'PREMIUM' ? u.tierSource : null,
    limits: tiers[tier],
  };
}

/**
 * A self-hosted instance's limits in the shape of a tier's: downloads and traffic are never
 * limited (straight from storage) and rate limits are not multiplied.
 */
export function instanceTierLimits(l: InstanceLimits): TierLimits {
  return {
    ...l,
    downloadsPerMonth: 0,
    downloadSpeedBytesPerSec: 0,
    downloadConcurrency: 0,
    trafficBytesPerMonth: 0,
    apiRateMultiplier: 1,
  };
}

/** The plan of every account on a self-hosted instance: no tier to speak of, no end. */
export function instancePlan(limits: TierLimits): Plan {
  return { tier: 'BASIC', until: null, source: null, limits };
}

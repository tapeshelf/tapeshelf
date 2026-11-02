import type { SubscriptionStatus } from '../../generated/prisma/enums.js';
import type { PaddleSubscription } from './paddle.types.js';

const DAY_MS = 24 * 3600 * 1000;
/**
 * A renewing subscription keeps Pro this long past its period: the renewal's webhook arrives
 * minutes after the charge, and nobody should drop to Free in between.
 */
export const RENEWAL_SLACK_MS = DAY_MS;

/** A subscription as mirrored in the database. */
export interface SubscriptionState {
  status: SubscriptionStatus;
  periodEndsAt: Date | null;
  /** A scheduled cancel or pause takes effect then; null = renews. */
  endsAt: Date | null;
  /** First failed renewal of the current period. */
  pastDueSince: Date | null;
}

const STATUS: Record<PaddleSubscription['status'], SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  paused: 'PAUSED',
  canceled: 'CANCELED',
};

/**
 * Paddle's subscription as our mirror row. The grace period counts from the first failed renewal of
 * the period and is not restarted by Paddle's further attempts; paying clears it.
 */
export function mirrorOf(
  sub: PaddleSubscription,
  previous: Pick<SubscriptionState, 'pastDueSince'> | null,
  occurredAt: Date,
): SubscriptionState & { priceId: string; interval: string } {
  const status = STATUS[sub.status] ?? 'CANCELED';
  const change = sub.scheduled_change;
  return {
    status,
    periodEndsAt: sub.current_billing_period
      ? new Date(sub.current_billing_period.ends_at)
      : null,
    endsAt:
      change && change.action !== 'resume'
        ? new Date(change.effective_at)
        : null,
    pastDueSince:
      status === 'PAST_DUE' ? (previous?.pastDueSince ?? occurredAt) : null,
    priceId: sub.items[0]?.price.id ?? '',
    interval: sub.billing_cycle.interval,
  };
}

/**
 * Until when a subscription gives Pro; null = it gives nothing now: a renewing one to the end
 * of its period plus a day of slack, a cancelled one to the end it was cancelled for, one whose
 * renewal failed for `graceDays` from the first failure (never past a scheduled end), a paused or
 * ended one not at all.
 */
export function proUntil(
  s: SubscriptionState,
  graceDays: number,
  now = new Date(),
): Date | null {
  switch (s.status) {
    case 'ACTIVE':
    case 'TRIALING': {
      if (s.endsAt) return s.endsAt;
      const end = s.periodEndsAt ?? now;
      return new Date(end.getTime() + RENEWAL_SLACK_MS);
    }
    case 'PAST_DUE': {
      const grace = new Date(
        (s.pastDueSince ?? now).getTime() + graceDays * DAY_MS,
      );
      return s.endsAt && s.endsAt < grace ? s.endsAt : grace;
    }
    default:
      return null;
  }
}

/** Renews by itself: no reminders about its end are sent. */
export function renews(s: SubscriptionState): boolean {
  return (s.status === 'ACTIVE' || s.status === 'TRIALING') && !s.endsAt;
}

/** The latest of several ends, null when none gives anything. */
export function latest(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (best, d) => (d && (!best || d > best) ? d : best),
    null,
  );
}

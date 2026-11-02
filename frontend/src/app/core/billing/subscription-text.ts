import type { PlanSubscriptionDto } from '../../api';

/** A date and time in the page's language: subscription ends are moments, often at midnight. */
export function formatMoment(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** The line about a subscription: when it renews, when it ends, or by when to pay. */
export function describeSubscription(
  s: PlanSubscriptionDto,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (s.status === 'PAST_DUE') return t('billing.pastDue', { date: formatMoment(s.graceUntil) });
  if (s.status === 'PAUSED') return t('billing.paused');
  if (!s.renews) return t('billing.ends', { date: formatMoment(s.endsAt) });
  return t('billing.renews', {
    interval: t(`billing.interval.${s.interval}`),
    date: formatMoment(s.periodEndsAt),
  });
}

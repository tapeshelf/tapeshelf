import type { PaddleSubscription } from './paddle.types.js';
import {
  RENEWAL_SLACK_MS,
  type SubscriptionState,
  latest,
  mirrorOf,
  proUntil,
  renews,
} from './subscription-access.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const paddle = (
  over: Partial<PaddleSubscription> = {},
): PaddleSubscription => ({
  id: 'sub_1',
  status: 'active',
  customer_id: 'ctm_1',
  current_billing_period: {
    starts_at: at(-10).toISOString(),
    ends_at: at(20).toISOString(),
  },
  billing_cycle: { interval: 'month', frequency: 1 },
  scheduled_change: null,
  items: [{ price: { id: 'pri_month' } }],
  custom_data: { userId: 'u' },
  ...over,
});

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  status: 'ACTIVE',
  periodEndsAt: at(20),
  endsAt: null,
  pastDueSince: null,
  ...over,
});

describe('subscription access', () => {
  describe('mirrorOf', () => {
    it('reads status, period, price and interval', () => {
      expect(mirrorOf(paddle(), null, NOW)).toEqual({
        status: 'ACTIVE',
        periodEndsAt: at(20),
        endsAt: null,
        pastDueSince: null,
        priceId: 'pri_month',
        interval: 'month',
      });
    });

    it('a scheduled cancel or pause is an end; a scheduled resume is not', () => {
      const change = (action: 'cancel' | 'pause' | 'resume') =>
        mirrorOf(
          paddle({
            scheduled_change: { action, effective_at: at(20).toISOString() },
          }),
          null,
          NOW,
        ).endsAt;
      expect(change('cancel')).toEqual(at(20));
      expect(change('pause')).toEqual(at(20));
      expect(change('resume')).toBeNull();
    });

    it('the grace counts from the first failure and is not restarted by later attempts', () => {
      const first = mirrorOf(paddle({ status: 'past_due' }), null, NOW);
      expect(first.pastDueSince).toEqual(NOW);
      const retry = mirrorOf(paddle({ status: 'past_due' }), first, at(3));
      expect(retry.pastDueSince).toEqual(NOW);
      expect(mirrorOf(paddle(), retry, at(4)).pastDueSince).toBeNull();
    });
  });

  describe('proUntil', () => {
    it.each<[string, Partial<SubscriptionState>, Date | null]>([
      [
        'renewing: the period end plus a day of slack',
        {},
        new Date(at(20).getTime() + RENEWAL_SLACK_MS),
      ],
      [
        'cancelled: exactly to the end it was cancelled for',
        { endsAt: at(20) },
        at(20),
      ],
      [
        'trialing like active',
        { status: 'TRIALING' },
        new Date(at(20).getTime() + RENEWAL_SLACK_MS),
      ],
      [
        'failed renewal: grace from the first failure',
        { status: 'PAST_DUE', pastDueSince: at(-2) },
        at(5),
      ],
      [
        'failed and cancelled sooner: the earlier end',
        { status: 'PAST_DUE', pastDueSince: at(-2), endsAt: at(1) },
        at(1),
      ],
      ['paused: nothing', { status: 'PAUSED' }, null],
      ['ended: nothing', { status: 'CANCELED' }, null],
    ])('%s', (_case, over, expected) => {
      expect(proUntil(state(over), 7, NOW)).toEqual(expected);
    });

    it('the grace follows the setting; 0 days ends Pro at the failure', () => {
      const failed = state({ status: 'PAST_DUE', pastDueSince: NOW });
      expect(proUntil(failed, 3, NOW)).toEqual(at(3));
      expect(proUntil(failed, 0, NOW)).toEqual(NOW);
    });
  });

  it('only an active subscription without a scheduled end renews', () => {
    expect(renews(state())).toBe(true);
    expect(renews(state({ endsAt: at(20) }))).toBe(false);
    expect(renews(state({ status: 'PAST_DUE' }))).toBe(false);
  });

  it('latest picks the furthest end and ignores none', () => {
    expect(latest([null, at(1), at(3), null])).toEqual(at(3));
    expect(latest([null])).toBeNull();
  });
});

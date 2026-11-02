/** The parts of Paddle's webhook payloads that billing reads (Paddle API v1, snake_case). */

export interface PaddleEvent<T = unknown> {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: T;
}

export type PaddleSubscriptionStatus =
  'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';

export interface PaddleSubscription {
  id: string;
  status: PaddleSubscriptionStatus;
  customer_id: string;
  current_billing_period: { starts_at: string; ends_at: string } | null;
  billing_cycle: { interval: string; frequency: number };
  scheduled_change: {
    action: 'cancel' | 'pause' | 'resume';
    effective_at: string;
  } | null;
  items: { price: { id: string } }[];
  /** Set at checkout: `{ userId }` of the account that bought it. */
  custom_data: Record<string, unknown> | null;
}

export interface PaddlePrice {
  id: string;
  unit_price: { amount: string; currency_code: string };
  billing_cycle: { interval: string; frequency: number } | null;
}

export interface PaddlePortalSession {
  urls: {
    general: { overview: string };
    subscriptions: {
      id: string;
      cancel_subscription: string;
      update_subscription_payment_method: string;
    }[];
  };
}

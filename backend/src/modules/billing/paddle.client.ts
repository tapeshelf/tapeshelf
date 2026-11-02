import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import type {
  PaddleSubscription,
  PaddlePortalSession,
  PaddlePrice,
} from './paddle.types.js';

const TIMEOUT_MS = 10_000;

/** A failed Paddle API call: the HTTP status and Paddle's error code, if any. */
export class PaddleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The few Paddle API calls billing makes (writes and prices; state comes from webhooks). Plain
 * fetch instead of the SDK: three endpoints, no extra dependency.
 */
@Injectable()
export class PaddleClient {
  private readonly base: string;
  private readonly key: string;

  constructor(config: ConfigService<Env, true>) {
    const env = config.get('PADDLE_ENV', { infer: true });
    this.base =
      config.get('PADDLE_API_URL', { infer: true }) ??
      (env === 'production'
        ? 'https://api.paddle.com'
        : 'https://sandbox-api.paddle.com');
    this.key = config.get('PADDLE_API_KEY', { infer: true }) ?? '';
  }

  /** Paddle's own addresses, the ones its notifications come from (public, needs no key). */
  async getIps(): Promise<string[]> {
    const res = await fetch(`${this.base}/ips`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { ipv4_cidrs?: string[]; ipv6_cidrs?: string[] };
    } | null;
    const cidrs = [
      ...(json?.data?.ipv4_cidrs ?? []),
      ...(json?.data?.ipv6_cidrs ?? []),
    ];
    if (!res.ok || !cidrs.length)
      throw new PaddleApiError(
        res.status,
        null,
        `Paddle GET /ips: ${res.status}`,
      );
    return cidrs;
  }

  getPrice(id: string): Promise<PaddlePrice> {
    return this.call('GET', `/prices/${encodeURIComponent(id)}`);
  }

  getSubscription(id: string): Promise<PaddleSubscription> {
    return this.call('GET', `/subscriptions/${encodeURIComponent(id)}`);
  }

  /** Signed-in links to the customer portal, with deep links for these subscriptions. */
  createPortalSession(
    customerId: string,
    subscriptionIds: string[],
  ): Promise<PaddlePortalSession> {
    return this.call(
      'POST',
      `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
      { subscription_ids: subscriptionIds },
    );
  }

  /** At once, or at the end of the billing period (a scheduled change). */
  cancelSubscription(
    id: string,
    when: 'immediately' | 'next_billing_period',
  ): Promise<PaddleSubscription> {
    return this.call(
      'POST',
      `/subscriptions/${encodeURIComponent(id)}/cancel`,
      { effective_from: when },
    );
  }

  /** Drops a scheduled cancel or pause: the subscription renews again. */
  removeScheduledChange(id: string): Promise<PaddleSubscription> {
    return this.call('PATCH', `/subscriptions/${encodeURIComponent(id)}`, {
      scheduled_change: null,
    });
  }

  private async call<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Paddle-Version': '1',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: T;
      error?: { code?: string; detail?: string };
    } | null;
    if (!res.ok || !json?.data)
      throw new PaddleApiError(
        res.status,
        json?.error?.code ?? null,
        `Paddle ${method} ${path}: ${res.status} ${json?.error?.code ?? ''} ${json?.error?.detail ?? ''}`.trim(),
      );
    return json.data;
  }
}

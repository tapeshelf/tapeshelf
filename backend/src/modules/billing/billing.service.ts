import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type OutboxWriter,
  OutboxService,
} from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { effectiveTier } from '../plans/plan.js';
import type { PlanSubscriptionDto } from '../plans/plans.dto.js';
import { PlansService } from '../plans/plans.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  BillingConfigDto,
  BillingPortalDto,
  BillingPriceDto,
} from './billing.dto.js';
import { PaddleClient } from './paddle.client.js';
import { PaddleIps } from './paddle-ips.js';
import { verifyPaddleSignature } from './paddle-signature.js';
import type {
  PaddleEvent,
  PaddlePrice,
  PaddleSubscription,
} from './paddle.types.js';
import { latest, mirrorOf, proUntil, renews } from './subscription-access.js';

type Tx = Prisma.TransactionClient;

const PRICES_CACHE = 'billing:prices';
const PRICES_TTL_SEC = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const disabled = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'billingDisabled',
    'errors.billing.disabled',
  );
const unavailable = () =>
  new AppException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'billingUnavailable',
    'errors.billing.unavailable',
  );

/**
 * Pro subscriptions through Paddle, the merchant of record. Webhooks
 * are the source of truth: each is applied once, by its own time, to a mirror of the subscription,
 * and the account's tier follows from all of its subscriptions. The API is used for prices, the
 * customer portal and stopping the subscription of a deleted account. Cloud only.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly paddleIps: PaddleIps,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly outbox: OutboxService,
    private readonly paddle: PaddleClient,
  ) {}

  /** `GET /billing`: prices and what Paddle.js needs. */
  async checkoutConfig(): Promise<BillingConfigDto> {
    if (!this.plans.hasTiers) throw disabled();
    const [month, year] = await this.prices();
    return {
      environment: this.config.get('PADDLE_ENV', { infer: true }),
      clientToken: this.config.get('PADDLE_CLIENT_TOKEN', { infer: true })!,
      month,
      year,
    };
  }

  /** `POST /billing/portal`: a signed-in session of Paddle's customer portal. */
  async portal(user: RequestUser): Promise<BillingPortalDto> {
    if (!this.plans.hasTiers) throw disabled();
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (!sub)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'noSubscription',
        'errors.billing.noSubscription',
      );
    const live = sub.status !== 'CANCELED';
    try {
      const session = await this.paddle.createPortalSession(
        sub.customerId,
        live ? [sub.id] : [],
      );
      const deep = session.urls.subscriptions.find((s) => s.id === sub.id);
      return {
        url: session.urls.general.overview,
        cancelUrl: deep?.cancel_subscription ?? null,
        updatePaymentUrl: deep?.update_subscription_payment_method ?? null,
      };
    } catch (err) {
      this.logger.error(`Portal session failed: ${(err as Error).message}`);
      throw unavailable();
    }
  }

  /** Notifications come only from Paddle's addresses; while they can't be read, Paddle retries. */
  private async checkSource(ip: string | undefined): Promise<void> {
    let allowed: boolean;
    try {
      allowed = await this.paddleIps.allows(ip);
    } catch (err) {
      this.logger.error(`Paddle addresses: ${(err as Error).message}`);
      throw unavailable();
    }
    if (!allowed)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'billingSource',
        'errors.billing.signature',
      );
  }

  /** The user's current subscription for their plan tab; null without one (or self-hosted). */
  async subscriptionOf(userId: string): Promise<PlanSubscriptionDto | null> {
    if (!this.plans.hasTiers) return null;
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: { not: 'CANCELED' } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!sub) return null;
    const graceDays = await this.settings.get('paymentGraceDays');
    return {
      status: sub.status,
      interval: sub.interval,
      customerId: sub.customerId,
      renews: renews(sub),
      periodEndsAt: sub.periodEndsAt?.toISOString() ?? null,
      endsAt: sub.endsAt?.toISOString() ?? null,
      graceUntil:
        sub.status === 'PAST_DUE'
          ? (proUntil(sub, graceDays)?.toISOString() ?? null)
          : null,
    };
  }

  /**
   * `POST /billing/webhook`: verifies Paddle's signature over the raw body, then applies the event
   * once. Anything else than 2xx makes Paddle retry, so a failure throws and a duplicate returns.
   */
  async webhook(
    raw: Buffer | undefined,
    signature: string | undefined,
    ip: string | undefined,
  ): Promise<void> {
    if (!this.plans.hasTiers) throw disabled();
    await this.checkSource(ip);
    const secret = this.config.get('PADDLE_WEBHOOK_SECRET', { infer: true })!;
    if (!raw || !verifyPaddleSignature(raw, signature, secret))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'billingSignature',
        'errors.billing.signature',
      );
    let event: PaddleEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as PaddleEvent;
    } catch {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'badRequest',
        'errors.badRequest',
      );
    }
    const occurredAt = new Date(event.occurred_at);
    if (!event.event_id || !event.event_type || isNaN(occurredAt.getTime()))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'badRequest',
        'errors.badRequest',
      );
    const applied = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.billingEvent.createMany({
        data: [{ id: event.event_id, type: event.event_type, occurredAt }],
        skipDuplicates: true,
      });
      if (!fresh.count) return false;
      if (event.event_type.startsWith('subscription.'))
        await this.applySubscription(
          tx,
          event.data as PaddleSubscription,
          occurredAt,
        );
      return true;
    });
    if (applied) await this.outbox.nudge();
  }

  /** Account deletion: its live subscriptions are stopped at Paddle by the worker (with retries). */
  async onAccountDeleted(tx: OutboxWriter & Tx, userId: string): Promise<void> {
    if (!this.plans.hasTiers) return;
    const live = await tx.subscription.findMany({
      where: { userId, status: { not: 'CANCELED' } },
      select: { id: true },
    });
    for (const s of live)
      await this.outbox.emit(tx, 'billing.cancel', { subscriptionId: s.id });
  }

  /**
   * Ban: live subscriptions stop at the end of the paid period, nothing is refunded. The
   * cancel is marked as the ban's, so an unban before that end takes it back; a cancel the user
   * scheduled themselves is left as it is.
   */
  async onAccountBanned(tx: OutboxWriter & Tx, userId: string): Promise<void> {
    if (!this.plans.hasTiers) return;
    const live = await tx.subscription.findMany({
      where: { userId, status: { not: 'CANCELED' }, endsAt: null },
      select: { id: true },
    });
    for (const s of live) {
      await tx.subscription.update({
        where: { id: s.id },
        data: { cancelledForBan: true },
      });
      await this.outbox.emit(tx, 'billing.cancel', {
        subscriptionId: s.id,
        when: 'periodEnd',
      });
    }
  }

  /** Unban: the cancels the ban scheduled are taken back while the period lasts. */
  async onAccountUnbanned(
    tx: OutboxWriter & Tx,
    userId: string,
  ): Promise<void> {
    if (!this.plans.hasTiers) return;
    const marked = await tx.subscription.findMany({
      where: { userId, cancelledForBan: true, status: { not: 'CANCELED' } },
      select: { id: true },
    });
    for (const s of marked) {
      await tx.subscription.update({
        where: { id: s.id },
        data: { cancelledForBan: false },
      });
      await this.outbox.emit(tx, 'billing.keep', { subscriptionId: s.id });
    }
  }

  /**
   * Outbox `billing.cancel`: at once for a deleted account, at the end of the paid period for a
   * banned one (a paused subscription can only be cancelled at once; it is not billed anyway).
   */
  async cancel(
    subscriptionId: string,
    when: 'now' | 'periodEnd',
  ): Promise<void> {
    const sub = await this.paddle.getSubscription(subscriptionId);
    if (sub.status === 'canceled') return;
    if (when === 'periodEnd' && sub.scheduled_change?.action === 'cancel')
      return;
    const atOnce = when === 'now' || sub.status === 'paused';
    await this.paddle.cancelSubscription(
      subscriptionId,
      atOnce ? 'immediately' : 'next_billing_period',
    );
    this.logger.log(
      `Subscription ${subscriptionId} cancelled ${atOnce ? 'at once' : 'for the end of its period'}`,
    );
  }

  /** Outbox `billing.keep`: the scheduled cancel is dropped, the subscription renews again. */
  async keep(subscriptionId: string): Promise<void> {
    const sub = await this.paddle.getSubscription(subscriptionId);
    if (sub.status === 'canceled' || sub.scheduled_change?.action !== 'cancel')
      return;
    await this.paddle.removeScheduledChange(subscriptionId);
    this.logger.log(`Subscription ${subscriptionId} renews again (unbanned)`);
  }

  private async prices(): Promise<[BillingPriceDto, BillingPriceDto]> {
    const cached = await this.redis.get(PRICES_CACHE).catch(() => null);
    if (cached) return JSON.parse(cached) as [BillingPriceDto, BillingPriceDto];
    let prices: [BillingPriceDto, BillingPriceDto];
    try {
      const [month, year] = await Promise.all([
        this.paddle.getPrice(
          this.config.get('PADDLE_PRICE_MONTH', { infer: true })!,
        ),
        this.paddle.getPrice(
          this.config.get('PADDLE_PRICE_YEAR', { infer: true })!,
        ),
      ]);
      prices = [priceDto(month, 'month'), priceDto(year, 'year')];
    } catch (err) {
      this.logger.error(`Prices unavailable: ${(err as Error).message}`);
      throw unavailable();
    }
    await this.redis
      .set(PRICES_CACHE, JSON.stringify(prices), 'EX', PRICES_TTL_SEC)
      .catch(() => undefined);
    return prices;
  }

  /**
   * Mirrors one subscription event unless a later one was applied already, then recomputes the
   * account's tier. Locked per subscription, so concurrent deliveries apply one after the other.
   */
  private async applySubscription(
    tx: Tx,
    sub: PaddleSubscription,
    occurredAt: Date,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sub.id}))`;
    const existing = await tx.subscription.findUnique({
      where: { id: sub.id },
    });
    if (existing && existing.eventAt > occurredAt) return;
    const named = sub.custom_data?.['userId'];
    const userId =
      existing?.userId ??
      (typeof named === 'string' && UUID.test(named) ? named : null);
    const user = userId
      ? await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        })
      : null;
    if (!user) {
      this.logger.warn(
        `Subscription ${sub.id} names no known account; ignored`,
      );
      return;
    }
    const mirror = mirrorOf(sub, existing, occurredAt);
    const fields = {
      customerId: sub.customer_id,
      ...mirror,
      eventAt: occurredAt,
    };
    await tx.subscription.upsert({
      where: { id: sub.id },
      create: { id: sub.id, userId: user.id, ...fields },
      update: fields,
    });
    const newlyPastDue =
      mirror.status === 'PAST_DUE' && !existing?.pastDueSince;
    await this.grant(tx, user.id, newlyPastDue);
  }

  /**
   * The account's tier from all of its subscriptions: Pro until the latest end any of them gives.
   * A better grant by an admin (longer, or without an end) is left alone. A subscription
   * that gives nothing any more ends Pro now; tier.expire writes it down and tells the user.
   */
  private async grant(
    tx: Tx,
    userId: string,
    newlyPastDue: boolean,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const now = new Date();
    const [user, subs, graceDays] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          status: true,
          tier: true,
          tierUntil: true,
          tierSource: true,
          tierReminder: true,
        },
      }),
      tx.subscription.findMany({ where: { userId } }),
      this.settings.get('paymentGraceDays'),
    ]);
    if (user.status === 'DELETED') return;
    const until = latest(
      subs.map((s) => proUntil(s, graceDays, now)).filter((d) => d && d > now),
    );
    const adminGrant =
      user.tierSource === 'ADMIN' && effectiveTier(user, now) === 'PREMIUM';
    if (adminGrant && (!user.tierUntil || !until || user.tierUntil >= until))
      return;
    if (until) {
      const sameEnd = user.tierUntil?.getTime() === until.getTime();
      if (user.tier !== 'PREMIUM' || user.tierSource !== 'PADDLE' || !sameEnd)
        await tx.user.update({
          where: { id: userId },
          data: {
            tier: 'PREMIUM',
            tierUntil: until,
            tierSource: 'PADDLE',
            // The payment-failed notice replaces the week-before reminder; the last-day one stays.
            tierReminder: newlyPastDue ? 7 : sameEnd ? user.tierReminder : null,
          },
        });
      if (newlyPastDue && user.status === 'ACTIVE')
        await this.outbox.emit(tx, 'notify', {
          deliveries: [
            {
              userId,
              type: 'PLAN_PAYMENT_FAILED',
              payload: { until: until.toISOString() },
            },
          ],
        });
    } else if (
      user.tierSource === 'PADDLE' &&
      user.tier === 'PREMIUM' &&
      (!user.tierUntil || user.tierUntil > now)
    ) {
      await tx.user.update({ where: { id: userId }, data: { tierUntil: now } });
    }
  }
}

function priceDto(p: PaddlePrice, interval: 'month' | 'year'): BillingPriceDto {
  return {
    id: p.id,
    interval,
    amount: Number(p.unit_price.amount),
    currency: p.unit_price.currency_code,
  };
}

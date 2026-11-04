import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import type { Role, Tier, TierSource } from '../../generated/prisma/enums.js';
import type { TierLimits } from '../settings/settings.defaults.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  type Plan,
  type TierState,
  instancePlan,
  instanceTierLimits,
  planOf,
} from './plan.js';
import type { Edition, PlansDto } from './plans.dto.js';

/**
 * The tiers of this instance and the limits an account gets. Only the cloud has tiers (Free, Pro);
 * a self-hosted instance has one set of limits for everyone and no tariff at all.
 */
@Injectable()
export class PlansService {
  readonly edition: Edition;

  constructor(
    private readonly settings: SettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.edition = config.get('EDITION', { infer: true });
  }

  /** Whether accounts have tiers here: Free/Pro, their end dates, reminders and payment. */
  get hasTiers(): boolean {
    return this.edition === 'cloud';
  }

  async list(): Promise<PlansDto> {
    return { edition: this.edition, tiers: await this.settings.get('tiers') };
  }

  /** Limits of an account with this effective tier; self-hosted, the tier makes no difference. */
  async limitsFor(tier: Tier): Promise<TierLimits> {
    return this.hasTiers
      ? (await this.settings.get('tiers'))[tier]
      : instanceTierLimits(await this.settings.get('limits'));
  }

  /** An account's limits: its tier's, with no storage quota for an admin. */
  /**
   * An admin has no limits: no storage quota, no file size limit (but what one upload can carry),
   * no traffic limit, no daily limit through the browser extension — also when signed in by the
   * extension's token, which carries no admin powers.
   */
  async limitsForUser(user: {
    role: Role;
    tier: Tier;
    adminAccount?: true;
  }): Promise<TierLimits> {
    const limits = await this.limitsFor(user.tier);
    return user.role === 'ADMIN' || user.adminAccount
      ? {
          ...limits,
          storageQuotaBytes: 0,
          maxFileBytes: 0,
          trafficBytesPerMonth: 0,
          extensionPerDay: 0,
        }
      : limits;
  }

  /** An account's plan: its effective tier and that tier's limits, or the instance's limits. */
  async planOf(
    u: TierState & { tierSource: TierSource | null },
    now = new Date(),
  ): Promise<Plan> {
    return this.hasTiers
      ? planOf(u, await this.settings.get('tiers'), now)
      : instancePlan(await this.limitsFor('BASIC'));
  }
}

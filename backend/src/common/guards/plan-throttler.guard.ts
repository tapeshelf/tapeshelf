import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

import { PlansService } from '../../modules/plans/plans.service.js';
import type { AppRequest } from '../auth/request-user.js';

/**
 * Rate limits per account: a signed-in request counts against the user, wherever it
 * comes from, with the route's limit multiplied by the tier's apiRateMultiplier (always 1
 * self-hosted); a guest counts against the IP. Runs after JwtAuthGuard, which has identified the user.
 */
@Injectable()
export class PlanThrottlerGuard extends ThrottlerGuard {
  @Inject(PlansService) private readonly plans!: PlansService;

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = (req as unknown as AppRequest).user;
    // "View as" keeps counting against the admin, not the account being looked at.
    return user ? `user:${user.viewAsBy ?? user.id}` : super.getTracker(req);
  }

  protected override async handleRequest(
    props: ThrottlerRequest,
  ): Promise<boolean> {
    const user = props.context.switchToHttp().getRequest<AppRequest>().user;
    if (!user) return super.handleRequest(props);
    const multiplier = (await this.plans.limitsFor(user.tier))
      .apiRateMultiplier;
    return super.handleRequest({
      ...props,
      limit: Math.max(1, Math.round(props.limit * multiplier)),
    });
  }
}

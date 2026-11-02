import { Global, Module } from '@nestjs/common';

import { PlanExpiryService } from './plan-expiry.service.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

/** Tiers and their limits; the worker uses it for tier.expire (the controller is idle there). */
@Global()
@Module({
  controllers: [PlansController],
  providers: [PlansService, PlanExpiryService],
  exports: [PlansService, PlanExpiryService],
})
export class PlansModule {}

import { Global, Module } from '@nestjs/common';

import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PaddleIps } from './paddle-ips.js';
import { PaddleClient } from './paddle.client.js';

/**
 * Pro subscriptions through Paddle. Global: account deletion stops subscriptions and the worker's
 * outbox relay runs the cancellation (the controller is idle there).
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, PaddleClient, PaddleIps],
  exports: [BillingService],
})
export class BillingModule {}

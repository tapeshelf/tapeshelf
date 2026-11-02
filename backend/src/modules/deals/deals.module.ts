import { Module } from '@nestjs/common';

import { ExchangeModule } from '../exchange/exchange.module.js';
import { StreamingModule } from '../streaming/streaming.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  DealsController,
  ExchangeLinksController,
} from './deals.controller.js';
import { ExchangeLinksService } from './exchange-links.service.js';
import { GuestDealsService } from './guest-deals.service.js';
import { GuestEscrowModule } from './guest-escrow.module.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

/** Exchange links and exchanges with guests. */
@Module({
  imports: [
    AnonymousLinksModule,
    ExchangeModule,
    UploadsModule,
    StreamingModule,
    UsersModule,
    GuestEscrowModule,
  ],
  controllers: [ExchangeLinksController, DealsController],
  providers: [ExchangeLinksService, GuestDealsService],
  exports: [GuestDealsService],
})
export class DealsModule {}

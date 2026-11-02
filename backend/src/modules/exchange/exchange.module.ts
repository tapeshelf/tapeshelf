import { Module } from '@nestjs/common';

import { GuestEscrowModule } from '../deals/guest-escrow.module.js';
import { UsersModule } from '../users/users.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';
import { ExchangeController } from './exchange.controller.js';
import { ExchangeService } from './exchange.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

@Module({
  imports: [AnonymousLinksModule, UsersModule, GuestEscrowModule],
  controllers: [ExchangeController, BlocksController],
  providers: [ExchangeService, BlocksService],
  exports: [ExchangeService, BlocksService],
})
export class ExchangeModule {}

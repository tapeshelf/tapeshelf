import { Module } from '@nestjs/common';

import { ExchangeModule } from '../exchange/exchange.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  imports: [ExchangeModule, VideosModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}

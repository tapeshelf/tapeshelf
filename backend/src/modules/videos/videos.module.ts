import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { StacksModule } from '../collection/stacks.module.js';
import { ExchangeModule } from '../exchange/exchange.module.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

@Module({
  imports: [
    AnonymousLinksModule,
    CategoriesModule,
    ExchangeModule,
    StacksModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}

import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { ExchangeModule } from '../exchange/exchange.module.js';
import { StreamingModule } from '../streaming/streaming.module.js';
import { UsersModule } from '../users/users.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { StacksModule } from './stacks.module.js';
import { CollectionController } from './collection.controller.js';
import { CollectionService } from './collection.service.js';
import { MyCollectionController } from './my-collection.controller.js';
import { MyCollectionService } from './my-collection.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

@Module({
  imports: [
    AnonymousLinksModule,
    UsersModule,
    CategoriesModule,
    VideosModule,
    ExchangeModule,
    StacksModule,
    StreamingModule,
  ],
  controllers: [CollectionController, MyCollectionController],
  providers: [CollectionService, MyCollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}

import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { StacksController } from './stacks.controller.js';
import { StacksService } from './stacks.service.js';

/** Stacks on the shelf; apart from the collection module so the videos module can use it too. */
@Module({
  imports: [CategoriesModule],
  controllers: [StacksController],
  providers: [StacksService],
  exports: [StacksService],
})
export class StacksModule {}

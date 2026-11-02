import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AppTokensController } from './app-tokens.controller.js';
import { AppTokensService } from './app-tokens.service.js';

/** Connected apps: tokens of the browser extension and its form's context. */
@Module({
  imports: [CategoriesModule, PlansModule, UploadsModule],
  controllers: [AppTokensController],
  providers: [AppTokensService],
})
export class AppTokensModule {}

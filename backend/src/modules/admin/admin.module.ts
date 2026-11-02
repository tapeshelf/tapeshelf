import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { StacksModule } from '../collection/stacks.module.js';
import { ExchangeModule } from '../exchange/exchange.module.js';
import { UsersModule } from '../users/users.module.js';
import { TrashModule } from '../trash/trash.module.js';
import { StreamingModule } from '../streaming/streaming.module.js';
import { VideosModule } from '../videos/videos.module.js';
import { AdminOverviewService } from './admin-overview.service.js';
import { AdminReportsService } from './admin-reports.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminVideosService } from './admin-videos.service.js';
import {
  AdminController,
  AdminReportsController,
  AdminTrashController,
  AdminUsersController,
  AdminVideosController,
} from './admin.controller.js';

@Module({
  imports: [
    AccountsModule,
    ExchangeModule,
    UsersModule,
    VideosModule,
    TrashModule,
    StreamingModule,
    StacksModule,
  ],
  controllers: [
    AdminController,
    AdminUsersController,
    AdminVideosController,
    AdminTrashController,
    AdminReportsController,
  ],
  providers: [
    AdminOverviewService,
    AdminUsersService,
    AdminVideosService,
    AdminReportsService,
  ],
})
export class AdminModule {}

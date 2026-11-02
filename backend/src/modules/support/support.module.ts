import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module.js';
import { SupportFaqService } from './support-faq.service.js';
import {
  AdminSupportController,
  SupportController,
} from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, SupportFaqService],
  exports: [SupportService],
})
export class SupportModule {}

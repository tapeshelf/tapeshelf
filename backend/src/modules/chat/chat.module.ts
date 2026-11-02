import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

@Module({
  imports: [AnonymousLinksModule, UsersModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}

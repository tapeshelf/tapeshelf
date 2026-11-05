import { Module } from '@nestjs/common';

import { MailModule } from '../../infra/mail/mail.module.js';
import { GuestMailModule } from '../deals/guest-mail.module.js';
import { NotificationMailer } from './notification-mailer.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OutboxRelayService } from './outbox-relay.service.js';
import { FcmSender } from './fcm.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';
import { UnsubscribeController } from './unsubscribe.controller.js';

/** Shared by the API (controller) and the worker (relay + mailer consumers in NotificationWorkers). */
@Module({
  imports: [MailModule, GuestMailModule],
  controllers: [NotificationsController, UnsubscribeController, PushController],
  providers: [
    NotificationsService,
    NotificationMailer,
    OutboxRelayService,
    FcmSender,
    PushService,
  ],
  exports: [
    NotificationsService,
    NotificationMailer,
    OutboxRelayService,
    PushService,
  ],
})
export class NotificationsModule {}

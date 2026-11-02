import { Global, Module } from '@nestjs/common';

import { MailDeliveryService } from './mail-delivery.service.js';
import { MailService } from './mail.service.js';

@Global()
@Module({
  providers: [MailService, MailDeliveryService],
  exports: [MailService, MailDeliveryService],
})
export class MailModule {}

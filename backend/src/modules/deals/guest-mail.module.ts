import { Module } from '@nestjs/common';

import { MailModule } from '../../infra/mail/mail.module.js';
import { GuestMailService } from './guest-mail.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

/** What a guest hears of their deal: the notifications' side needs only this. */
@Module({
  imports: [AnonymousLinksModule, MailModule],
  providers: [GuestMailService],
  exports: [GuestMailService],
})
export class GuestMailModule {}

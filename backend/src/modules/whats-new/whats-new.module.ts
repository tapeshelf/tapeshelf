import { Module } from '@nestjs/common';

import { WhatsNewController } from './whats-new.controller.js';
import { WhatsNewService } from './whats-new.service.js';

@Module({
  controllers: [WhatsNewController],
  providers: [WhatsNewService],
})
export class WhatsNewModule {}

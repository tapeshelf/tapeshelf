import { Module } from '@nestjs/common';

import { AnonymousLinksController } from './anonymous-links.controller.js';
import { AnonymousLinksService } from './anonymous-links.service.js';

/** Anonymous links to a shelf: every module whose answers name people masks them with it. */
@Module({
  controllers: [AnonymousLinksController],
  providers: [AnonymousLinksService],
  exports: [AnonymousLinksService],
})
export class AnonymousLinksModule {}

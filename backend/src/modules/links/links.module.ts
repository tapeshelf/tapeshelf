import { Module } from '@nestjs/common';

import { StreamingModule } from '../streaming/streaming.module.js';
import { LinksController } from './links.controller.js';
import { LinksService } from './links.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

/** Temporary links. */
@Module({
  imports: [AnonymousLinksModule, StreamingModule],
  controllers: [LinksController],
  providers: [LinksService],
})
export class LinksModule {}

import { Module } from '@nestjs/common';

import { PlaybackTokenService } from './playback-token.service.js';
import { StreamingController } from './streaming.controller.js';
import { StreamingService } from './streaming.service.js';

@Module({
  controllers: [StreamingController],
  providers: [StreamingService, PlaybackTokenService],
  exports: [StreamingService, PlaybackTokenService],
})
export class StreamingModule {}

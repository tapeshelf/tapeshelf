import { Module } from '@nestjs/common';

import { OfflineController } from './offline.controller.js';
import { OfflineService } from './offline.service.js';
import { PlaybackTokenService } from './playback-token.service.js';
import { StreamingController } from './streaming.controller.js';
import { StreamingService } from './streaming.service.js';

@Module({
  controllers: [StreamingController, OfflineController],
  providers: [StreamingService, PlaybackTokenService, OfflineService],
  exports: [StreamingService, PlaybackTokenService],
})
export class StreamingModule {}

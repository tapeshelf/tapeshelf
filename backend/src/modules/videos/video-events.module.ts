import { Module } from '@nestjs/common';

import { VideoEventsRelay } from './video-events.relay.js';
import { VideosModule } from './videos.module.js';

/** API-only: relays worker progress to websockets. The worker imports VideosModule without it. */
@Module({
  imports: [VideosModule],
  providers: [VideoEventsRelay],
})
export class VideoEventsModule {}

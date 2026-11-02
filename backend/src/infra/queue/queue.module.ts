import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { QUEUE_CONNECTION, redisOptionsFromUrl } from './queue.connection.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        redisOptionsFromUrl(config.get('REDIS_URL', { infer: true })),
    },
    QueueService,
  ],
  exports: [QUEUE_CONNECTION, QueueService],
})
export class QueueModule {}

import { Module } from '@nestjs/common';

import { RetentionService } from './retention.service.js';

/** How long records are kept. */
@Module({ providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}

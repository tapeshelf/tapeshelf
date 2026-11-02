import { Module } from '@nestjs/common';

import { TrashController } from './trash.controller.js';
import { TrashService } from './trash.service.js';
import { VideoPurgeService } from './video-purge.service.js';

/** Trash: the owner restores or lets go; only the admin erases. */
@Module({
  controllers: [TrashController],
  providers: [TrashService, VideoPurgeService],
  exports: [TrashService, VideoPurgeService],
})
export class TrashModule {}

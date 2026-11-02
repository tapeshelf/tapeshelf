import { Module } from '@nestjs/common';

import { DownloadTicketService } from './download-ticket.service.js';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';

/** Downloads of originals. */
@Module({
  controllers: [DownloadsController],
  providers: [DownloadsService, DownloadTicketService],
})
export class DownloadsModule {}

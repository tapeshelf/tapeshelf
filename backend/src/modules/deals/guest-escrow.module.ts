import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { TrashModule } from '../trash/trash.module.js';
import { GuestEscrowService } from './guest-escrow.service.js';
import { GuestMailModule } from './guest-mail.module.js';

/** What a guest's deal leaves on our servers: the API and the worker. */
@Module({
  // Erasing writes the audit (global in the apps; named here for graphs built without it).
  imports: [TrashModule, AuditModule, GuestMailModule],
  providers: [GuestEscrowService],
  exports: [GuestEscrowService, GuestMailModule],
})
export class GuestEscrowModule {}

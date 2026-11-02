import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { SocialController } from './social.controller.js';
import { SocialService } from './social.service.js';

@Module({
  imports: [UsersModule],
  controllers: [SocialController, InvitesController],
  providers: [SocialService, InvitesService],
  exports: [SocialService, InvitesService],
})
export class SocialModule {}

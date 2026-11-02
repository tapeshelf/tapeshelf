import { Module } from '@nestjs/common';

import { ProfileMediaService } from './profile-media.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AnonymousLinksModule } from '../anonymous-links/anonymous-links.module.js';

@Module({
  imports: [AnonymousLinksModule],
  controllers: [UsersController],
  providers: [UsersService, ProfileMediaService],
  exports: [UsersService],
})
export class UsersModule {}

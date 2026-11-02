import { Global, Module } from '@nestjs/common';

import { DealsModule } from '../deals/deals.module.js';
import { SocialModule } from '../social/social.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleService } from './google.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';

@Global()
@Module({
  imports: [UsersModule, SocialModule, DealsModule],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    SessionService,
    TokenService,
    LoginAttemptsService,
    GoogleService,
    TwoFactorService,
  ],
  exports: [TokenService, SessionService, AuthService, TwoFactorService],
})
export class AuthModule {}

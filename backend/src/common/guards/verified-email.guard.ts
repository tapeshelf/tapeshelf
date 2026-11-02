import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AppRequest } from '../auth/request-user.js';
import { REQUIRE_VERIFIED } from '../decorators/verified.decorator.js';
import { AppException } from '../errors/app.exception.js';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_VERIFIED,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (user && !user.emailVerified)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'emailNotVerified',
        'errors.auth.emailNotVerified',
      );
    return true;
  }
}

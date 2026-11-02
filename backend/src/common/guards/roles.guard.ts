import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '../../generated/prisma/enums.js';
import type { AppRequest } from '../auth/request-user.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { AppException } from '../errors/app.exception.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (user?.adminLocked && roles.includes('ADMIN'))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'twoFactorRequired',
        'errors.twoFactor.required',
      );
    if (!user || !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

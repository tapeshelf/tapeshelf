import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import type { Env } from '../../config/env.js';
import { SKIP_CSRF } from '../decorators/skip-csrf.decorator.js';
import { AppException } from '../errors/app.exception.js';
import type { AppRequest } from '../auth/request-user.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-based auth needs CSRF defence: every state-changing request must carry the custom header
 * (browsers never add it cross-site without CORS consent) and, when an Origin is sent, it must be ours.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    const publicOrigin = new URL(config.get('PUBLIC_URL', { infer: true }))
      .origin;
    this.allowedOrigins = new Set([publicOrigin]);
    if (config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.allowedOrigins
        .add('http://localhost:4200')
        .add('http://localhost:3000');
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    // A connected app's token is no cookie: a page elsewhere cannot make the browser send it.
    if (req.user?.appTokenId) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.has(origin))
      throw new AppException(HttpStatus.FORBIDDEN, 'csrf', 'errors.auth.csrf');
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest')
      throw new AppException(HttpStatus.FORBIDDEN, 'csrf', 'errors.auth.csrf');
    return true;
  }
}

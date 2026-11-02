import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { effectiveTier } from '../../modules/plans/plan.js';
import {
  ACCESS_COOKIE,
  TokenService,
} from '../../modules/auth/token.service.js';
import {
  hashAppToken,
  readBearer,
} from '../../modules/app-tokens/app-token-rules.js';
import type { AppRequest } from '../auth/request-user.js';
import { APP_TOKEN_ACCESS } from '../decorators/app-token.decorator.js';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import { VIEW_AS_HEADER } from '../view-as.js';
import { AppException } from '../errors/app.exception.js';

/**
 * Sent by the app while it believes it is signed in. The access cookie lives 15 minutes and the
 * browser drops it when it expires; a public route (a video page, a shelf) would then quietly answer
 * as for a guest, and the owner would see their own private video as a stranger's. With this header
 * such a request gets 401 instead, so the app renews the session and asks again.
 */
export const SIGNED_IN_HEADER = 'x-signed-in';
/**
 * Sent by the app while the owner looks at their own page the way a visitor sees it:
 * a public read answers as to a guest — the session stays, only this request forgets it.
 */
export const AS_GUEST_HEADER = 'x-as-guest';

/**
 * Global guard: reads the access cookie, validates the JWT, checks the session is still alive and the
 * account is active, and attaches `req.user`. Public routes pass without a user (unless the app says
 * it is signed in, see SIGNED_IN_HEADER); everything else needs one.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const token = req.cookies?.[ACCESS_COOKIE];
    if (token) await this.attachUser(req, token, isPublic);
    // A connected app signs in with its token, and only where the route takes one.
    const bearer = req.user ? null : readBearer(req.headers.authorization);
    if (bearer) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        APP_TOKEN_ACCESS,
        [ctx.getHandler(), ctx.getClass()],
      );
      if (!allowed)
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'appTokenScope',
          'errors.appTokens.scope',
        );
      await this.attachAppToken(req, bearer);
    }
    const viewAs = req.headers[VIEW_AS_HEADER];
    if (typeof viewAs === 'string' && req.user?.role === 'ADMIN')
      await this.applyViewAs(req, viewAs, isPublic);
    if (isPublic) {
      if (req.headers[AS_GUEST_HEADER] && SAFE_METHODS.has(req.method)) {
        req.user = undefined;
        return true;
      }
      if (!req.user && req.headers[SIGNED_IN_HEADER])
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'sessionExpired',
          'errors.auth.sessionExpired',
        );
      return true;
    }
    if (!req.user) throw new UnauthorizedException();
    return true;
  }

  private async attachUser(
    req: AppRequest,
    token: string,
    isPublic: boolean,
  ): Promise<void> {
    const claims = await this.tokens.verifyAccess(token).catch(() => null);
    if (!claims) return;
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        secondFactorAt: true,
        user: {
          select: {
            id: true,
            role: true,
            tier: true,
            tierUntil: true,
            status: true,
            locale: true,
            emailVerifiedAt: true,
            twoFactorAt: true,
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.user.id !== claims.sub
    )
      return;
    const user = session.user;
    if (user.status === 'BANNED') {
      if (isPublic) return;
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'accountBanned',
        'errors.auth.accountBanned',
      );
    }
    if (user.status !== 'ACTIVE') return;
    // An admin is one only with the second step passed in this session: till then the
    // session sees what a user sees, and the admin API asks for the step.
    const adminLocked =
      user.role === 'ADMIN' && !(user.twoFactorAt && session.secondFactorAt);
    req.user = {
      id: user.id,
      role: adminLocked ? 'USER' : user.role,
      ...(adminLocked ? { adminLocked: true as const } : {}),
      tier: effectiveTier(user),
      status: user.status,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      sessionId: session.id,
    };
    req.locale = user.locale;
  }

  /**
   * A connected app's token: its user, never with admin powers. A token that is unknown,
   * revoked or whose account is gone answers appTokenInvalid, so the extension asks to connect again.
   */
  private async attachAppToken(req: AppRequest, raw: string): Promise<void> {
    const found = await this.prisma.appToken.findUnique({
      where: { tokenHash: hashAppToken(raw) },
      select: {
        id: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            role: true,
            tier: true,
            tierUntil: true,
            status: true,
            locale: true,
            emailVerifiedAt: true,
          },
        },
      },
    });
    if (!found || found.revokedAt || found.user.status === 'DELETED')
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'appTokenInvalid',
        'errors.appTokens.invalid',
      );
    const user = found.user;
    if (user.status === 'BANNED')
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'accountBanned',
        'errors.auth.accountBanned',
      );
    if (user.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'appTokenInvalid',
        'errors.appTokens.invalid',
      );
    // Written at most once an hour: every part of an upload passes here.
    if (!found.lastUsedAt || Date.now() - found.lastUsedAt.getTime() > HOUR_MS)
      void this.prisma.appToken
        .update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    req.user = {
      id: user.id,
      role: 'USER',
      tier: effectiveTier(user),
      status: user.status,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      sessionId: '',
      appTokenId: found.id,
      // No admin powers through a token, but an admin's account keeps an admin's limits.
      ...(user.role === 'ADMIN' ? { adminAccount: true as const } : {}),
    };
    req.locale = user.locale;
  }

  /**
   * Admin "view as" (read-only): GET requests run as the chosen user;
   * changes are refused, except public routes (playback, refresh...), which keep running as the
   * admin. The admin API itself never switches.
   */
  private async applyViewAs(
    req: AppRequest,
    targetId: string,
    isPublic: boolean,
  ): Promise<void> {
    if (req.originalUrl.startsWith('/api/admin/')) return;
    if (!SAFE_METHODS.has(req.method)) {
      if (isPublic) return;
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'viewAsReadOnly',
        'errors.admin.viewAsReadOnly',
      );
    }
    const target = UUID_RE.test(targetId)
      ? await this.prisma.user.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            role: true,
            tier: true,
            tierUntil: true,
            status: true,
            emailVerifiedAt: true,
          },
        })
      : null;
    if (!target || target.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    const admin = req.user!;
    req.user = {
      id: target.id,
      role: target.role,
      tier: effectiveTier(target),
      status: target.status,
      locale: admin.locale,
      emailVerified: target.emailVerifiedAt !== null,
      sessionId: admin.sessionId,
      viewAsBy: admin.id,
    };
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const HOUR_MS = 3600 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

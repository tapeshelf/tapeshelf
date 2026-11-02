import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import type { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { publishSessionsRevoked } from '../../infra/ws/ws-events.js';
import type { Redis } from 'ioredis';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SEC,
  REFRESH_COOKIE,
  TokenService,
} from './token.service.js';

export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000; // sliding
export const SESSION_ABSOLUTE_MS = 365 * 24 * 3600 * 1000;
const REFRESH_COOKIE_PATH = '/api/auth';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class SessionService {
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.secure = config
      .get('PUBLIC_URL', { infer: true })
      .startsWith('https://');
  }

  /** Creates a session row and returns both tokens (refresh token is only ever stored hashed). */
  async create(
    user: { id: string; role: Role },
    meta: ClientMeta,
    /** The sign-in passed the second step. */
    secondFactor = false,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip?.slice(0, 64),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        secondFactorAt: secondFactor ? new Date() : null,
      },
      select: { id: true },
    });
    const accessToken = await this.tokens.signAccess(
      user.id,
      session.id,
      user.role,
    );
    return { accessToken, refreshToken, sessionId: session.id };
  }

  /** Rotates the refresh token; an unknown, revoked or expired token means "sign in again". */
  async rotate(
    rawRefresh: string,
    meta: ClientMeta,
  ): Promise<IssuedTokens & { userId: string }> {
    const now = Date.now();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawRefresh) },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { role: true, status: true } },
      },
    });
    const alive =
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > now &&
      session.createdAt.getTime() + SESSION_ABSOLUTE_MS > now;
    if (!alive || session.user.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'sessionExpired',
        'errors.auth.sessionExpired',
      );
    }
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashToken(refreshToken),
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + REFRESH_TTL_MS),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip?.slice(0, 64),
      },
    });
    const accessToken = await this.tokens.signAccess(
      session.userId,
      session.id,
      session.user.role,
    );
    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  /** Revokes one session; its open websockets are closed too. */
  async revoke(sessionId: string, userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await publishSessionsRevoked(this.redis, userId, {
      sessionIds: [sessionId],
    });
  }

  /**
   * Ends the session behind a browser's refresh cookie, if it has one: a new sign-in in that
   * browser (Google sign-up or sign-in) replaces it, so it must not stay alive behind the new cookies.
   */
  async revokeByRefresh(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawRefresh) },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (session && !session.revokedAt)
      await this.revoke(session.id, session.userId);
  }

  /**
   * Who is signed in behind a refresh cookie, without rotating it: for tapeshelf.com's static
   * pages, which only need to know whether to offer "Open my shelf".
   */
  async peek(rawRefresh: string | undefined): Promise<string | null> {
    if (!rawRefresh) return null;
    const now = Date.now();
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawRefresh) },
      select: {
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { username: true, status: true } },
      },
    });
    const alive =
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > now &&
      session.createdAt.getTime() + SESSION_ABSOLUTE_MS > now &&
      session.user.status === 'ACTIVE';
    return alive ? session.user.username : null;
  }

  /**
   * Signs out every session but `exceptSessionId`, and disconnects every connected app:
   * "sign out everywhere", a new or reset password and two-step sign-in turned on all reach the
   * browser extension too.
   */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await this.prisma.appToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await publishSessionsRevoked(this.redis, userId, { exceptSessionId });
  }

  list(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  setCookies(res: Response, tokens: IssuedTokens): void {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: '/',
      maxAge: ACCESS_TTL_SEC * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }

  clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}

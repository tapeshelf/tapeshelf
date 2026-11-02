import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { PlansService } from '../plans/plans.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  CODE_TTL_SEC,
  MAX_APP_TOKENS,
  hashAppToken,
  isExtensionRedirect,
  newAppToken,
  newCode,
  pkceMatches,
  startOfUtcDay,
} from './app-token-rules.js';
import type {
  AppTokenDto,
  AppTokenIssuedDto,
  AppTokenUserDto,
  ConnectAppDto,
  ConnectAppResultDto,
  ExchangeCodeDto,
  ExtensionContextDto,
} from './app-tokens.dto.js';

interface PendingCode {
  userId: string;
  challenge: string;
  name: string;
  redirectUri: string;
}

const codeKey = (code: string) => `apptoken:code:${hashAppToken(code)}`;
const DAY_MS = 24 * 3600 * 1000;

/** Connected apps: the browser extension's tokens and what its form needs. */
@Injectable()
export class AppTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
    private readonly categories: CategoriesService,
    private readonly uploads: UploadsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** "Connect" in the sign-in window: a one-time code for the extension, bound to its PKCE challenge. */
  async connect(
    user: RequestUser,
    dto: ConnectAppDto,
  ): Promise<ConnectAppResultDto> {
    if (!isExtensionRedirect(dto.redirectUri))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'appRedirectInvalid',
        'errors.appTokens.redirect',
      );
    const code = newCode();
    const pending: PendingCode = {
      userId: user.id,
      challenge: dto.codeChallenge,
      name: dto.name,
      redirectUri: dto.redirectUri,
    };
    await this.redis.set(
      codeKey(code),
      JSON.stringify(pending),
      'EX',
      CODE_TTL_SEC,
    );
    const to = new URL(dto.redirectUri);
    to.searchParams.set('code', code);
    to.searchParams.set('state', dto.state);
    return { redirectTo: to.href };
  }

  /** The extension trades the code (once, within five minutes, with the PKCE verifier) for its token. */
  async exchange(dto: ExchangeCodeDto): Promise<AppTokenIssuedDto> {
    const raw = await this.redis.getdel(codeKey(dto.code));
    const pending = raw ? (JSON.parse(raw) as PendingCode) : null;
    if (
      !pending ||
      pending.redirectUri !== dto.redirectUri ||
      !pkceMatches(dto.codeVerifier, pending.challenge)
    )
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'appCodeInvalid',
        'errors.appTokens.code',
      );
    const user = await this.prisma.user.findUnique({
      where: { id: pending.userId },
      select: {
        id: true,
        status: true,
        username: true,
        displayName: true,
        avatarKey: true,
      },
    });
    if (!user || user.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'appCodeInvalid',
        'errors.appTokens.code',
      );
    const token = newAppToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      await tx.appToken.create({
        data: {
          userId: user.id,
          name: pending.name,
          tokenHash: hashAppToken(token),
        },
      });
      // Past the cap, the connection unused the longest goes.
      const live = await tx.appToken.findMany({
        where: { userId: user.id, revokedAt: null },
        orderBy: [
          { lastUsedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        select: { id: true },
      });
      const extra = live.slice(MAX_APP_TOKENS).map((t) => t.id);
      if (extra.length)
        await tx.appToken.updateMany({
          where: { id: { in: extra } },
          data: { revokedAt: new Date() },
        });
    });
    return { token, user: this.userDto(user) };
  }

  async list(userId: string): Promise<AppTokenDto[]> {
    const rows = await this.prisma.appToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async revoke(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.appToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'appTokenNotFound',
        'errors.appTokens.notFound',
      );
  }

  /** The extension signs out: its own token goes. */
  async revokeCurrent(user: RequestUser): Promise<void> {
    if (!user.appTokenId) return;
    await this.prisma.appToken.updateMany({
      where: { id: user.appTokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Who is connected, what they may upload and where it can go: the extension's form in one answer. */
  async context(user: RequestUser): Promise<ExtensionContextDto> {
    const [me, limits, quota, categories, usedToday] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { username: true, displayName: true, avatarKey: true },
      }),
      this.plans.limitsForUser(user),
      this.uploads.quota(user),
      this.categories.listMine(user.id),
      this.uploads.extensionUploadsToday(user.id),
    ]);
    const start = startOfUtcDay();
    return {
      user: this.userDto(me),
      unlimited: limits.extensionPerDay === 0,
      emailVerified: user.emailVerified,
      limits: {
        maxFileBytes: limits.maxFileBytes,
        freeBytes:
          limits.storageQuotaBytes > 0
            ? Math.max(
                0,
                limits.storageQuotaBytes -
                  quota.usedBytes -
                  quota.reservedBytes,
              )
            : -1,
        perDay: limits.extensionPerDay,
        usedToday,
        resetsAt: new Date(start.getTime() + DAY_MS).toISOString(),
      },
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  private userDto(u: {
    username: string;
    displayName: string;
    avatarKey: string | null;
  }): AppTokenUserDto {
    return {
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarKey ? this.storage.publicUrl(u.avatarKey) : null,
    };
  }
}

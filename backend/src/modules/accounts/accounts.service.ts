import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { verifyPassword } from '../../common/crypto/password.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { publishSessionsRevoked } from '../../infra/ws/ws-events.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import { VideosService } from '../videos/videos.service.js';
import { supportPrefix } from '../support/support-images.js';
import { IN_USER_TRASH } from '../trash/trash-state.js';
import type { DeleteAccountDto } from './accounts.dto.js';

type Tx = Prisma.TransactionClient;

/**
 * Account lifecycle: ban / unban and deletion. Each runs in one transaction with its audit entry and outbox events.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly exchange: ExchangeService,
    private readonly videos: VideosService,
    private readonly billing: BillingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Banned: no sign-in (sessions revoked), page → 404, open requests closed. Videos stay with their
   * holders; follows stay too, so an unban brings the account back as it was.
   */
  async ban(actorId: string, userId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.lock(tx, userId);
      if (user.status === 'DELETED') throw gone();
      if (user.status === 'BANNED') return;
      const now = new Date();
      await tx.user.update({
        where: { id: userId },
        data: { status: 'BANNED', bannedAt: now, banReason: reason },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      // A blocked account cannot open its trash: what was there waits for the admin.
      await tx.video.updateMany({
        where: { authorId: userId, ...IN_USER_TRASH },
        data: { trashExit: 'BANNED', trashExitAt: now },
      });
      const closed = await this.exchange.onUserUnavailable(tx, userId);
      // Pro ends with the paid period, unless the ban is lifted before.
      await this.billing.onAccountBanned(tx, userId);
      await this.audit.log(
        {
          actorId,
          action: 'user.ban',
          targetType: 'user',
          targetId: userId,
          meta: { username: user.username, reason, closedRequests: closed },
        },
        tx,
      );
    });
    await publishSessionsRevoked(this.redis, userId);
    await this.outbox.nudge();
  }

  async unban(actorId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.lock(tx, userId);
      if (user.status !== 'BANNED') return;
      await tx.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE', bannedAt: null, banReason: null },
      });
      await this.billing.onAccountUnbanned(tx, userId);
      await this.audit.log(
        {
          actorId,
          action: 'user.unban',
          targetType: 'user',
          targetId: userId,
          meta: { username: user.username },
        },
        tx,
      );
    });
    await this.outbox.nudge();
  }

  /** Self-service deletion: the password (or, without one, the username) confirms it. */
  async deleteOwn(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, passwordHash: true },
    });
    const ok = user.passwordHash
      ? !!dto.password &&
        (await verifyPassword(user.passwordHash, dto.password))
      : dto.confirm?.trim().toLowerCase() === user.username;
    if (!ok)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        user.passwordHash ? 'wrongPassword' : 'confirmMismatch',
        user.passwordHash
          ? 'errors.auth.wrongPassword'
          : 'errors.account.confirmMismatch',
      );
    await this.delete(userId, userId);
  }

  /**
   * Immediate and final: a tombstone keeps the username reserved and the chats readable
   * ("Deleted user"); authored videos go to the admin trash (files stay in S3), holdings of
   * other people's videos, follows, blocks, sessions and settings are removed, open requests close.
   */
  async delete(
    actorId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    let media: string[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        const user = await this.lock(tx, userId);
        if (user.status === 'DELETED') return;
        media = [user.avatarKey, user.coverKey].filter((k): k is string => !!k);

        const closed = await this.exchange.onUserUnavailable(tx, userId);
        // A Pro subscription stops at once: nobody is billed for an account that is gone.
        await this.billing.onAccountDeleted(tx, userId);
        // What was already in the trash leaves it with the account; the rest follows.
        await tx.video.updateMany({
          where: { authorId: userId, ...IN_USER_TRASH },
          data: { trashExit: 'ACCOUNT_DELETED', trashExitAt: new Date() },
        });
        const authored = await tx.video.findMany({
          where: { authorId: userId, deletedAt: null },
          select: { id: true, authorId: true, title: true, sizeBytes: true },
        });
        await this.videos.softDeleteInTx(
          tx,
          actorId,
          authored,
          'ACCOUNT_DELETED',
        );
        await tx.videoAccess.deleteMany({
          where: { holderId: userId, source: { not: 'AUTHOR' } },
        });
        // Own holdings stay (the admin trash can restore the videos) but lose their categories first:
        // the composite FK does not cascade.
        await tx.videoAccess.updateMany({
          where: { holderId: userId },
          data: { categoryId: null },
        });
        await tx.category.deleteMany({ where: { ownerId: userId } });
        await tx.follow.deleteMany({
          where: { OR: [{ followerId: userId }, { followeeId: userId }] },
        });
        await tx.block.deleteMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        });
        // Their tickets stay for the admins, without the pictures: erased after commit.
        await tx.supportAttachment.deleteMany({
          where: { message: { ticket: { userId } } },
        });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.notificationPreference.deleteMany({ where: { userId } });
        await tx.session.deleteMany({ where: { userId } });
        await tx.emailToken.deleteMany({ where: { userId } });
        await tx.oAuthAccount.deleteMany({ where: { userId } });
        // Unfinished uploads: the expiry sweep aborts the S3 multipart uploads within 15 minutes.
        await tx.uploadSession.updateMany({
          where: { userId, status: 'ACTIVE' },
          data: { expiresAt: new Date() },
        });
        const now = new Date();
        await tx.user.update({
          where: { id: userId },
          data: {
            status: 'DELETED',
            deletedAt: now,
            email: null,
            emailVerifiedAt: null,
            passwordHash: null,
            displayName: '',
            avatarKey: null,
            coverKey: null,
            bio: null,
            accentColor: null,
            coverPattern: null,
            pageSettings: {},
            storageUsedBytes: 0,
            requestHintSeenCount: 0,
            requestHintDismissed: false,
          },
        });
        await this.audit.log(
          {
            actorId,
            action: 'user.delete',
            targetType: 'user',
            targetId: userId,
            meta: {
              username: user.username,
              self: actorId === userId,
              ...(reason ? { reason } : {}),
              videos: authored.length,
              closedRequests: closed,
            },
          },
          tx,
        );
      },
      // An author of thousands of videos is a long transaction: Prisma's 5 s default ended it with
      // an error half-way (account deletion).
      { timeout: 120_000, maxWait: 10_000 },
    );
    await publishSessionsRevoked(this.redis, userId);
    await this.outbox.nudge();
    if (media.length)
      await this.storage
        .deleteObjects('public', media)
        .catch((err: Error) =>
          this.logger.warn(`Profile images of ${userId} stay: ${err.message}`),
        );
    await this.storage
      .deletePrefix('private', supportPrefix(userId))
      .catch((err: Error) =>
        this.logger.warn(`Support pictures of ${userId} stay: ${err.message}`),
      );
  }

  private async lock(tx: Tx, userId: string) {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        status: true,
        role: true,
        avatarKey: true,
        coverKey: true,
      },
    });
    if (!user)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    return user;
  }
}

const gone = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'accountDeleted',
    'errors.account.deleted',
  );

import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Delivery } from '../../infra/outbox/outbox.types.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { anonymousName } from '../anonymous-links/anonymous-link-rules.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { UsersService } from '../users/users.service.js';
import type { BlockedUserDto } from './exchange.dto.js';
import { lockRequests } from './request-locks.js';

/**
 * Blocks: the blocked side can no longer request, follow or
 * message; follows both ways are removed and open requests between the two close at once.
 * The blocked person is not told.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly users: UsersService,
    private readonly anonymous: AnonymousLinksService,
  ) {}

  async isBlockedEither(a: string, b: string): Promise<boolean> {
    const n = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return n > 0;
  }

  async list(userId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
            pageHidden: true,
            status: true,
          },
        },
      },
    });
    return rows.map((r) => ({
      user: {
        id: r.blocked.id,
        username: r.blocked.username,
        displayName: r.blocked.displayName,
        avatarUrl: this.users.mediaUrl(r.blocked.avatarKey),
        pageHidden: r.blocked.pageHidden,
        guest: r.blocked.status === 'GUEST',
        exchangeWants: null,
        exchangeAvoid: null,
      },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Creates the block and closes open requests both ways (idempotent). */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'selfBlock',
        'errors.exchange.selfBlock',
      );
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    await this.prisma.$transaction((tx) =>
      this.blockInTx(tx, blockerId, blockedId),
    );
    await this.outbox.nudge();
  }

  /**
   * The block itself, inside the caller's transaction: from Settings, a profile or a request thread
   * alike (the thread's "Block user" left the follows in place).
   */
  async blockInTx(
    tx: Prisma.TransactionClient,
    blockerId: string,
    blockedId: string,
  ): Promise<void> {
    await tx.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    // A block ends any follow and friendship both ways; unblocking does not restore them.
    await tx.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followeeId: blockedId },
          { followerId: blockedId, followeeId: blockerId },
        ],
      },
    });
    await this.closeRequestsBetween(tx, blockerId, blockedId);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  /**
   * Inside a transaction: every OPEN request between the pair becomes BLOCKED. The blocked side sees
   * its own requests as declined and the other ones as closed by the system.
   */
  async closeRequestsBetween(
    tx: Prisma.TransactionClient,
    blockerId: string,
    blockedId: string,
  ): Promise<number> {
    const pair = {
      OR: [
        { holderId: blockerId, requesterId: blockedId },
        { holderId: blockedId, requesterId: blockerId },
      ],
    };
    const candidates = await tx.videoRequest.findMany({
      where: { status: 'OPEN', ...pair },
      select: { id: true },
    });
    await lockRequests(
      tx,
      candidates.map((c) => c.id),
    );
    const open = await tx.videoRequest.findMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: 'OPEN' },
      include: {
        offers: {
          where: { round: 0 },
          include: {
            // The first requested video (round 0 may carry an offer too).
            items: {
              where: { givingSide: 'HOLDER' },
              take: 1,
              include: { video: { select: { title: true } } },
            },
          },
        },
      },
    });
    if (open.length === 0) return 0;
    const now = new Date();
    const blocker = await tx.user.findUniqueOrThrow({
      where: { id: blockerId },
      select: { displayName: true },
    });
    const names = await this.anonymous.names(
      open.map((r) => r.anonymousLinkId),
    );
    const deliveries: Delivery[] = [];
    for (const r of open) {
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          status: 'BLOCKED',
          awaitingUserId: null,
          resolvedById: blockerId,
          resolvedAt: now,
        },
      });
      if (r.currentOfferId)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'VOID', respondedAt: now },
        });
      const title = r.offers[0]?.items[0]?.video.title ?? '';
      deliveries.push(
        r.requesterId === blockedId
          ? {
              userId: blockedId,
              type: 'REQUEST_DECLINED',
              payload: {
                requestId: r.id,
                // Asked through the blocker's anonymous link: the name they go by there.
                ...(r.anonymousLinkId
                  ? anonymousName(names.get(r.anonymousLinkId))
                  : { fromName: blocker.displayName }),
                comment: null,
                title,
              },
            }
          : {
              userId: blockedId,
              type: 'REQUEST_INVALIDATED',
              payload: { requestId: r.id, reason: 'blocked', title },
            },
      );
    }
    await this.outbox.emit(tx, 'notify', { deliveries });
    return open.length;
  }
}

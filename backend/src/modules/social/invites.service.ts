import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type {
  InviteAcceptDto,
  InviteDto,
  InvitePreviewDto,
  InviterDto,
} from './invites.dto.js';
import { SocialService } from './social.service.js';

/** How long a link works and how many people it serves. */
export const INVITE_TTL_DAYS = 7;
export const INVITE_MAX_USES = 10;

type InviteRow = {
  id: string;
  code: string;
  inviterId: string;
  maxUses: number;
  uses: number;
  expiresAt: Date;
  revokedAt: Date | null;
  inviter: {
    username: string;
    displayName: string;
    avatarKey: string | null;
    status: string;
    pageHidden: boolean;
  };
};

/**
 * Inviting to be friends by a link. Registration stays open (is about
 * invite-only sign-up); this is a shortcut: whoever opens the link becomes the inviter's friend
 * in one click (both follow each other), a newcomer once their email is confirmed.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly social: SocialService,
  ) {}

  /** My link that still works, or a new one. */
  async mine(userId: string): Promise<InviteDto> {
    const current = await this.prisma.friendInvite.findFirst({
      where: {
        inviterId: userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (current && current.uses < current.maxUses) return toDto(current);
    return toDto(await this.create(userId));
  }

  /** A new link; the old ones stop working. */
  async renew(userId: string): Promise<InviteDto> {
    await this.prisma.friendInvite.updateMany({
      where: { inviterId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return toDto(await this.create(userId));
  }

  async preview(code: string): Promise<InvitePreviewDto> {
    const invite = await this.find(code);
    return { inviter: this.inviterOf(invite), state: stateOf(invite) };
  }

  async accept(userId: string, code: string): Promise<InviteAcceptDto> {
    const invite = await this.find(code);
    const inviter = this.inviterOf(invite);
    if (invite.inviterId === userId)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'ownInvite',
        'errors.invites.own',
      );
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, emailVerifiedAt: true, pendingInviteId: true },
    });
    // Taken already, waiting for the confirmed email: taking it again spends nothing more.
    if (!me.emailVerifiedAt && me.pendingInviteId === invite.id)
      return { outcome: 'pending', inviter };
    // Friends already: nothing to spend.
    if (await this.friends(userId, invite.inviterId))
      return { outcome: 'friends', inviter };
    // A block either way refuses it as any follow would, before the link is spent.
    const blocked = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: userId, blockedId: invite.inviterId },
          { blockerId: invite.inviterId, blockedId: userId },
        ],
      },
    });
    if (blocked)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'followNotAllowed',
        'errors.social.followNotAllowed',
      );
    const state = stateOf(invite);
    if (state !== 'valid')
      throw new AppException(
        HttpStatus.GONE,
        state === 'usedUp' ? 'inviteUsedUp' : 'inviteExpired',
        state === 'usedUp' ? 'errors.invites.usedUp' : 'errors.invites.expired',
      );
    const taken = await this.prisma.friendInvite.updateMany({
      where: { id: invite.id, uses: { lt: invite.maxUses } },
      data: { uses: { increment: 1 } },
    });
    if (taken.count === 0)
      throw new AppException(
        HttpStatus.GONE,
        'inviteUsedUp',
        'errors.invites.usedUp',
      );
    if (!me.emailVerifiedAt) {
      // Friendship needs a confirmed email, like any follow: it waits for it.
      await this.prisma.user.update({
        where: { id: userId },
        data: { pendingInviteId: invite.id },
      });
      return { outcome: 'pending', inviter };
    }
    try {
      await this.befriend(
        userId,
        me.username,
        invite.inviterId,
        inviter.username,
      );
    } catch (err) {
      // Not friends after all: the link keeps the use.
      await this.prisma.friendInvite.updateMany({
        where: { id: invite.id, uses: { gt: 0 } },
        data: { uses: { decrement: 1 } },
      });
      throw err;
    }
    return { outcome: 'friends', inviter };
  }

  /** The email is confirmed: an invitation accepted before makes the friendship now. */
  async onVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        pendingInvite: {
          select: {
            inviterId: true,
            inviter: { select: { username: true, status: true } },
          },
        },
      },
    });
    const pending = user?.pendingInvite;
    if (!user || !pending) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingInviteId: null },
    });
    if (pending.inviter.status !== 'ACTIVE') return;
    await this.befriend(
      userId,
      user.username,
      pending.inviterId,
      pending.inviter.username,
    ).catch((err: unknown) =>
      // A block since then, an account gone: the friendship just does not happen.
      this.logger.log(`Invite for ${userId} not applied: ${String(err)}`),
    );
  }

  /** Both follow each other; the usual follow rules (blocks) and notifications apply. */
  private async befriend(
    userId: string,
    username: string,
    inviterId: string,
    inviterUsername: string,
  ): Promise<void> {
    await this.social.follow(userId, inviterUsername, { invited: true });
    await this.social.follow(inviterId, username, { invited: true });
  }

  private async friends(a: string, b: string): Promise<boolean> {
    const n = await this.prisma.follow.count({
      where: {
        OR: [
          { followerId: a, followeeId: b },
          { followerId: b, followeeId: a },
        ],
      },
    });
    return n === 2;
  }

  private async find(code: string): Promise<InviteRow> {
    const invite = await this.prisma.friendInvite.findUnique({
      where: { code },
      include: {
        inviter: {
          select: {
            username: true,
            displayName: true,
            avatarKey: true,
            status: true,
            pageHidden: true,
          },
        },
      },
    });
    if (!invite || invite.inviter.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'inviteNotFound',
        'errors.invites.notFound',
      );
    return invite;
  }

  private inviterOf(invite: InviteRow): InviterDto {
    return {
      username: invite.inviter.username,
      displayName: invite.inviter.displayName,
      avatarUrl: this.users.mediaUrl(invite.inviter.avatarKey),
      pageHidden: invite.inviter.pageHidden,
    };
  }

  private create(userId: string) {
    return this.prisma.friendInvite.create({
      data: {
        inviterId: userId,
        code: randomBytes(9).toString('base64url'),
        maxUses: INVITE_MAX_USES,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    });
  }
}

function stateOf(invite: {
  uses: number;
  maxUses: number;
  expiresAt: Date;
  revokedAt: Date | null;
}): 'valid' | 'expired' | 'usedUp' {
  if (invite.revokedAt || invite.expiresAt <= new Date()) return 'expired';
  return invite.uses >= invite.maxUses ? 'usedUp' : 'valid';
}

function toDto(i: {
  code: string;
  expiresAt: Date;
  maxUses: number;
  uses: number;
}): InviteDto {
  return {
    code: i.code,
    expiresAt: i.expiresAt.toISOString(),
    maxUses: i.maxUses,
    uses: i.uses,
  };
}

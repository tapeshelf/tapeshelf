import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { TwoFactorService } from '../auth/two-factor/two-factor.service.js';
import { BillingService } from '../billing/billing.service.js';
import { canHidePage } from '../access/access-policy.js';
import { effectiveTier } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { UsersService } from '../users/users.service.js';
import { AdminReportsService } from './admin-reports.service.js';
import { USER_REF_SELECT } from './admin-mappers.js';
import type {
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUserRowDto,
  AdminUsersQueryDto,
  UpdateAdminUserDto,
  ViewAsDto,
} from './admin.dto.js';

const ROW_SELECT = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  emailVerifiedAt: true,
  avatarKey: true,
  role: true,
  tier: true,
  tierUntil: true,
  tierSource: true,
  status: true,
  pageHidden: true,
  storageUsedBytes: true,
  createdAt: true,
  lastLoginAt: true,
  _count: { select: { videos: { where: { deletedAt: null } } } },
} satisfies Prisma.UserSelect;

type UserRowData = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

const SORTS: Record<string, Prisma.UserOrderByWithRelationInput[]> = {
  created: [{ id: 'desc' }],
  lastLogin: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  storage: [{ storageUsedBytes: 'desc' }, { id: 'desc' }],
  username: [{ username: 'asc' }],
};

/** Users: search, the account card and every account action. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly plans: PlansService,
    private readonly billing: BillingService,
    private readonly reports: AdminReportsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async list(query: AdminUsersQueryDto): Promise<AdminUserListDto> {
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      // Guests are no accounts: only when asked for.
      ...(query.status
        ? { status: query.status }
        : { status: { not: 'GUEST' } }),
      ...(query.role ? { role: query.role } : {}),
      ...(query.tier ? { tier: query.tier } : {}),
      ...(q
        ? {
            OR: [
              { username: { contains: q.toLowerCase() } },
              { email: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ROW_SELECT,
        orderBy: SORTS[query.sort ?? 'created'],
        skip: query.offset ?? 0,
        take: query.limit ?? 30,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map((u) => this.row(u)), total };
  }

  async detail(id: string): Promise<AdminUserDetailDto> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...ROW_SELECT,
        bio: true,
        bannedAt: true,
        banReason: true,
        deletedAt: true,
        passwordHash: true,
        twoFactorAt: true,
        oauthAccounts: { select: { provider: true } },
      },
    });
    if (!u) throw userNotFound();
    const now = new Date();
    const [
      received,
      followers,
      following,
      openRequests,
      reportsAgainst,
      reportsFiled,
      sessions,
      reports,
      limits,
      subscription,
    ] = await Promise.all([
      this.prisma.videoAccess.count({
        where: {
          holderId: id,
          source: { not: 'AUTHOR' },
          video: { deletedAt: null },
        },
      }),
      this.prisma.follow.count({ where: { followeeId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
      this.prisma.videoRequest.count({
        where: { status: 'OPEN', OR: [{ holderId: id }, { requesterId: id }] },
      }),
      this.prisma.report.count({ where: { targetUserId: id } }),
      this.prisma.report.count({ where: { reporterId: id } }),
      this.prisma.session.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
      }),
      this.reports.list({ userId: id, limit: 10 }),
      this.plans.limitsForUser({ role: u.role, tier: effectiveTier(u) }),
      this.billing.subscriptionOf(id),
    ]);
    return Object.assign(this.row(u), {
      bio: u.bio,
      bannedAt: u.bannedAt?.toISOString() ?? null,
      banReason: u.banReason,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      hasPassword: !!u.passwordHash,
      twoFactor: u.twoFactorAt !== null,
      providers: u.oauthAccounts.map((a) => a.provider),
      quotaBytes: limits.storageQuotaBytes,
      tierUntil:
        this.plans.hasTiers && effectiveTier(u) === 'PREMIUM'
          ? (u.tierUntil?.toISOString() ?? null)
          : null,
      tierSource:
        this.plans.hasTiers && effectiveTier(u) === 'PREMIUM'
          ? u.tierSource
          : null,
      subscription,
      counts: {
        videos: u._count.videos,
        received,
        followers,
        following,
        openRequests,
        reportsAgainst,
        reportsFiled,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
      })),
      reports: reports.items,
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserDetailDto> {
    const u = await this.load(id);
    if (dto.role !== undefined && dto.role !== u.role) {
      if (id === actorId) throw selfAction();
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            role: dto.role,
            // Without the role and without Pro, a hidden page opens.
            ...(!canHidePage(
              { id, role: dto.role!, tier: effectiveTier(u) },
              this.plans.hasTiers,
            )
              ? { pageHidden: false }
              : {}),
          },
        });
        await this.audit.log(
          {
            actorId,
            action: 'user.role',
            targetType: 'user',
            targetId: id,
            meta: { username: u.username, from: u.role, to: dto.role },
          },
          tx,
        );
      });
    }
    if (dto.tier !== undefined || dto.tierUntil !== undefined) {
      // A self-hosted instance has no tiers at all.
      if (!this.plans.hasTiers)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'tiersDisabled',
          'errors.admin.tiersDisabled',
        );
      await this.setTier(actorId, u, dto);
    }
    return this.detail(id);
  }

  async ban(
    actorId: string,
    id: string,
    reason: string,
  ): Promise<AdminUserDetailDto> {
    const u = await this.load(id);
    guardTarget(actorId, u);
    await this.accounts.ban(actorId, id, reason);
    return this.detail(id);
  }

  async unban(actorId: string, id: string): Promise<AdminUserDetailDto> {
    await this.load(id);
    await this.accounts.unban(actorId, id);
    return this.detail(id);
  }

  async delete(
    actorId: string,
    id: string,
    reason?: string,
  ): Promise<AdminUserDetailDto> {
    const u = await this.load(id);
    guardTarget(actorId, u);
    await this.accounts.delete(actorId, id, reason);
    return this.detail(id);
  }

  /** Sends the usual "reset your password" email (the admin never sees or sets passwords). */
  async passwordReset(actorId: string, id: string): Promise<void> {
    const u = await this.load(id);
    if (!u.email || u.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.CONFLICT,
        'noEmail',
        'errors.admin.noEmail',
      );
    await this.auth.forgotPassword(u.email);
    await this.audit.log({
      actorId,
      action: 'user.passwordReset',
      targetType: 'user',
      targetId: id,
      meta: { username: u.username },
    });
  }

  /**
   * A lost phone and lost codes: the owner asked through support, the admin checked and
   * turns the step off; the owner is mailed and may turn it on again. Never one's own.
   */
  async resetTwoFactor(actorId: string, id: string): Promise<void> {
    if (id === actorId) throw selfAction();
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { username: true, status: true, twoFactorAt: true },
    });
    if (!u || u.status === 'DELETED') throw userNotFound();
    if (!u.twoFactorAt)
      throw new AppException(
        HttpStatus.CONFLICT,
        'twoFactorOff',
        'errors.twoFactor.off',
      );
    await this.twoFactor.clear(id, 'reset');
    await this.audit.log({
      actorId,
      action: 'user.twoFactorReset',
      targetType: 'user',
      targetId: id,
      meta: { username: u.username },
    });
  }

  /** ADMIN_NOTICE: in-app, and by email unless the user turned it off. */
  async notice(actorId: string, id: string, message: string): Promise<void> {
    const u = await this.load(id);
    if (u.status === 'DELETED') throw userNotFound();
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          { userId: id, type: 'ADMIN_NOTICE', payload: { message } },
        ],
      });
      await this.audit.log(
        {
          actorId,
          action: 'user.notice',
          targetType: 'user',
          targetId: id,
          meta: { username: u.username, message },
        },
        tx,
      );
    });
    await this.outbox.nudge();
  }

  /** Starts a read-only "view as" session in the browser; only the fact is recorded here. */
  async viewAs(actorId: string, id: string): Promise<ViewAsDto> {
    const u = await this.load(id);
    if (u.status !== 'ACTIVE') throw userNotFound();
    if (id === actorId) throw selfAction();
    await this.audit.log({
      actorId,
      action: 'user.viewAs',
      targetType: 'user',
      targetId: id,
      meta: { username: u.username },
    });
    return { id: u.id, username: u.username };
  }

  /**
   * Tier by hand: PREMIUM with an end date in the future or without one; BASIC drops the
   * date. Any change makes the admin the source and re-arms the reminders about the end.
   */
  private async setTier(
    actorId: string,
    u: Awaited<ReturnType<AdminUsersService['load']>>,
    dto: UpdateAdminUserDto,
  ): Promise<void> {
    const before = effectiveTier(u);
    const tier = dto.tier ?? before;
    let until: Date | null = null;
    if (tier === 'PREMIUM')
      until =
        dto.tierUntil !== undefined
          ? dto.tierUntil
            ? new Date(dto.tierUntil)
            : null
          : before === 'PREMIUM'
            ? u.tierUntil
            : null;
    if (until && until <= new Date())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'tierUntilPast',
        'errors.admin.tierUntilPast',
      );
    const fromUntil = before === 'PREMIUM' ? u.tierUntil : null;
    if (tier === before && until?.getTime() === fromUntil?.getTime()) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          tier,
          tierUntil: until,
          tierSource: tier === 'PREMIUM' ? 'ADMIN' : null,
          tierReminder: null,
          // Without Pro (and not an admin), a hidden page opens.
          ...(tier !== 'PREMIUM' && u.role !== 'ADMIN'
            ? { pageHidden: false }
            : {}),
        },
      });
      await this.audit.log(
        {
          actorId,
          action: 'user.tier',
          targetType: 'user',
          targetId: u.id,
          meta: {
            username: u.username,
            from: before,
            to: tier,
            fromUntil: fromUntil?.toISOString() ?? null,
            until: until?.toISOString() ?? null,
          },
        },
        tx,
      );
    });
  }

  private async load(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_REF_SELECT,
        email: true,
        role: true,
        tier: true,
        tierUntil: true,
      },
    });
    if (!u) throw userNotFound();
    return u;
  }

  private row(u: UserRowData): AdminUserRowDto {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      avatarUrl: this.users.mediaUrl(u.avatarKey),
      role: u.role,
      tier: effectiveTier(u),
      status: u.status,
      pageHidden: u.pageHidden,
      storageUsedBytes: Number(u.storageUsedBytes),
      videoCount: u._count.videos,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    };
  }
}

/** Ban and delete never apply to oneself or to another admin (demote first). */
function guardTarget(actorId: string, u: { id: string; role: string }): void {
  if (u.id === actorId) throw selfAction();
  if (u.role === 'ADMIN')
    throw new AppException(
      HttpStatus.CONFLICT,
      'adminTarget',
      'errors.admin.adminTarget',
    );
}

const selfAction = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'selfAction',
    'errors.admin.selfAction',
  );
const userNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'userNotFound',
    'errors.users.notFound',
  );

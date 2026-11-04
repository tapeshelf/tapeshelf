import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  checkUsername,
  normalizeUsername,
} from '../../common/validation/username.js';
import type { Tier, UserStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  type Viewer,
  canHidePage,
  canMakeAnonymousLinks,
  canProtectLinks,
  pageVisible,
} from '../access/access-policy.js';
import { anonymousHandle } from '../anonymous-links/anonymous-link-rules.js';
import type { MeDto } from '../auth/auth.dto.js';
import { downloadUsage } from '../downloads/downloads.service.js';
import { BillingService } from '../billing/billing.service.js';
import {
  AnonymousLinksService,
  type OpenAnonymousLink,
} from '../anonymous-links/anonymous-links.service.js';
import { effectiveTier } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TrafficService } from '../traffic/traffic.service.js';
import { type PageSettings, pageSettingsFrom } from './page-settings.js';
import type {
  PublicUserDto,
  UpdatePageSettingsDto,
  UpdateProfileDto,
} from './users.dto.js';
import { relationView } from '../social/social-rules.js';
import { relationFacts, socialCounts } from '../social/social.queries.js';

const DAY_MS = 24 * 3600 * 1000;

export interface ResolvedUser {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  coverKey: string | null;
  bio: string | null;
  accentColor: string | null;
  coverPattern: number | null;
  pageSettings: PageSettings;
  /** Hidden by the owner; see pageVisible. */
  pageHidden: boolean;
  createdAt: Date;
  status: UserStatus;
  tier: Tier;
  tierUntil: Date | null;
  /** Exchange preferences: shown in every exchange; on the shelf when showExchangePrefs. */
  exchangeWants: string | null;
  exchangeAvoid: string | null;
  showExchangePrefs: boolean;
  acceptGuestExchanges: boolean;
}

/** A page owner as the API names them: by username, or by an anonymous link (`~<code>`). */
export interface ResolvedHandle {
  user: ResolvedUser;
  /** Reached through this anonymous link: the owner is masked, and their page opens even hidden. */
  link: OpenAnonymousLink | null;
}

const RESOLVED_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
  coverKey: true,
  bio: true,
  accentColor: true,
  coverPattern: true,
  pageSettings: true,
  pageHidden: true,
  createdAt: true,
  status: true,
  tier: true,
  tierUntil: true,
  exchangeWants: true,
  exchangeAvoid: true,
  showExchangePrefs: true,
  acceptGuestExchanges: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly plans: PlansService,
    private readonly billing: BillingService,
    private readonly storage: StorageService,
    private readonly anonymous: AnonymousLinksService,
    private readonly traffic: TrafficService,
  ) {}

  async getMe(userId: string): Promise<MeDto> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        username: true,
        displayName: true,
        avatarKey: true,
        coverKey: true,
        bio: true,
        accentColor: true,
        coverPattern: true,
        pageSettings: true,
        pageHidden: true,
        locale: true,
        theme: true,
        showSensitive: true,
        role: true,
        tier: true,
        tierUntil: true,
        tierSource: true,
        storageUsedBytes: true,
        passwordHash: true,
        twoFactorAt: true,
        exchangeWants: true,
        exchangeAvoid: true,
        showExchangePrefs: true,
        acceptGuestExchanges: true,
        usernameChangedAt: true,
        createdAt: true,
        oauthAccounts: { select: { provider: true } },
      },
    });
    const [plan, downloads, trafficBytes, subscription] = await Promise.all([
      this.plans.planOf(u),
      downloadUsage(this.prisma, u.id),
      this.traffic.usedThisMonth(u.id),
      this.billing.subscriptionOf(u.id),
    ]);
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.mediaUrl(u.avatarKey),
      coverUrl: this.mediaUrl(u.coverKey),
      bio: u.bio,
      accentColor: u.accentColor,
      coverPattern: u.coverPattern,
      pageSettings: pageSettingsFrom(u.pageSettings),
      pageHidden: u.pageHidden,
      canHidePage: canHidePage(
        { id: u.id, role: u.role, tier: plan.tier },
        this.plans.hasTiers,
      ),
      canProtectLinks: canProtectLinks(
        { id: u.id, role: u.role, tier: plan.tier },
        this.plans.hasTiers,
      ),
      canMakeAnonymousLinks: canMakeAnonymousLinks(
        { id: u.id, role: u.role, tier: plan.tier },
        this.plans.hasTiers,
      ),
      locale: u.locale,
      theme: u.theme,
      showSensitive: u.showSensitive,
      role: u.role,
      tier: plan.tier,
      plan: {
        tier: plan.tier,
        until: plan.until?.toISOString() ?? null,
        source: plan.source,
        limits: plan.limits,
        usage: {
          storageBytes: Number(u.storageUsedBytes),
          downloadsThisMonth: downloads.used,
          downloadsResetAt: downloads.resetAt.toISOString(),
          trafficBytesThisMonth: trafficBytes,
        },
        subscription,
      },
      hasPassword: u.passwordHash !== null,
      hasGoogle: u.oauthAccounts.some((a) => a.provider === 'GOOGLE'),
      twoFactor: u.twoFactorAt !== null,
      exchangeWants: u.exchangeWants,
      exchangeAvoid: u.exchangeAvoid,
      showExchangePrefs: u.showExchangePrefs,
      acceptGuestExchanges: u.acceptGuestExchanges,
      usernameChangedAt: u.usernameChangedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  mediaUrl(key: string | null): string | null {
    return key ? this.storage.publicUrl(key) : null;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<MeDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName?.trim(),
        bio: dto.bio === undefined ? undefined : dto.bio.trim() || null,
        exchangeWants:
          dto.exchangeWants === undefined
            ? undefined
            : dto.exchangeWants.trim() || null,
        exchangeAvoid:
          dto.exchangeAvoid === undefined
            ? undefined
            : dto.exchangeAvoid.trim() || null,
        showExchangePrefs: dto.showExchangePrefs,
        acceptGuestExchanges: dto.acceptGuestExchanges,
        locale: dto.locale,
        theme: dto.theme,
        showSensitive: dto.showSensitive,
        accentColor:
          dto.accentColor === undefined
            ? undefined
            : dto.accentColor.toLowerCase() || null,
        coverPattern: dto.coverPattern,
      },
    });
    return this.getMe(userId);
  }

  /**
   * Page look: a partial update merged over the stored settings; and whether
   * the page is hidden at all, which only those who may hide it can switch on.
   */
  async updatePageSettings(
    user: RequestUser,
    dto: UpdatePageSettingsDto,
  ): Promise<MeDto> {
    const userId = user.id;
    if (dto.hidden && !canHidePage(user, this.plans.hasTiers))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'pageHidingNotAllowed',
        'errors.users.pageHidingNotAllowed',
      );
    const stored = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pageSettings: true },
    });
    const next: PageSettings = {
      ...pageSettingsFrom(stored.pageSettings),
      ...(dto.layout ? { layout: dto.layout } : {}),
      ...(dto.tileSize ? { tileSize: dto.tileSize } : {}),
      ...(dto.sort ? { sort: dto.sort } : {}),
      ...(dto.showCover !== undefined ? { showCover: dto.showCover } : {}),
      ...(dto.firstView ? { firstView: dto.firstView } : {}),
      ...(dto.grouping ? { grouping: dto.grouping } : {}),
      ...(dto.categoryRows !== undefined
        ? { categoryRows: dto.categoryRows }
        : {}),
      ...(dto.tileScale ? { tileScale: dto.tileScale } : {}),
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pageSettings: { ...next },
        ...(dto.hidden !== undefined ? { pageHidden: dto.hidden } : {}),
      },
    });
    return this.getMe(userId);
  }

  /** Changes the handle, keeps the old one reserved and redirecting. */
  async changeUsername(userId: string, raw: string): Promise<MeDto> {
    const username = normalizeUsername(raw);
    const problem = checkUsername(username);
    if (problem === 'invalid')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'usernameInvalid',
        'errors.auth.usernameInvalid',
      );
    if (problem === 'reserved')
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'usernameReserved',
        'errors.auth.usernameReserved',
      );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, usernameChangedAt: true },
    });
    if (user.username === username) return this.getMe(userId);
    const minDays = await this.settings.get('usernameChangeDays');
    if (user.usernameChangedAt) {
      const nextAllowed = user.usernameChangedAt.getTime() + minDays * DAY_MS;
      if (nextAllowed > Date.now()) {
        const days = Math.ceil((nextAllowed - Date.now()) / DAY_MS);
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'usernameChangeTooSoon',
          'errors.auth.usernameChangeTooSoon',
          { params: { days, count: days } },
        );
      }
    }
    await this.assertUsernameAvailable(username, userId);
    await this.prisma.$transaction([
      this.prisma.usernameHistory.create({
        data: { username: user.username, userId },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { username, usernameChangedAt: new Date() },
      }),
    ]);
    return this.getMe(userId);
  }

  /** Taken by a current user or by anyone's former name (never reused), unless it is this user's own former name. */
  async assertUsernameAvailable(
    username: string,
    forUserId?: string,
  ): Promise<void> {
    const [current, former] = await Promise.all([
      this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      }),
      this.prisma.usernameHistory.findUnique({
        where: { username },
        select: { userId: true },
      }),
    ]);
    if (current || (former && former.userId !== forUserId)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'usernameTaken',
        'errors.auth.usernameTaken',
      );
    }
  }

  /** Resolves a current or former username to the account (any status). */
  async resolveByUsername(raw: string): Promise<ResolvedUser | null> {
    const username = normalizeUsername(raw);
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: RESOLVED_SELECT,
    });
    const found =
      user ??
      (
        await this.prisma.usernameHistory.findUnique({
          where: { username },
          select: { user: { select: RESOLVED_SELECT } },
        })
      )?.user ??
      null;
    return found
      ? { ...found, pageSettings: pageSettingsFrom(found.pageSettings) }
      : null;
  }

  /**
   * A username or an anonymous link's handle (`~<code>`) to the page owner. Only the calls
   * that may go through an anonymous link take one: following, messages and the like never do.
   */
  async resolveHandle(raw: string): Promise<ResolvedHandle | null> {
    const link = await this.anonymous.resolve(raw);
    if (link) {
      const user = await this.prisma.user.findUnique({
        where: { id: link.ownerId },
        select: RESOLVED_SELECT,
      });
      return user
        ? {
            user: {
              ...user,
              pageSettings: pageSettingsFrom(user.pageSettings),
            },
            link,
          }
        : null;
    }
    const user = await this.resolveByUsername(raw);
    return user ? { user, link: null } : null;
  }

  /**
   * The page owner a handle names, as `viewer` may see them: through an anonymous link the page opens
   * even hidden, its owner active; by name only while visible.
   */
  async pageOwner(raw: string, viewer: Viewer): Promise<ResolvedHandle> {
    const found = await this.resolveHandle(raw);
    if (
      !found ||
      !(found.link
        ? found.user.status === 'ACTIVE'
        : pageVisible(found.user, viewer))
    )
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    return found;
  }

  /**
   * Public profile by current or former username, or by an anonymous link: then without the
   * username, the people around them and the viewer's ties to them. The DTO carries the canonical
   * name for redirects.
   */
  async getPublicProfile(
    raw: string,
    viewer?: RequestUser,
  ): Promise<PublicUserDto> {
    const viewerId = viewer?.id;
    const { user, link } = await this.pageOwner(raw, viewer ?? null);
    const [videoCount, counts, relation] = await Promise.all([
      this.prisma.video.count({
        where: { authorId: user.id, deletedAt: null },
      }),
      link
        ? Promise.resolve({ followers: 0, following: 0, friends: 0 })
        : // Hidden people count for the owner and admins only, as in the lists themselves.
          socialCounts(
            this.prisma,
            user.id,
            viewerId === user.id || viewer?.role === 'ADMIN',
          ),
      viewerId && viewerId !== user.id && !link
        ? relationFacts(this.prisma, viewerId, user.id, true).then(relationView)
        : Promise.resolve(null),
    ]);
    const dto: PublicUserDto = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: this.mediaUrl(user.avatarKey),
      coverUrl: this.mediaUrl(user.coverKey),
      bio: user.bio,
      accentColor: user.accentColor,
      coverPattern: user.coverPattern,
      pageSettings: user.pageSettings,
      videoCount,
      counts,
      relation,
      pro: this.plans.hasTiers && effectiveTier(user) === 'PREMIUM',
      pageHidden: user.pageHidden,
      exchangeWants: user.showExchangePrefs ? user.exchangeWants : null,
      exchangeAvoid: user.showExchangePrefs ? user.exchangeAvoid : null,
      createdAt: user.createdAt.toISOString(),
    };
    if (link) {
      // Through the link it is the link's page: never the owner's name, even to themselves.
      dto.username = anonymousHandle(link.code);
      dto.displayName = link.name;
      dto.pageHidden = false;
    }
    return dto;
  }
}

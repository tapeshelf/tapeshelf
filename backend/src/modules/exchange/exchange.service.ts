import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  ExchangeOffer,
  ExchangeOfferItem,
  Prisma,
} from '../../generated/prisma/client.js';
import type {
  RequestStatus,
  UserStatus,
} from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Delivery } from '../../infra/outbox/outbox.types.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { pageVisible } from '../access/access-policy.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import type { Masker } from '../anonymous-links/masker.js';
import { videoCard } from '../collection/video-card.js';
import { effectiveTier } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { BlocksService } from './blocks.service.js';
import {
  GUEST_DEAL_TTL_MS,
  GuestEscrowService,
} from '../deals/guest-escrow.service.js';
import { isLockNotAvailable, lockRequests, quoteOf } from './request-locks.js';
import {
  type AdminRequestDto,
  type AdminRequestListDto,
  type CounterOfferDto,
  type CreateRequestDto,
  type CreateRequestResultDto,
  type DealDto,
  type ExchangeListQueryDto,
  type ExchangeSummaryDto,
  type HintStateDto,
  MAX_VIDEOS_PER_REQUEST,
  type OfferDto,
  type OfferOptionsDto,
  type OfferableDto,
  type OfferVideoDto,
  type RequestDetailDto,
  type RequestListDto,
  type RequestStateDto,
  type RequestSummaryDto,
  type RequestUserDto,
  type SkipReason,
} from './exchange.dto.js';
import {
  type RequestAction,
  type RuleOffer,
  actionsFor,
  canDo,
  lossOutcome,
  splitItems,
  validateOfferShape,
} from './exchange-rules.js';

const DEFAULT_PAGE = 30;
const DAY_MS = 24 * 3600 * 1000;

type Tx = Prisma.TransactionClient;

const requestInclude = {
  offers: {
    // Creation order (uuid v7): round numbers are not unique once a lost video reset the request.
    orderBy: { id: 'asc' as const },
    include: {
      items: {
        include: {
          video: {
            include: {
              author: {
                select: { id: true, username: true, displayName: true },
              },
            },
          },
        },
      },
    },
  },
  holder: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarKey: true,
      pageHidden: true,
      status: true,
      exchangeWants: true,
      exchangeAvoid: true,
    },
  },
  requester: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarKey: true,
      pageHidden: true,
      status: true,
      exchangeWants: true,
      exchangeAvoid: true,
    },
  },
  anonymousLink: { select: { id: true, note: true } },
} satisfies Prisma.VideoRequestInclude;

type LoadedRequest = Prisma.VideoRequestGetPayload<{
  include: typeof requestInclude;
}>;
type LoadedOffer = LoadedRequest['offers'][number];

interface UserRef {
  id: string;
  username: string;
  displayName: string;
  /** Known to the other side by an anonymous link: `displayName` is the link's name. */
  anonymous?: boolean;
  avatarKey: string | null;
  pageHidden: boolean;
  status: UserStatus;
  exchangeWants: string | null;
  exchangeAvoid: string | null;
}

/**
 * How an answer about requests masks people: the masker, and the anonymous link each giving
 * side's copy of a video came through (`${holderId}:${videoId}`).
 */
interface Masks {
  masker: Masker;
  links: Map<string, string | null>;
}

/** An admin sees through every mask. */
const ADMIN_VIEW = { id: '', role: 'ADMIN' } as const;

/** A party's name in a notification; a guest's is "Guest" in the reader's language. */
function nameOf(u: {
  displayName: string;
  status: UserStatus;
  anonymous?: boolean;
}) {
  return u.status === 'GUEST'
    ? { fromName: '', guest: true as const }
    : { fromName: u.displayName, ...anonymousMark(u) };
}

/** Known by an anonymous link without a name of its own: "Anonymous" in the reader's language. */
function anonymousMark(u: { displayName: string; anonymous?: boolean }) {
  return u.anonymous && !u.displayName ? { anonymous: true as const } : {};
}

/**
 * Requests, negotiation and exchange. Every command runs in a
 * transaction that locks the request row; side effects go through the outbox.
 */
@Injectable()
export class ExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
    private readonly plans: PlansService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly blocks: BlocksService,
    private readonly escrow: GuestEscrowService,
    private readonly anonymous: AnonymousLinksService,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async summary(userId: string): Promise<ExchangeSummaryDto> {
    const [awaitingMe, outgoing] = await Promise.all([
      this.prisma.videoRequest.count({
        where: { awaitingUserId: userId, status: 'OPEN' },
      }),
      this.prisma.videoRequest.count({
        where: { requesterId: userId, status: 'OPEN' },
      }),
    ]);
    return { awaitingMe, outgoing };
  }

  async list(
    userId: string,
    query: ExchangeListQueryDto,
  ): Promise<RequestListDto> {
    const limit = query.limit ?? DEFAULT_PAGE;
    const where: Prisma.VideoRequestWhereInput =
      query.tab === 'incoming'
        ? { holderId: userId, status: 'OPEN' }
        : query.tab === 'outgoing'
          ? { requesterId: userId, status: 'OPEN' }
          : {
              // A guest's draft never reached the holder: nobody's history.
              status: { notIn: ['OPEN', 'DRAFT'] },
              OR: [{ holderId: userId }, { requesterId: userId }],
            };
    const rows = await this.prisma.videoRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const masks = await this.masks(userId, page);
    const items = page.map((r) => this.toSummary(r, userId, masks));
    await masks.masker.apply();
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
    };
  }

  async detail(userId: string, id: string): Promise<RequestDetailDto> {
    const r = await this.loadForParty(this.prisma, userId, id);
    const masks = await this.masks(userId, [r]);
    const dto = this.toDetail(r, userId, masks);
    await masks.masker.apply();
    return dto;
  }

  /** What each side may put into a counter-offer. */
  async options(userId: string, id: string): Promise<OfferOptionsDto> {
    const r = await this.loadForParty(this.prisma, userId, id);
    const otherId = r.holderId === userId ? r.requesterId : r.holderId;
    // A guest's side is what they uploaded for this very deal.
    const guestDeal = r.requester.status === 'GUEST' ? r.id : undefined;
    const masker = this.anonymous.masker({ id: userId, role: 'USER' });
    const [theirs, mine, categories] = await Promise.all([
      this.offerable(
        otherId,
        userId,
        true,
        otherId === r.requesterId ? guestDeal : undefined,
        // The holder asked through their anonymous link stays masked in what they offer.
        { masker, context: otherId === r.holderId ? r.anonymousLinkId : null },
      ),
      this.offerable(
        userId,
        otherId,
        false,
        userId === r.requesterId ? guestDeal : undefined,
        { masker },
      ),
      this.prisma.category.findMany({
        where: { ownerId: { in: [otherId, userId] } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, ownerId: true, hidden: true },
      }),
    ]);
    // The other side's hidden categories stay hidden: their videos show under "all" only.
    const hiddenTheirs = new Set(
      categories
        .filter((c) => c.ownerId === otherId && c.hidden)
        .map((c) => c.id),
    );
    for (const v of theirs)
      if (v.categoryId && hiddenTheirs.has(v.categoryId)) v.categoryId = null;
    await masker.apply();
    const used = (list: OfferVideoDto[], ownerId: string) => {
      const ids = new Set(list.map((v) => v.categoryId));
      return categories
        .filter((c) => c.ownerId === ownerId && ids.has(c.id))
        .map((c) => ({ id: c.id, name: c.name }));
    };
    return {
      theirs,
      mine,
      theirCategories: used(theirs, otherId),
      myCategories: used(mine, userId),
    };
  }

  /** My videos that may go into an offer to `username` before a request exists. */
  async offerableTo(
    user: RequestUser,
    username: string,
  ): Promise<OfferableDto> {
    const userId = user.id;
    const found = await this.users.resolveHandle(username);
    const holder = found?.user;
    if (
      !holder ||
      !(found.link ? holder.status === 'ACTIVE' : pageVisible(holder, user)) ||
      holder.id === userId
    )
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    const masker = this.anonymous.masker(user);
    const [mine, categories] = await Promise.all([
      this.offerable(userId, holder.id, false, undefined, { masker }),
      this.prisma.category.findMany({
        where: { ownerId: userId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);
    await masker.apply();
    const used = new Set(mine.map((v) => v.categoryId));
    return { mine, myCategories: categories.filter((c) => used.has(c.id)) };
  }

  /** Dynamic part of `canRequest` for the video page (button states). */
  async requestState(
    viewerId: string,
    holderId: string,
    videoId: string,
  ): Promise<RequestStateDto> {
    const [open, cooldown, blocked, used, limit] = await Promise.all([
      this.openRequestsFor(this.prisma, viewerId, [videoId]),
      this.prisma.requestCooldown.findUnique({
        where: { requesterId_videoId: { requesterId: viewerId, videoId } },
      }),
      this.blocks.isBlockedEither(viewerId, holderId),
      this.requestedToday(this.prisma, viewerId),
      this.dailyLimit(viewerId),
    ]);
    const now = new Date();
    return {
      openRequestId: open.get(videoId) ?? null,
      cooldownUntil:
        cooldown && cooldown.until > now ? cooldown.until.toISOString() : null,
      blocked,
      limitReached: used >= limit,
      limitFreesAt: await this.limitFreesAt(viewerId, used, limit),
    };
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Round 0: only videos that pass every check stay in the request. */
  async create(
    user: RequestUser,
    dto: CreateRequestDto,
  ): Promise<CreateRequestResultDto> {
    // By name, or through the holder's anonymous link: then the page opens even hidden.
    const found = await this.users.resolveHandle(dto.holderUsername);
    const holder = found?.user;
    const anonymousLink = found?.link ?? null;
    if (
      !holder ||
      !(anonymousLink ? holder.status === 'ACTIVE' : pageVisible(holder, user))
    )
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    if (holder.id === user.id)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'selfRequest',
        'errors.exchange.selfRequest',
      );
    if (await this.blocks.isBlockedEither(user.id, holder.id))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'blocked',
        'errors.exchange.blocked',
      );
    const ids = [...new Set(dto.videoIds)];
    // Started from the holder's exchange link: remembered with the request.
    const link = dto.exchangeLink
      ? await this.prisma.exchangeLink.findFirst({
          where: {
            code: dto.exchangeLink,
            ownerId: holder.id,
            revokedAt: null,
          },
          select: { id: true },
        })
      : null;
    // What the requester offers in return from the start: own, offerable, not asked for.
    const offered = [...new Set(dto.offerVideoIds ?? [])];
    if (offered.some((id) => ids.includes(id))) throw invalidOffer();
    const limit = await this.dailyLimit(user.id);

    const requestId = await this.prisma.$transaction(async (tx) => {
      // Serializes this requester's creations: open-request and daily-limit checks cannot race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const [holdings, viewerHoldings, open, cooldowns, used] =
        await Promise.all([
          tx.videoAccess.findMany({
            where: { holderId: holder.id, videoId: { in: ids } },
            include: {
              video: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  deletedAt: true,
                  visibility: true,
                },
              },
            },
          }),
          tx.videoAccess.findMany({
            where: { holderId: user.id, videoId: { in: ids } },
            select: { videoId: true },
          }),
          this.openRequestsFor(tx, user.id, ids),
          tx.requestCooldown.findMany({
            where: {
              requesterId: user.id,
              videoId: { in: ids },
              until: { gt: new Date() },
            },
            select: { videoId: true },
          }),
          this.requestedToday(tx, user.id),
        ]);
      const byVideo = new Map(holdings.map((h) => [h.videoId, h]));
      const viewerHas = new Set(viewerHoldings.map((h) => h.videoId));
      const cooling = new Set(cooldowns.map((c) => c.videoId));
      let left = Math.max(0, limit - used);
      const accepted: { id: string; title: string }[] = [];
      const skipped: { videoId: string; reason: SkipReason }[] = [];
      for (const id of ids) {
        const h = byVideo.get(id);
        const reason: SkipReason | null =
          !h || h.video.deletedAt
            ? 'notFound'
            : h.source === 'PUBLIC_ADD' ||
                h.hidden ||
                h.video.status !== 'READY'
              ? 'notRequestable'
              : viewerHas.has(id) || h.video.visibility === 'PUBLIC'
                ? 'alreadyWatchable'
                : open.has(id)
                  ? 'alreadyRequested'
                  : cooling.has(id)
                    ? 'cooldown'
                    : left <= 0
                      ? 'limit'
                      : null;
        if (reason) skipped.push({ videoId: id, reason });
        else {
          accepted.push({ id, title: h!.video.title });
          left--;
        }
      }
      if (accepted.length === 0)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'nothingToRequest',
          'errors.exchange.nothingToRequest',
          { details: skipped },
        );
      if (
        offered.length &&
        (accepted.length + offered.length > MAX_VIDEOS_PER_REQUEST ||
          !(await this.allOfferable(tx, user.id, holder.id, offered)))
      )
        throw invalidOffer();
      const message = dto.message?.trim() || null;
      const request = await tx.videoRequest.create({
        data: {
          requesterId: user.id,
          holderId: holder.id,
          message,
          awaitingUserId: holder.id,
          exchangeLinkId: link?.id ?? null,
          anonymousLinkId: anonymousLink?.id ?? null,
        },
      });
      const offer = await tx.exchangeOffer.create({
        data: {
          requestId: request.id,
          round: 0,
          proposedById: user.id,
          message,
          items: {
            create: [
              ...accepted.map((v) => ({
                videoId: v.id,
                givingSide: 'HOLDER' as const,
              })),
              ...offered.map((videoId) => ({
                videoId,
                givingSide: 'REQUESTER' as const,
              })),
            ],
          },
        },
      });
      await tx.videoRequest.update({
        where: { id: request.id },
        data: { currentOfferId: offer.id },
      });
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { displayName: true, username: true },
      });
      await this.outbox.emit(tx, 'notify', {
        deliveries: [
          {
            userId: holder.id,
            type: 'REQUEST_RECEIVED',
            payload: {
              requestId: request.id,
              fromName: me.displayName,
              fromUsername: me.username,
              count: accepted.length,
              title: accepted[0]!.title,
              message: quoteOf(message),
              // An offer from the start: the bell says how much is offered in return.
              ...(offered.length ? { offered: offered.length } : {}),
            },
          },
        ],
      });
      return { id: request.id, skipped };
    });
    await this.outbox.nudge();
    const detail = await this.detail(user.id, requestId.id);
    return { request: detail, skipped: requestId.skipped };
  }

  /** Holder gives the requested videos for free: SHARE holdings, request ACCEPTED. */
  async share(user: RequestUser, id: string): Promise<RequestDetailDto> {
    await this.command(user.id, id, 'share', async (tx, r) => {
      const round0 = r.offers.find((o) => o.round === 0)!;
      const give = splitItems(round0.items).holderGives;
      const lost = await this.lostVideos(tx, r, round0);
      if (lost.size) throw new OfferLost(lost);
      const passed = await this.passedOn(tx, r, r.holderId, give);
      await tx.videoAccess.createMany({
        data: give.map((videoId) => ({
          videoId,
          holderId: r.requesterId,
          source: 'SHARE' as const,
          grantedById: r.holderId,
          requestId: r.id,
          unseen: true,
          anonymousLinkId: passed.get(videoId) ?? null,
        })),
        skipDuplicates: true,
      });
      const now = new Date();
      await tx.exchangeOffer.update({
        where: { id: round0.id },
        data: { status: 'ACCEPTED', respondedAt: now },
      });
      if (r.currentOfferId && r.currentOfferId !== round0.id)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'SUPERSEDED', respondedAt: now },
        });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          status: 'ACCEPTED',
          awaitingUserId: null,
          resolvedById: user.id,
          resolvedAt: now,
          currentOfferId: round0.id,
        },
      });
      await this.notify(tx, [
        {
          userId: r.requesterId,
          type: 'REQUEST_SHARED',
          payload: {
            requestId: r.id,
            ...nameOf(r.holder),
            count: give.length,
            title: requestedTitle(round0),
          },
        },
      ]);
    });
    return this.detail(user.id, id);
  }

  /** Holder blocks the requester: Block row, every open request between them closes. */
  async block(user: RequestUser, id: string): Promise<RequestDetailDto> {
    await this.command(user.id, id, 'block', (tx, r) =>
      this.blocks.blockInTx(tx, user.id, r.requesterId),
    );
    return this.detail(user.id, id);
  }

  /** The awaiting side accepts the current offer; a stale offerId is a 409. */
  async accept(
    user: RequestUser,
    id: string,
    offerId: string,
  ): Promise<RequestDetailDto> {
    try {
      await this.acceptOnce(user, id, offerId);
    } catch (err) {
      // A retry of an accept that went through (the answer was lost on the way): the same result.
      if (!(await this.acceptedBy(user.id, id, offerId))) throw err;
    }
    return this.detail(user.id, id);
  }

  private async acceptedBy(
    userId: string,
    id: string,
    offerId: string,
  ): Promise<boolean> {
    const r = await this.prisma.videoRequest.findUnique({
      where: { id },
      select: { status: true, currentOfferId: true, resolvedById: true },
    });
    return (
      r?.status === 'ACCEPTED' &&
      r.currentOfferId === offerId &&
      r.resolvedById === userId
    );
  }

  private async acceptOnce(
    user: RequestUser,
    id: string,
    offerId: string,
  ): Promise<void> {
    await this.command(user.id, id, 'accept', async (tx, r) => {
      if (r.currentOfferId !== offerId) throw offerChanged();
      const offer = r.offers.find((o) => o.id === offerId)!;
      const lost = await this.lostVideos(tx, r, offer);
      if (lost.size) throw new OfferLost(lost);
      if (await this.blocks.isBlockedEither(r.holderId, r.requesterId))
        throw offerChanged();
      const give = splitItems(offer.items);
      // Round 0 is a gift unless the requester offered something from the start.
      const exchange = offer.round > 0 || give.requesterGives.length > 0;
      const source = exchange ? ('EXCHANGE' as const) : ('SHARE' as const);
      const [fromHolder, fromRequester] = await Promise.all([
        this.passedOn(tx, r, r.holderId, give.holderGives),
        this.passedOn(tx, r, r.requesterId, give.requesterGives),
      ]);
      await tx.videoAccess.createMany({
        data: [
          ...give.holderGives.map((videoId) => ({
            videoId,
            holderId: r.requesterId,
            source,
            grantedById: r.holderId,
            requestId: r.id,
            unseen: true,
            anonymousLinkId: fromHolder.get(videoId) ?? null,
          })),
          ...give.requesterGives.map((videoId) => ({
            videoId,
            holderId: r.holderId,
            source: 'EXCHANGE' as const,
            grantedById: r.requesterId,
            requestId: r.id,
            unseen: true,
            anonymousLinkId: fromRequester.get(videoId) ?? null,
          })),
        ],
        skipDuplicates: true,
      });
      const now = new Date();
      await tx.exchangeOffer.update({
        where: { id: offer.id },
        data: { status: 'ACCEPTED', respondedAt: now },
      });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          status: 'ACCEPTED',
          awaitingUserId: null,
          resolvedById: user.id,
          resolvedAt: now,
        },
      });
      const title = requestedTitle(r.offers.find((o) => o.round === 0));
      await this.notify(
        tx,
        !exchange
          ? [
              {
                userId: r.requesterId,
                type: 'REQUEST_SHARED',
                payload: {
                  requestId: r.id,
                  ...nameOf(r.holder),
                  count: give.holderGives.length,
                  title,
                },
              },
            ]
          : [
              {
                userId: r.requesterId,
                type: 'EXCHANGE_COMPLETED',
                payload: {
                  requestId: r.id,
                  withName: r.holder.displayName,
                  ...anonymousMark(r.holder),
                  received: give.holderGives.length,
                  given: give.requesterGives.length,
                },
              },
              {
                userId: r.holderId,
                type: 'EXCHANGE_COMPLETED',
                payload: {
                  requestId: r.id,
                  withName: r.requester.displayName,
                  ...(r.requester.status === 'GUEST' ? { guest: true } : {}),
                  received: give.requesterGives.length,
                  given: give.holderGives.length,
                },
              },
            ],
      );
    });
  }

  /** The awaiting side declines; the requester gets a cooldown on every requested video. */
  async decline(
    user: RequestUser,
    id: string,
    comment: string | undefined,
  ): Promise<RequestDetailDto> {
    await this.command(user.id, id, 'decline', async (tx, r) => {
      const now = new Date();
      const days = await this.settings.get('requestCooldownDays');
      const until = new Date(now.getTime() + days * DAY_MS);
      const round0 = r.offers.find((o) => o.round === 0)!;
      const text = comment?.trim() || null;
      if (r.currentOfferId)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'DECLINED', respondedAt: now },
        });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          status: 'DECLINED',
          awaitingUserId: null,
          resolvedById: user.id,
          resolvedAt: now,
          declineComment: text,
        },
      });
      for (const videoId of splitItems(round0.items).holderGives)
        await tx.requestCooldown.upsert({
          where: {
            requesterId_videoId: { requesterId: r.requesterId, videoId },
          },
          create: { requesterId: r.requesterId, videoId, until },
          update: { until },
        });
      const other = user.id === r.holderId ? r.requester : r.holder;
      const me = user.id === r.holderId ? r.holder : r.requester;
      await this.notify(tx, [
        {
          userId: other.id,
          type: 'REQUEST_DECLINED',
          payload: {
            requestId: r.id,
            ...nameOf(me),
            comment: text,
            title: requestedTitle(round0),
            // The cooldown is the requester's: they learn when to ask again.
            ...(other.id === r.requesterId && days > 0
              ? { cooldownDays: days }
              : {}),
          },
        },
      ]);
    });
    return this.detail(user.id, id);
  }

  /** The awaiting side proposes its own offer: a new round, the other side must answer. */
  async counter(
    user: RequestUser,
    id: string,
    dto: CounterOfferDto,
  ): Promise<RequestDetailDto> {
    await this.command(user.id, id, 'counter', async (tx, r) => {
      const draft = {
        holderGives: [...new Set(dto.holderGives)],
        requesterGives: [...new Set(dto.requesterGives)],
      };
      // Never a round number used before (a lost video resets the request to round 0).
      const round = Math.max(r.round, ...r.offers.map((o) => o.round)) + 1;
      const problem = validateOfferShape(draft, round, MAX_VIDEOS_PER_REQUEST);
      if (problem) throw invalidOffer();
      const guestDeal = r.requester.status === 'GUEST' ? r.id : undefined;
      const ok =
        (await this.allOfferable(
          tx,
          r.holderId,
          r.requesterId,
          draft.holderGives,
          user.id !== r.holderId,
        )) &&
        (await this.allOfferable(
          tx,
          r.requesterId,
          r.holderId,
          draft.requesterGives,
          user.id !== r.requesterId,
          guestDeal,
        ));
      if (!ok) throw invalidOffer();
      const now = new Date();
      if (r.currentOfferId)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'SUPERSEDED', respondedAt: now },
        });
      const offer = await tx.exchangeOffer.create({
        data: {
          requestId: r.id,
          round,
          proposedById: user.id,
          message: dto.message?.trim() || null,
          items: {
            create: [
              ...draft.holderGives.map((videoId) => ({
                videoId,
                givingSide: 'HOLDER' as const,
              })),
              ...draft.requesterGives.map((videoId) => ({
                videoId,
                givingSide: 'REQUESTER' as const,
              })),
            ],
          },
        },
      });
      const otherId = user.id === r.holderId ? r.requesterId : r.holderId;
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          round,
          currentOfferId: offer.id,
          awaitingUserId: otherId,
          resetAt: null,
          // A deal with a guest: each round gives it three more days.
          ...(r.expiresAt
            ? { expiresAt: new Date(now.getTime() + GUEST_DEAL_TTL_MS) }
            : {}),
        },
      });
      const me = user.id === r.holderId ? r.holder : r.requester;
      // What is offered and for what, from the proposer's side: the first title of each.
      const gives =
        user.id === r.holderId ? draft.holderGives : draft.requesterGives;
      const wants =
        user.id === r.holderId ? draft.requesterGives : draft.holderGives;
      const titles = new Map(
        (
          await tx.video.findMany({
            where: { id: { in: [gives[0]!, wants[0]!] } },
            select: { id: true, title: true },
          })
        ).map((v) => [v.id, v.title]),
      );
      await this.notify(tx, [
        {
          userId: otherId,
          type: 'OFFER_RECEIVED',
          payload: {
            requestId: r.id,
            ...nameOf(me),
            round,
            message: quoteOf(dto.message),
            gives: titles.get(gives[0]!) ?? '',
            givesMore: gives.length - 1,
            wants: titles.get(wants[0]!) ?? '',
            wantsMore: wants.length - 1,
          },
        },
      ]);
    });
    return this.detail(user.id, id);
  }

  /** The requester withdraws: no cooldown, but the day's allowance is spent. */
  async cancel(user: RequestUser, id: string): Promise<RequestDetailDto> {
    await this.command(user.id, id, 'cancel', async (tx, r) => {
      const now = new Date();
      if (r.currentOfferId)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'VOID', respondedAt: now },
        });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          status: 'CANCELLED',
          awaitingUserId: null,
          resolvedById: user.id,
          resolvedAt: now,
        },
      });
      const round0 = r.offers.find((o) => o.round === 0)!;
      await this.notify(tx, [
        {
          userId: r.holderId,
          type: 'REQUEST_CANCELLED',
          payload: {
            requestId: r.id,
            ...nameOf(r.requester),
            title: requestedTitle(round0),
          },
        },
      ]);
    });
    return this.detail(user.id, id);
  }

  // ---------------------------------------------------------------------------
  // Hint
  // ---------------------------------------------------------------------------

  async hint(userId: string): Promise<HintStateDto> {
    const [u, minShows, holdings] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { requestHintSeenCount: true, requestHintDismissed: true },
      }),
      this.settings.get('requestHintMinShows'),
      // What could be offered in return: bookmarks of public videos cannot, so a shelf of
      // bookmarks only still gets the tip.
      // Only whether there is one: counting them all read the whole shelf.
      this.prisma.videoAccess.findFirst({
        where: {
          holderId: userId,
          source: { not: 'PUBLIC_ADD' },
          video: { deletedAt: null, status: 'READY' },
        },
        select: { id: true },
      }),
    ]);
    return {
      seenCount: u.requestHintSeenCount,
      dismissed: u.requestHintDismissed,
      minShows,
      collectionEmpty: holdings === null,
    };
  }

  async hintSeen(userId: string): Promise<HintStateDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { requestHintSeenCount: { increment: 1 } },
    });
    return this.hint(userId);
  }

  async hintDismiss(userId: string): Promise<HintStateDto> {
    const state = await this.hint(userId);
    if (state.seenCount < state.minShows)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'hintTooEarly',
        'errors.exchange.hintTooEarly',
      );
    await this.prisma.user.update({
      where: { id: userId },
      data: { requestHintDismissed: true },
    });
    state.dismissed = true;
    return state;
  }

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  /** Inside the deletion transaction: open requests touching the videos are reset or closed. */
  async onVideosUnavailable(tx: Tx, videoIds: string[]): Promise<void> {
    if (videoIds.length === 0) return;
    const touched = await tx.exchangeOfferItem.findMany({
      where: {
        videoId: { in: videoIds },
        offer: { request: { status: 'OPEN' } },
      },
      select: { offer: { select: { requestId: true } } },
    });
    const requestIds = [...new Set(touched.map((t) => t.offer.requestId))];
    await lockRequests(tx, requestIds);
    const lost = new Set(videoIds);
    for (const id of requestIds) {
      const r = await tx.videoRequest.findUnique({
        where: { id },
        include: requestInclude,
      });
      if (r && r.status === 'OPEN') await this.applyLoss(tx, r, lost);
    }
  }

  /**
   * Inside the ban / account deletion transaction: every OPEN request the user takes
   * part in closes as INVALIDATED and the other side is told; the user themself gets nothing.
   */
  async onUserUnavailable(tx: Tx, userId: string): Promise<number> {
    const candidates = await tx.videoRequest.findMany({
      where: {
        status: 'OPEN',
        OR: [{ holderId: userId }, { requesterId: userId }],
      },
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
    for (const r of open) {
      await tx.videoRequest.update({
        where: { id: r.id },
        data: { status: 'INVALIDATED', awaitingUserId: null, resolvedAt: now },
      });
      if (r.currentOfferId)
        await tx.exchangeOffer.update({
          where: { id: r.currentOfferId },
          data: { status: 'VOID', respondedAt: now },
        });
    }
    await this.notify(
      tx,
      open.map((r) => ({
        userId: r.holderId === userId ? r.requesterId : r.holderId,
        type: 'REQUEST_INVALIDATED' as const,
        payload: {
          requestId: r.id,
          reason: 'accountClosed',
          title: r.offers[0]?.items[0]?.video.title ?? '',
        },
      })),
    );
    return open.length;
  }

  // ---------------------------------------------------------------------------
  // Admin (read-only)
  // ---------------------------------------------------------------------------

  /** Every request, newest first (admin "Requests"). */
  async adminList(query: {
    status?: RequestStatus;
    q?: string;
    offset: number;
    limit: number;
  }): Promise<AdminRequestListDto> {
    const q = query.q?.trim().toLowerCase();
    const where: Prisma.VideoRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { holder: { username: { contains: q } } },
              { requester: { username: { contains: q } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.videoRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { id: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.videoRequest.count({ where }),
    ]);
    return { items: rows.map((r) => this.toAdmin(r)), total };
  }

  /** The thread as the parties see it, but with the real status and no actions. */
  async adminDetail(id: string): Promise<AdminRequestDto> {
    const r = await this.prisma.videoRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!r) throw notFound();
    return this.toAdmin(r);
  }

  private toAdmin(r: LoadedRequest): AdminRequestDto {
    const masks: Masks = {
      masker: this.anonymous.masker(ADMIN_VIEW),
      links: new Map(),
    };
    return Object.assign(this.toDetail(r, r.holderId, masks), {
      status: r.status,
      awaitingMe: false,
      actions: [],
      awaitingUserId: r.awaitingUserId,
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Locks the request row, checks the actor may do `action`, runs the change, nudges the outbox.
   * When the change finds a video gone (OfferLost), the transaction rolls back and the loss is
   * recorded in a transaction of its own before the caller gets a 409.
   */
  private async command(
    userId: string,
    id: string,
    action: RequestAction,
    fn: (tx: Tx, r: LoadedRequest) => Promise<void>,
  ): Promise<void> {
    let guest = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "VideoRequest" WHERE id = ${id}::uuid FOR UPDATE`;
        const r = await this.loadForParty(tx, userId, id);
        await this.maskHolder(r);
        if (!canDo(r, userId, action))
          throw new AppException(
            HttpStatus.CONFLICT,
            'notAllowed',
            'errors.exchange.notAllowed',
          );
        await fn(tx, r);
        guest = r.requester.status === 'GUEST';
      });
    } catch (err) {
      if (!(err instanceof OfferLost)) throw err;
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "VideoRequest" WHERE id = ${id}::uuid FOR UPDATE`;
        const r = await this.loadForParty(tx, userId, id);
        if (r.status === 'OPEN') await this.applyLoss(tx, r, err.lost);
      });
      await this.outbox.nudge();
      throw offerChanged();
    }
    await this.outbox.nudge();
    // A deal with a guest that ended lets go of their uploads at once.
    if (guest) await this.escrow.settle(id);
  }

  /**
   * Asked through the holder's anonymous link, the holder's name in what is written to the
   * requester is the one they go by there.
   */
  private async maskHolder(r: LoadedRequest): Promise<void> {
    if (!r.anonymousLinkId) return;
    const names = await this.anonymous.names([r.anonymousLinkId]);
    r.holder = {
      ...r.holder,
      displayName: names.get(r.anonymousLinkId) ?? '',
      anonymous: true,
    } as LoadedRequest['holder'];
  }

  private async loadForParty(
    tx: Tx | PrismaService,
    userId: string,
    id: string,
  ): Promise<LoadedRequest> {
    const r = await tx.videoRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!r || (r.holderId !== userId && r.requesterId !== userId))
      throw notFound();
    return r;
  }

  /**
   * The anonymous link each video given by `giverId` carries on to its new holder: the one
   * its author already goes by in the giver's copy, or the request's own when the holder asked through
   * it gives their own video.
   */
  private passedOn(
    tx: Tx,
    r: LoadedRequest,
    giverId: string,
    videoIds: string[],
  ): Promise<Map<string, string | null>> {
    return this.anonymous.passedOn(
      tx,
      giverId,
      videoIds,
      r.anonymousLinkId && giverId === r.holderId
        ? { id: r.anonymousLinkId, ownerId: r.holderId }
        : null,
    );
  }

  /** What masks the requests `userId` is shown: the links the videos of their offers came through. */
  private async masks(userId: string, rows: LoadedRequest[]): Promise<Masks> {
    const masker = this.anonymous.masker({ id: userId, role: 'USER' });
    const holders = new Set<string>();
    const videos = new Set<string>();
    for (const r of rows) {
      holders.add(r.holderId).add(r.requesterId);
      for (const o of r.offers) for (const i of o.items) videos.add(i.videoId);
    }
    const held = videos.size
      ? await this.prisma.videoAccess.findMany({
          where: {
            holderId: { in: [...holders] },
            videoId: { in: [...videos] },
            anonymousLinkId: { not: null },
          },
          select: { holderId: true, videoId: true, anonymousLinkId: true },
        })
      : [];
    return {
      masker,
      links: new Map(
        held.map((h) => [`${h.holderId}:${h.videoId}`, h.anonymousLinkId]),
      ),
    };
  }

  /** A video of the offer, masked as its giving side's copy is. */
  private itemCard(
    r: LoadedRequest,
    i: LoadedOffer['items'][number],
    masks: Masks,
  ) {
    const [giver, receiver] =
      i.givingSide === 'HOLDER'
        ? [r.holderId, r.requesterId]
        : [r.requesterId, r.holderId];
    return masks.masker.card(videoCard(this.storage, i.video, i.video.author), {
      holding:
        masks.links.get(`${giver}:${i.videoId}`) ??
        masks.links.get(`${receiver}:${i.videoId}`) ??
        null,
      context: i.givingSide === 'HOLDER' ? r.anonymousLinkId : null,
    });
  }

  private notify(tx: Tx, deliveries: Delivery[]): Promise<void> {
    return this.outbox.emit(tx, 'notify', { deliveries });
  }

  /** Videos of an offer that no longer exist, are not READY, or are no longer held by their giving side. */
  private async lostVideos(
    tx: Tx,
    r: LoadedRequest,
    offer: LoadedOffer,
  ): Promise<Set<string>> {
    const lost = new Set<string>();
    const give = splitItems(offer.items);
    await this.holdVideos(tx, [...give.holderGives, ...give.requesterGives]);
    for (const [owner, ids] of [
      [r.holderId, give.holderGives],
      [r.requesterId, give.requesterGives],
    ] as const) {
      if (ids.length === 0) continue;
      const held = await tx.videoAccess.findMany({
        where: {
          holderId: owner,
          videoId: { in: ids },
          source: { not: 'PUBLIC_ADD' },
          video: { deletedAt: null, status: 'READY' },
        },
        select: { videoId: true },
      });
      const ok = new Set(held.map((h) => h.videoId));
      for (const id of ids) if (!ok.has(id)) lost.add(id);
    }
    // Not ready only while its author edits it: not lost — the request waits, nothing
    // is closed; the one who acts is asked to try again in a moment.
    if (
      lost.size &&
      (await tx.video.count({
        where: { id: { in: [...lost] }, deletedAt: null, stage: 'EDIT' },
      }))
    )
      throw videoBeingEdited();
    return lost;
  }

  /**
   * Holds the offered videos until the exchange settles (FOR SHARE): a deletion running at the same
   * moment either committed before, and the check after this sees it, or waits until this one is done.
   * It is not waited for (NOWAIT): the deletion already holds its video and goes on to
   * lock this request, so waiting would deadlock; the actor gets "the offer changed" and tries again.
   */
  private async holdVideos(tx: Tx, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await tx.$executeRaw`SELECT id FROM "Video" WHERE id = ANY(${[...new Set(ids)]}::uuid[]) ORDER BY id FOR SHARE NOWAIT`;
    } catch (err) {
      if (isLockNotAvailable(err)) throw offerChanged();
      throw err;
    }
  }

  /** Requirement applied to a loaded OPEN request. */
  private async applyLoss(
    tx: Tx,
    r: LoadedRequest,
    lost: ReadonlySet<string>,
  ): Promise<void> {
    const round0 = r.offers.find((o) => o.round === 0)!;
    const current = r.offers.find((o) => o.id === r.currentOfferId) ?? round0;
    const outcome = lossOutcome(
      r,
      toRuleOffer(current),
      splitItems(round0.items).holderGives,
      lost,
    );
    if (outcome.kind === 'none') return;
    const now = new Date();
    const title = requestedTitle(round0);
    if (outcome.kind === 'invalidate') {
      await tx.exchangeOffer.update({
        where: { id: current.id },
        data: { status: 'VOID', respondedAt: now },
      });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: { status: 'INVALIDATED', awaitingUserId: null, resolvedAt: now },
      });
      await this.notify(
        tx,
        [r.holderId, r.requesterId].map((userId) => ({
          userId,
          type: 'REQUEST_INVALIDATED' as const,
          payload: { requestId: r.id, reason: 'videoLost', title },
        })),
      );
      return;
    }
    // Only the lost ones go: what the requester offered from the start stays where it can.
    await tx.exchangeOfferItem.deleteMany({
      where: { offerId: round0.id, videoId: { in: [...lost] } },
    });
    if (outcome.voidCurrent) {
      await tx.exchangeOffer.update({
        where: { id: current.id },
        data: { status: 'VOID', respondedAt: now },
      });
      await tx.exchangeOffer.update({
        where: { id: round0.id },
        data: { status: 'PENDING', respondedAt: null },
      });
      await tx.videoRequest.update({
        where: { id: r.id },
        data: {
          round: 0,
          currentOfferId: round0.id,
          awaitingUserId: r.holderId,
          resetAt: now,
        },
      });
    }
    await this.notify(
      tx,
      [r.holderId, r.requesterId].map((userId) => ({
        userId,
        type: 'REQUEST_INVALIDATED' as const,
        payload: { requestId: r.id, reason: 'reset', title },
      })),
    );
  }

  /**
   * Every id is held by `owner` (not a bookmark), READY, not deleted, and not already held by `other`.
   * Asked of the side that did not propose (`visibleOnly`), its hidden videos do not count:
   * the proposer cannot see them.
   */
  private async allOfferable(
    tx: Tx,
    owner: string,
    other: string,
    ids: string[],
    visibleOnly = false,
    /** A guest gives only what they uploaded for this deal. */
    dealId?: string,
  ): Promise<boolean> {
    if (ids.length === 0) return true;
    const n = await tx.videoAccess.count({
      where: {
        holderId: owner,
        videoId: { in: ids },
        source: { not: 'PUBLIC_ADD' },
        ...(visibleOnly ? { hidden: false } : {}),
        video: {
          deletedAt: null,
          status: 'READY',
          holdings: { none: { holderId: other } },
          ...(dealId ? { dealId } : {}),
        },
      },
    });
    return n === ids.length;
  }

  /** Cards of `owner`'s videos that may go into an offer towards `other`; `visibleOnly` drops hidden ones. */
  private async offerable(
    owner: string,
    other: string,
    visibleOnly: boolean,
    /** A guest's side: only what they uploaded for this deal. */
    dealId?: string,
    /** Masks to collect; `context` is the anonymous link `owner` is known by here. */
    mask?: { masker: Masker; context?: string | null },
  ): Promise<OfferVideoDto[]> {
    const rows = await this.prisma.videoAccess.findMany({
      where: {
        holderId: owner,
        source: { not: 'PUBLIC_ADD' },
        ...(visibleOnly ? { hidden: false } : {}),
        video: {
          deletedAt: null,
          status: 'READY',
          holdings: { none: { holderId: other } },
          ...(dealId ? { dealId } : {}),
        },
      },
      include: {
        video: {
          include: {
            author: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((h) => {
      const card = Object.assign(
        videoCard(this.storage, h.video, h.video.author),
        { categoryId: h.categoryId, received: h.source !== 'AUTHOR' },
      );
      return mask
        ? mask.masker.card(card, {
            holding: h.anonymousLinkId,
            context: mask.context,
          })
        : card;
    });
  }

  /** videoId → open request id for round-0 items of the requester's OPEN requests (any holder). */
  private async openRequestsFor(
    tx: Tx | PrismaService,
    requesterId: string,
    videoIds: string[],
  ): Promise<Map<string, string>> {
    const rows = await tx.exchangeOfferItem.findMany({
      where: {
        videoId: { in: videoIds },
        givingSide: 'HOLDER',
        offer: { round: 0, request: { requesterId, status: 'OPEN' } },
      },
      select: { videoId: true, offer: { select: { requestId: true } } },
    });
    return new Map(rows.map((r) => [r.videoId, r.offer.requestId]));
  }

  /** Videos requested in the last 24 hours: cancelled requests count too. */
  private requestedToday(
    tx: Tx | PrismaService,
    requesterId: string,
  ): Promise<number> {
    return tx.exchangeOfferItem.count({
      where: {
        givingSide: 'HOLDER',
        offer: {
          round: 0,
          request: {
            requesterId,
            createdAt: { gt: new Date(Date.now() - DAY_MS) },
          },
        },
      },
    });
  }

  private async dailyLimit(userId: string): Promise<number> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true, tierUntil: true },
    });
    const limit = (await this.plans.limitsFor(effectiveTier(u))).requestsPerDay;
    // 0 = no limit, as for every other limit of a self-hosted instance.
    return limit === 0 ? Infinity : limit;
  }

  /**
   * When one more video can be requested again: the request that leaves the 24-hour window first
   * among those that keep the allowance used up; null while there is room.
   */
  private async limitFreesAt(
    requesterId: string,
    used: number,
    limit: number,
  ): Promise<string | null> {
    if (used < limit) return null;
    const items = await this.prisma.exchangeOfferItem.findMany({
      where: {
        givingSide: 'HOLDER',
        offer: {
          round: 0,
          request: {
            requesterId,
            createdAt: { gt: new Date(Date.now() - DAY_MS) },
          },
        },
      },
      select: {
        offer: { select: { request: { select: { createdAt: true } } } },
      },
      orderBy: { offer: { request: { createdAt: 'asc' } } },
      skip: used - limit,
      take: 1,
    });
    const at = items[0]?.offer.request.createdAt;
    return at ? new Date(at.getTime() + DAY_MS).toISOString() : null;
  }

  // ---------------------------------------------------------------------------
  // DTO mapping
  // ---------------------------------------------------------------------------

  private toUser(u: UserRef): RequestUserDto {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.users.mediaUrl(u.avatarKey),
      pageHidden: u.pageHidden,
      guest: u.status === 'GUEST',
      exchangeWants: u.exchangeWants,
      exchangeAvoid: u.exchangeAvoid,
    };
  }

  /** The holder, masked to the other side when they were asked through their anonymous link. */
  private toParty(u: UserRef, r: LoadedRequest, masks: Masks): RequestUserDto {
    const dto = this.toUser(u);
    return u.id === r.holderId
      ? masks.masker.user(dto, r.anonymousLinkId)
      : dto;
  }

  private toOffer(o: LoadedOffer, r: LoadedRequest, masks: Masks): OfferDto {
    const proposedBy = o.proposedById === r.holderId ? r.holder : r.requester;
    return {
      id: o.id,
      round: o.round,
      proposedBy: this.toParty(proposedBy, r, masks),
      status: o.status,
      message: o.message,
      items: o.items.map((i) => ({
        givingSide: i.givingSide,
        video: this.itemCard(r, i, masks),
      })),
      createdAt: o.createdAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString() ?? null,
    };
  }

  /** The blocked side sees a BLOCKED request as declined (its own) or closed by the system. */
  private visibleStatus(r: LoadedRequest, viewerId: string): RequestStatus {
    if (r.status !== 'BLOCKED' || r.resolvedById === viewerId) return r.status;
    return r.requesterId === viewerId ? 'DECLINED' : 'INVALIDATED';
  }

  /** The current offer from one side: what that side gives and gets (holder gives the HOLDER items). */
  private dealFor(r: LoadedRequest, role: 'holder' | 'requester'): DealDto {
    const current =
      r.offers.find((o) => o.id === r.currentOfferId) ??
      r.offers.find((o) => o.round === 0);
    const split = splitItems(current?.items ?? []);
    const holder = {
      give: split.holderGives.length,
      get: split.requesterGives.length,
    };
    return {
      ...(role === 'holder' ? holder : { give: holder.get, get: holder.give }),
      lastMessage: current?.message ?? r.message ?? null,
    };
  }

  private toSummary(
    r: LoadedRequest,
    viewerId: string,
    masks: Masks,
  ): RequestSummaryDto {
    const role = r.holderId === viewerId ? 'holder' : 'requester';
    const round0 = r.offers.find((o) => o.round === 0);
    return {
      id: r.id,
      status: this.visibleStatus(r, viewerId),
      round: r.round,
      role,
      counterpart: this.toParty(
        role === 'holder' ? r.requester : r.holder,
        r,
        masks,
      ),
      awaitingMe: r.status === 'OPEN' && r.awaitingUserId === viewerId,
      message: r.message,
      // Round 0 may carry the requester's offer too: requested is the holder's side.
      requested: (round0?.items ?? [])
        .filter((i) => i.givingSide === 'HOLDER')
        .map((i) => this.itemCard(r, i, masks)),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      deal: this.dealFor(r, role),
      // Only the holder learns that the request came through their anonymous link.
      anonymousLink:
        role === 'holder' && r.anonymousLink
          ? { note: r.anonymousLink.note }
          : null,
    };
  }

  private toDetail(
    r: LoadedRequest,
    viewerId: string,
    masks: Masks,
  ): RequestDetailDto {
    return Object.assign(this.toSummary(r, viewerId, masks), {
      holder: this.toParty(r.holder, r, masks),
      requester: this.toUser(r.requester),
      currentOfferId: r.currentOfferId,
      declineComment: r.declineComment,
      resetAt: r.resetAt?.toISOString() ?? null,
      offers: r.offers.map((o) => this.toOffer(o, r, masks)),
      actions: actionsFor(r, viewerId),
    });
  }
}

/** A video of the offer is gone: the command rolls back and the loss is applied separately. */
class OfferLost extends Error {
  constructor(readonly lost: Set<string>) {
    super('offer video lost');
  }
}

function toRuleOffer(
  o: ExchangeOffer & { items: ExchangeOfferItem[] },
): RuleOffer {
  return {
    id: o.id,
    round: o.round,
    proposedById: o.proposedById,
    status: o.status,
    items: o.items.map((i) => ({
      videoId: i.videoId,
      givingSide: i.givingSide,
    })),
  };
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'requestNotFound',
    'errors.exchange.notFound',
  );
const videoBeingEdited = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'videoBeingEdited',
    'errors.exchange.videoBeingEdited',
  );
const offerChanged = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'offerChanged',
    'errors.exchange.offerChanged',
  );
const invalidOffer = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'invalidOffer',
    'errors.exchange.invalidOffer',
  );

/** The first requested video's title, for notifications (round 0 may hold an offer too). */
function requestedTitle(
  offer:
    { items: { givingSide: string; video: { title: string } }[] } | undefined,
): string {
  return offer?.items.find((i) => i.givingSide === 'HOLDER')?.video.title ?? '';
}

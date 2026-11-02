import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';

import type {
  AppRequest,
  RequestUser,
} from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { localeFromAcceptLanguage } from '../../common/i18n/i18n.js';
import { normalizeEmail } from '../../common/validation/email.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { pageVisible, requestBlocker } from '../access/access-policy.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { SignupCaptchaService } from '../captcha/signup-captcha.service.js';
import { videoCard } from '../collection/video-card.js';
import { attachmentHeader } from '../downloads/download-rules.js';
import { fileOf } from '../downloads/downloads.service.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import type { PlaybackDto } from '../streaming/streaming.dto.js';
import { StreamingService } from '../streaming/streaming.service.js';
import type {
  PresignedPartsDto,
  UploadSessionDto,
} from '../uploads/uploads.dto.js';
import { UploadsService } from '../uploads/uploads.service.js';
import type { Locale } from '../../generated/prisma/enums.js';
import { PlansService } from '../plans/plans.service.js';
import { UsersService } from '../users/users.service.js';
import type {
  GuestCounterDto,
  GuestDealDto,
  GuestDealStartedDto,
  GuestUploadCompleteDto,
  GuestUploadStartDto,
  StartGuestDealDto,
} from './deals.dto.js';
import { ExchangeLinksService } from './exchange-links.service.js';
import {
  GUEST_MAX_UPLOADS,
  GuestEscrowService,
} from './guest-escrow.service.js';
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE_MS,
  GUEST_COOKIE_PATH,
  GUEST_USERNAME_PREFIX,
  guestKeyBox,
  hashGuestKey,
  newGuestKey,
  sealGuestKey,
} from './guest-keys.js';
import { GuestMailService } from './guest-mail.service.js';

/** Open deals a guest may have at once, and deals one address may start in a day. */
export const GUEST_OPEN_DEALS = 3;
const GUEST_STARTS_PER_DAY = 3;
const DOWNLOAD_URL_TTL_SEC = 120;
const AUTHOR = { select: { id: true, username: true, displayName: true } };

/** Someone who holds nothing: what a guest could ask for, were they a person. */
const GUEST_ASKER = { id: 'guest', role: 'USER', tier: 'BASIC' } as const;

export interface Guest {
  id: string;
  locale: Locale;
  guestEmail: string | null;
  guestEmailVerifiedAt: Date | null;
}

const GUEST_SELECT = {
  id: true,
  locale: true,
  guestEmail: true,
  guestEmailVerifiedAt: true,
} as const;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'dealNotFound',
    'errors.deals.notFound',
  );
const closed = () =>
  new AppException(HttpStatus.CONFLICT, 'dealClosed', 'errors.deals.closed');

/** "a•••@example.com" */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name!.slice(0, 1)}•••@${domain}`;
}

/**
 * Exchanges with guests: someone without an account offers their own videos for private
 * videos — from a video's page or an exchange link. The guest is a ghost account known by a key in
 * their browser and in the deal's links; their uploads wait on our servers only while the deal goes
 * on (GuestEscrowService); signing in or up hands the deal and the videos to the account.
 */
@Injectable()
export class GuestDealsService {
  private readonly box: Buffer;
  private readonly secure: boolean;
  private readonly rateLimits: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchange: ExchangeService,
    private readonly links: ExchangeLinksService,
    private readonly uploads: UploadsService,
    private readonly streaming: StreamingService,
    private readonly storage: StorageService,
    private readonly escrow: GuestEscrowService,
    private readonly mail: GuestMailService,
    private readonly captcha: SignupCaptchaService,
    private readonly users: UsersService,
    private readonly plans: PlansService,
    private readonly anonymous: AnonymousLinksService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.box = guestKeyBox(config.get('KEK', { infer: true }));
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
    this.rateLimits = config.get('RATE_LIMITS', { infer: true });
  }

  // ---------------------------------------------------------------- who the guest is

  /** The guest behind this browser's key, if any. */
  async guestOf(req: AppRequest): Promise<Guest | null> {
    const key = req.cookies?.[GUEST_COOKIE];
    if (!key) return null;
    return (await this.prisma.user.findFirst({
      where: { guestKeyHash: hashGuestKey(key), status: 'GUEST' },
      select: GUEST_SELECT,
    })) as Guest | null;
  }

  /**
   * The guest's letters speak the language the deal page was last read in: the app sends
   * its own as Accept-Language, and a pick on the page or the site reaches it with the next read.
   */
  async keepLocale(guest: Guest, req: AppRequest): Promise<Guest> {
    const header = req.headers['accept-language'];
    if (!header) return guest;
    const locale = localeFromAcceptLanguage(header);
    if (locale === guest.locale) return guest;
    await this.prisma.user.update({
      where: { id: guest.id },
      data: { locale },
    });
    return { ...guest, locale };
  }

  async mustGuest(req: AppRequest): Promise<Guest> {
    const guest = await this.guestOf(req);
    if (!guest) throw notFound();
    return guest;
  }

  /** A deal's link opened in another browser: its key lets this one in. */
  async claim(key: string, res: Response): Promise<void> {
    const guest = await this.prisma.user.findFirst({
      where: { guestKeyHash: hashGuestKey(key), status: 'GUEST' },
      select: { id: true },
    });
    if (!guest) throw notFound();
    this.setCookie(res, key);
  }

  setCookie(res: Response, key: string): void {
    res.cookie(GUEST_COOKIE, key, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      path: GUEST_COOKIE_PATH,
      maxAge: GUEST_COOKIE_MAX_AGE_MS,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(GUEST_COOKIE, { path: GUEST_COOKIE_PATH });
  }

  private asUser(guest: Guest): RequestUser {
    return {
      id: guest.id,
      role: 'USER',
      tier: 'BASIC',
      status: 'GUEST',
      locale: guest.locale,
      emailVerified: false,
      sessionId: '',
    };
  }

  // ---------------------------------------------------------------- starting

  async start(
    req: AppRequest,
    res: Response,
    dto: StartGuestDealDto,
  ): Promise<GuestDealStartedDto> {
    const { holderId, videoIds, linkId, anonymousLinkId } =
      await this.source(dto);
    let guest = await this.guestOf(req);
    // A new guest proves they are human before their first upload.
    if (!guest) await this.captcha.demand(req.ip, dto.captchaToken);
    let key = req.cookies?.[GUEST_COOKIE] ?? '';
    if (guest) {
      const open = await this.prisma.videoRequest.count({
        where: { requesterId: guest.id, status: { in: ['DRAFT', 'OPEN'] } },
      });
      if (open >= GUEST_OPEN_DEALS) throw tooMany();
    }
    if (this.rateLimits && req.ip) {
      const ipKey = `guest:deals:${req.ip}`;
      const n = await this.redis.incr(ipKey);
      if (n === 1) await this.redis.expire(ipKey, 24 * 3600);
      if (n > GUEST_STARTS_PER_DAY) throw tooMany();
    }
    if (!guest) {
      ({ guest, key } = await this.createGuest(req));
      this.setCookie(res, key);
    }
    const blocked = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: holderId, blockedId: guest.id },
          { blockerId: guest.id, blockedId: holderId },
        ],
      },
    });
    if (blocked)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'blocked',
        'errors.exchange.blocked',
      );
    const message = dto.message?.trim() || null;
    const id = await this.prisma.$transaction(async (tx) => {
      const request = await tx.videoRequest.create({
        data: {
          requesterId: guest.id,
          holderId,
          message,
          status: 'DRAFT',
          exchangeLinkId: linkId,
          anonymousLinkId,
        },
      });
      const offer = await tx.exchangeOffer.create({
        data: {
          requestId: request.id,
          round: 0,
          proposedById: guest.id,
          message,
          items: {
            create: videoIds.map((videoId) => ({
              videoId,
              givingSide: 'HOLDER' as const,
            })),
          },
        },
      });
      await tx.videoRequest.update({
        where: { id: request.id },
        data: { currentOfferId: offer.id },
      });
      return request.id;
    });
    if (dto.email) await this.setEmail(guest, id, dto.email);
    return { id, key };
  }

  /** What the deal asks for and from whom: an exchange link's videos, or one private video. */
  private async source(dto: StartGuestDealDto): Promise<{
    holderId: string;
    videoIds: string[];
    linkId: string | null;
    anonymousLinkId: string | null;
  }> {
    if (dto.link) {
      const { link, videos } = await this.links.open(dto.link);
      return {
        holderId: link.owner.id,
        videoIds: videos.map((v) => v.id),
        linkId: link.id,
        anonymousLinkId: null,
      };
    }
    if (!dto.videoId || !dto.holder) throw notFound();
    // By name, or through the holder's anonymous link.
    const found = await this.users.resolveHandle(dto.holder);
    const holder = found?.user;
    const anonymous = found?.link ?? null;
    if (
      !holder ||
      !(anonymous ? holder.status === 'ACTIVE' : pageVisible(holder, null))
    )
      throw notFound();
    if (!holder.acceptGuestExchanges)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'guestExchangeOff',
        'errors.deals.guestsOff',
      );
    const holding = await this.prisma.videoAccess.findUnique({
      where: {
        videoId_holderId: { videoId: dto.videoId, holderId: holder.id },
      },
      include: { video: true },
    });
    if (
      !holding ||
      requestBlocker(
        GUEST_ASKER,
        holding.video,
        {
          holderId: holding.holderId,
          source: holding.source,
          hidden: holding.hidden,
        },
        null,
      ) !== null
    )
      throw notFound();
    return {
      holderId: holder.id,
      videoIds: [dto.videoId],
      linkId: null,
      anonymousLinkId: anonymous?.id ?? null,
    };
  }

  private async createGuest(
    req: AppRequest,
  ): Promise<{ guest: Guest; key: string }> {
    const key = newGuestKey();
    const guest = (await this.prisma.user.create({
      data: {
        username: `${GUEST_USERNAME_PREFIX}${randomBytes(6).toString('hex')}`,
        displayName: 'Guest',
        status: 'GUEST',
        locale: localeFromAcceptLanguage(req.headers['accept-language']),
        guestKeyHash: hashGuestKey(key),
        guestKeySealed: sealGuestKey(this.box, key),
        acceptGuestExchanges: false,
      },
      select: GUEST_SELECT,
    })) as Guest;
    return { guest, key };
  }

  // ---------------------------------------------------------------- the deal page

  private async dealOf(guest: Guest, id: string) {
    const deal = await this.prisma.videoRequest.findFirst({
      where: { id, requesterId: guest.id },
      select: {
        id: true,
        status: true,
        holderId: true,
        currentOfferId: true,
        expiresAt: true,
        guestAccessUntil: true,
        awaitingUserId: true,
      },
    });
    if (!deal) throw notFound();
    return deal;
  }

  async view(guest: Guest, id: string): Promise<GuestDealDto> {
    await this.dealOf(guest, id);
    // A draft whose videos just got ready reaches the holder now, not at the next sweep.
    await this.escrow.promote(id);
    const deal = await this.dealOf(guest, id);
    const now = Date.now();
    const [detail, uploads, current, options] = await Promise.all([
      this.exchange.detail(guest.id, id),
      this.prisma.video.findMany({
        where: { dealId: id, authorId: guest.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { author: AUTHOR },
      }),
      deal.currentOfferId
        ? this.prisma.exchangeOfferItem.findMany({
            where: { offerId: deal.currentOfferId },
            select: { videoId: true, givingSide: true },
          })
        : Promise.resolve([]),
      deal.status === 'OPEN'
        ? this.exchange.options(guest.id, id)
        : Promise.resolve(null),
    ]);
    const offered = new Set(
      current.filter((i) => i.givingSide === 'REQUESTER').map((i) => i.videoId),
    );
    const masker = this.anonymous.masker({ id: guest.id, role: 'USER' });
    const access =
      deal.status === 'ACCEPTED' &&
      deal.guestAccessUntil &&
      deal.guestAccessUntil.getTime() > now
        ? deal.guestAccessUntil
        : null;
    const received = access
      ? await this.prisma.videoAccess.findMany({
          where: {
            holderId: guest.id,
            source: { not: 'AUTHOR' },
            videoId: {
              in: current
                .filter((i) => i.givingSide === 'HOLDER')
                .map((i) => i.videoId),
            },
            video: { deletedAt: null },
          },
          include: { video: { include: { author: AUTHOR } } },
        })
      : [];
    const dto: GuestDealDto = {
      deal: detail,
      sent: deal.status === 'DRAFT' && deal.awaitingUserId !== null,
      expiresInSec:
        deal.status === 'OPEN' && deal.expiresAt
          ? Math.max(0, Math.floor((deal.expiresAt.getTime() - now) / 1000))
          : null,
      accessUntil: access?.toISOString() ?? null,
      accessInSec: access
        ? Math.max(0, Math.floor((access.getTime() - now) / 1000))
        : null,
      uploads: uploads.map((v) =>
        Object.assign(videoCard(this.storage, v, v.author), {
          inOffer: offered.has(v.id),
        }),
      ),
      // What they received keeps its author masked as it came.
      received: received.map((h) =>
        masker.card(videoCard(this.storage, h.video, h.video.author), {
          holding: h.anonymousLinkId,
        }),
      ),
      holderVideos: options?.theirs ?? [],
      email: guest.guestEmail ? maskEmail(guest.guestEmail) : null,
      maxUploads: GUEST_MAX_UPLOADS,
      maxFileBytes: await this.guestFileBytes(),
    };
    await masker.apply();
    return dto;
  }

  // ---------------------------------------------------------------- uploads

  private async assertCanUpload(guest: Guest, id: string): Promise<void> {
    const deal = await this.dealOf(guest, id);
    if (deal.status !== 'DRAFT' && deal.status !== 'OPEN') throw closed();
    const n = await this.prisma.video.count({
      where: { dealId: id, deletedAt: null },
    });
    if (n >= GUEST_MAX_UPLOADS)
      throw new AppException(
        HttpStatus.CONFLICT,
        'dealUploadsMax',
        'errors.deals.uploadsMax',
        { params: { max: GUEST_MAX_UPLOADS } },
      );
  }

  async uploadStart(
    guest: Guest,
    id: string,
    dto: GuestUploadStartDto,
  ): Promise<UploadSessionDto> {
    await this.assertCanUpload(guest, id);
    return this.uploads.create(this.asUser(guest), dto);
  }

  uploadParts(
    guest: Guest,
    sessionId: string,
    partNumbers: number[],
  ): Promise<PresignedPartsDto> {
    return this.uploads.presignParts(
      this.asUser(guest),
      sessionId,
      partNumbers,
    );
  }

  async uploadComplete(
    guest: Guest,
    id: string,
    sessionId: string,
    dto: GuestUploadCompleteDto,
  ): Promise<GuestDealDto> {
    await this.assertCanUpload(guest, id);
    const video = await this.uploads.complete(this.asUser(guest), sessionId, {
      parts: dto.parts,
      title: dto.title,
      visibility: 'PRIVATE',
      sensitive: dto.sensitive ?? false,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.video.update({ where: { id: video.id }, data: { dealId: id } });
      // A draft offers everything uploaded for it; later uploads wait for a counter-offer.
      const deal = await tx.videoRequest.findUniqueOrThrow({
        where: { id },
        select: { status: true, currentOfferId: true },
      });
      if (deal.status === 'DRAFT' && deal.currentOfferId)
        await tx.exchangeOfferItem.create({
          data: {
            offerId: deal.currentOfferId,
            videoId: video.id,
            givingSide: 'REQUESTER',
          },
        });
    });
    return this.view(guest, id);
  }

  /** A guest's upload not on the table: deleted and erased at once. */
  async removeUpload(
    guest: Guest,
    id: string,
    videoId: string,
  ): Promise<GuestDealDto> {
    const deal = await this.dealOf(guest, id);
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, dealId: id, authorId: guest.id, deletedAt: null },
      select: { id: true },
    });
    if (!video) throw notFound();
    if (deal.status === 'OPEN' && deal.currentOfferId) {
      const inOffer = await this.prisma.exchangeOfferItem.count({
        where: { offerId: deal.currentOfferId, videoId },
      });
      if (inOffer)
        throw new AppException(
          HttpStatus.CONFLICT,
          'dealVideoInOffer',
          'errors.deals.videoInOffer',
        );
    }
    if (deal.status === 'DRAFT' && deal.currentOfferId)
      await this.prisma.exchangeOfferItem.deleteMany({
        where: { offerId: deal.currentOfferId, videoId },
      });
    await this.escrow.discardVideos([videoId]);
    return this.view(guest, id);
  }

  /** The guest sends the draft: it reaches the holder once every video is ready. */
  async send(
    guest: Guest,
    id: string,
    message: string | undefined,
  ): Promise<GuestDealDto> {
    const deal = await this.dealOf(guest, id);
    if (deal.status !== 'DRAFT') throw closed();
    const given = await this.prisma.exchangeOfferItem.count({
      where: { offerId: deal.currentOfferId!, givingSide: 'REQUESTER' },
    });
    if (!given)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'dealNothingOffered',
        'errors.deals.nothingOffered',
      );
    // The message goes with the offer, written beside it.
    const text = message?.trim() || null;
    await this.prisma.$transaction([
      this.prisma.videoRequest.updateMany({
        where: { id, status: 'DRAFT' },
        data: { awaitingUserId: deal.holderId, message: text },
      }),
      this.prisma.exchangeOffer.update({
        where: { id: deal.currentOfferId! },
        data: { message: text },
      }),
    ]);
    return this.view(guest, id);
  }

  /** The largest file a guest may upload: a Free account's. */
  async guestFileBytes(): Promise<number> {
    return (await this.plans.limitsForUser(GUEST_ASKER)).maxFileBytes;
  }

  /** The deal going on from an exchange link or a private video: a guest's, or a person's own. */
  async dealFrom(
    requesterId: string | null,
    from: { linkId: string } | { holderId: string; videoId: string },
  ): Promise<string | null> {
    if (!requesterId) return null;
    const deal = await this.prisma.videoRequest.findFirst({
      where: {
        requesterId,
        status: { in: ['DRAFT', 'OPEN'] },
        ...('linkId' in from
          ? { exchangeLinkId: from.linkId }
          : {
              holderId: from.holderId,
              exchangeLinkId: null,
              offers: {
                some: {
                  round: 0,
                  items: {
                    some: { videoId: from.videoId, givingSide: 'HOLDER' },
                  },
                },
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return deal?.id ?? null;
  }

  // ---------------------------------------------------------------- moves

  async accept(
    guest: Guest,
    id: string,
    offerId: string,
  ): Promise<GuestDealDto> {
    await this.exchange.accept(this.asUser(guest), id, offerId);
    return this.view(guest, id);
  }

  async decline(
    guest: Guest,
    id: string,
    comment: string | undefined,
  ): Promise<GuestDealDto> {
    await this.exchange.decline(this.asUser(guest), id, comment);
    return this.view(guest, id);
  }

  async counter(
    guest: Guest,
    id: string,
    dto: GuestCounterDto,
  ): Promise<GuestDealDto> {
    await this.exchange.counter(this.asUser(guest), id, dto);
    return this.view(guest, id);
  }

  /** The guest withdraws; a draft the holder never saw goes without a trace (null). */
  async cancel(guest: Guest, id: string): Promise<GuestDealDto | null> {
    const deal = await this.dealOf(guest, id);
    if (deal.status === 'DRAFT') {
      await this.escrow.dropDraft(id);
      return null;
    }
    await this.exchange.cancel(this.asUser(guest), id);
    return this.view(guest, id);
  }

  // ---------------------------------------------------------------- email

  /** Where news of the deal go (taken as given, no confirmation); the deal's link goes there at once. */
  async setEmail(guest: Guest, id: string, raw: string): Promise<void> {
    await this.dealOf(guest, id);
    const email = normalizeEmail(raw);
    await this.prisma.user.update({
      where: { id: guest.id },
      data: { guestEmail: email, guestEmailVerifiedAt: new Date() },
    });
    if (guest.guestEmail !== email) await this.mail.saved(guest.id, id);
  }

  // ---------------------------------------------------------------- what was received

  private async received(guest: Guest, id: string, videoId: string) {
    const deal = await this.dealOf(guest, id);
    if (
      deal.status !== 'ACCEPTED' ||
      !deal.guestAccessUntil ||
      deal.guestAccessUntil < new Date()
    )
      throw notFound();
    const holding = await this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId, holderId: guest.id } },
      include: { video: true },
    });
    if (!holding || holding.source === 'AUTHOR' || holding.video.deletedAt)
      throw notFound();
    return { until: deal.guestAccessUntil, video: holding.video };
  }

  async playback(
    guest: Guest,
    id: string,
    videoId: string,
  ): Promise<PlaybackDto> {
    const { until } = await this.received(guest, id, videoId);
    return this.streaming.dealPlayback(videoId, id, until);
  }

  /** Straight from storage at full speed, as by a temporary link. */
  async download(guest: Guest, id: string, videoId: string): Promise<string> {
    const { video } = await this.received(guest, id, videoId);
    const file = fileOf(video);
    return this.storage.presignGet('private', file.key, DOWNLOAD_URL_TTL_SEC, {
      contentDisposition: attachmentHeader(file.filename),
    });
  }

  // ---------------------------------------------------------------- into an account

  /**
   * The guest signed in or up: their deals become the account's, ordinary ones that never run
   * out; their uploads become the account's private videos, what they received lands on its shelf.
   * The ghost is closed. Returns the deals handed over.
   */
  async adopt(guestId: string, userId: string): Promise<number> {
    if (guestId === userId) return 0;
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.user.findFirst({
        where: { id: guestId, status: 'GUEST' },
        select: { id: true },
      });
      if (!guest) return 0;
      // A deal with oneself (the guest was the holder all along) ends.
      await tx.videoRequest.updateMany({
        where: {
          requesterId: guestId,
          holderId: userId,
          status: { in: ['DRAFT', 'OPEN'] },
        },
        data: {
          status: 'CANCELLED',
          awaitingUserId: null,
          resolvedAt: new Date(),
        },
      });
      const deals = await tx.videoRequest.updateMany({
        where: { requesterId: guestId },
        data: { requesterId: userId, expiresAt: null },
      });
      await tx.videoRequest.updateMany({
        where: { awaitingUserId: guestId },
        data: { awaitingUserId: userId },
      });
      await tx.exchangeOffer.updateMany({
        where: { proposedById: guestId },
        data: { proposedById: userId },
      });
      // Holdings: what the account already holds stays as it is; the rest moves over.
      const mine = new Set(
        (
          await tx.videoAccess.findMany({
            where: { holderId: userId },
            select: { videoId: true },
          })
        ).map((h) => h.videoId),
      );
      const theirs = await tx.videoAccess.findMany({
        where: { holderId: guestId },
        select: { id: true, videoId: true },
      });
      const move = theirs.filter((h) => !mine.has(h.videoId)).map((h) => h.id);
      if (move.length)
        await tx.videoAccess.updateMany({
          where: { id: { in: move } },
          data: { holderId: userId, unseen: true },
        });
      const uploads = await tx.video.findMany({
        where: { authorId: guestId, deletedAt: null },
        select: { sizeBytes: true },
      });
      await tx.video.updateMany({
        where: { authorId: guestId },
        data: { authorId: userId, dealId: null },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          storageUsedBytes: {
            increment: uploads.reduce((n, v) => n + v.sizeBytes, 0n),
          },
        },
      });
      await tx.user.update({
        where: { id: guestId },
        data: {
          status: 'DELETED',
          guestKeyHash: null,
          guestKeySealed: null,
          guestEmail: null,
          deletedAt: new Date(),
        },
      });
      return deals.count;
    });
  }
}

const tooMany = () =>
  new AppException(
    HttpStatus.TOO_MANY_REQUESTS,
    'guestDealsTooMany',
    'errors.deals.tooMany',
    { params: { max: GUEST_OPEN_DEALS } },
  );

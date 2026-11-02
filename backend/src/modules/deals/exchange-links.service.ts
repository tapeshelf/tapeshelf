import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { pageVisible, requestBlocker } from '../access/access-policy.js';
import { anonymousHandle } from '../anonymous-links/anonymous-link-rules.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { videoCard } from '../collection/video-card.js';
import { UsersService } from '../users/users.service.js';
import type { ExchangeInviteDto, MyExchangeLinkDto } from './deals.dto.js';

/** Up to this many videos in one link, as in a request. */
export const EXCHANGE_LINK_MAX_VIDEOS = 50;

const AUTHOR = { select: { id: true, username: true, displayName: true } };
/** Someone who holds nothing here: what anyone could ask for. */
const ASKER = { id: 'asker', role: 'USER', tier: 'BASIC' } as const;

/** This browser's guest's deal going on from a link or a video, if any. */
export type DealOf = (
  from: { linkId: string } | { holderId: string; videoId: string },
) => Promise<string | null>;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'exchangeLinkNotFound',
    'errors.deals.linkNotFound',
  );

/**
 * Links "for an exchange": a standing invitation to exchange for some of the owner's videos.
 * Everyone may make them; whoever opens one starts their own deal (a guest too); they work until the
 * owner takes them back. The same videos give back the same link.
 */
@Injectable()
export class ExchangeLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UsersService,
    private readonly anonymous: AnonymousLinksService,
  ) {}

  async create(
    user: RequestUser,
    videoIds: string[],
  ): Promise<MyExchangeLinkDto> {
    const ids = [...new Set(videoIds)];
    if (!ids.length || ids.length > EXCHANGE_LINK_MAX_VIDEOS)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'exchangeLinkVideos',
        'errors.deals.linkVideos',
      );
    const usable = await this.offerable(user.id, ids);
    if (usable.length !== ids.length)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'exchangeLinkVideos',
        'errors.deals.linkVideos',
      );
    // The same set again: the link already made for it.
    const existing = await this.prisma.exchangeLink.findMany({
      where: { ownerId: user.id, revokedAt: null },
      select: { id: true, items: { select: { videoId: true } } },
    });
    const wanted = [...ids].sort().join();
    const same = existing.find(
      (l) =>
        l.items
          .map((i) => i.videoId)
          .sort()
          .join() === wanted,
    );
    const id =
      same?.id ??
      (
        await this.prisma.exchangeLink.create({
          data: {
            code: randomBytes(9).toString('base64url'),
            ownerId: user.id,
            items: {
              create: ids.map((videoId, position) => ({ videoId, position })),
            },
          },
          select: { id: true },
        })
      ).id;
    return (await this.mine(user.id)).find((l) => l.id === id)!;
  }

  async mine(userId: string): Promise<MyExchangeLinkDto[]> {
    const links = await this.prisma.exchangeLink.findMany({
      where: { ownerId: userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        createdAt: true,
        items: {
          orderBy: { position: 'asc' },
          select: { video: { include: { author: AUTHOR } } },
        },
        _count: { select: { requests: true } },
      },
    });
    const masker = this.anonymous.masker({ id: userId, role: 'USER' });
    const masks = await this.holdingLinks(
      userId,
      links.flatMap((l) => l.items.map((i) => i.video.id)),
    );
    const mine = links.map((l) => ({
      id: l.id,
      code: l.code,
      createdAt: l.createdAt.toISOString(),
      videos: l.items.map((i) =>
        masker.card(videoCard(this.storage, i.video, i.video.author), {
          holding: masks.get(i.video.id),
        }),
      ),
      deals: l._count.requests,
    }));
    await masker.apply();
    return mine;
  }

  async revoke(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.exchangeLink.updateMany({
      where: { id, ownerId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw notFound();
  }

  /** What /x/<code> shows: who offers what, and what they look for. */
  async invite(
    code: string,
    viewer: RequestUser | undefined,
    dealOf: DealOf,
    guestFileBytes: number,
  ): Promise<ExchangeInviteDto> {
    const { link, videos } = await this.open(code);
    // The owner's copies keep the masks they came with.
    const masker = this.anonymous.masker(viewer);
    const masks = await this.holdingLinks(
      link.owner.id,
      videos.map((v) => v.id),
    );
    const cards = videos.map((v) =>
      masker.card(videoCard(this.storage, v, v.author), {
        holding: masks.get(v.id),
      }),
    );
    await masker.apply();
    return {
      code: link.code,
      owner: this.owner(link.owner),
      videos: cards,
      own: viewer?.id === link.owner.id,
      guestExchange: true,
      guestDeal: viewer ? null : await dealOf({ linkId: link.id }),
      request: viewer ? await dealOf({ linkId: link.id }) : null,
      guestFileBytes,
    };
  }

  /**
   * One private video on a holder's shelf, offered the same way: what a guest — or anyone
   * who may ask for it — sees on /x/v/<code>.
   */
  async single(
    holderUsername: string,
    code: string,
    viewer: RequestUser | undefined,
    dealOf: DealOf,
    guestFileBytes: number,
  ): Promise<ExchangeInviteDto> {
    // By name, or through the holder's anonymous link, with the video's code as seen there.
    const found = await this.users.resolveHandle(holderUsername);
    const holder = found?.user;
    const link = found?.link ?? null;
    const videoId = holder ? await this.videoByCode(code) : null;
    const video = videoId
      ? await this.prisma.video.findFirst({
          where: { id: videoId, deletedAt: null },
          include: { author: AUTHOR },
        })
      : null;
    const holding =
      holder && video
        ? await this.prisma.videoAccess.findUnique({
            where: {
              videoId_holderId: { videoId: video.id, holderId: holder.id },
            },
          })
        : null;
    if (
      !holder ||
      !video ||
      !holding ||
      !(link
        ? holder.status === 'ACTIVE'
        : pageVisible(holder, viewer ?? null)) ||
      requestBlocker(
        ASKER,
        video,
        {
          holderId: holding.holderId,
          source: holding.source,
          hidden: holding.hidden,
        },
        null,
      ) !== null
    )
      throw notFound();
    const owner = this.owner(holder);
    if (link) {
      owner.username = anonymousHandle(link.code);
      owner.displayName = link.name;
      owner.pageHidden = false;
    }
    const masker = this.anonymous.masker(link ? null : viewer);
    const card = masker.card(
      Object.assign(videoCard(this.storage, video, video.author), {
        title: holding.customTitle ?? video.title,
      }),
      { holding: holding.anonymousLinkId, context: link?.id },
    );
    await masker.apply();
    return {
      code: null,
      owner,
      videos: [card],
      own: viewer?.id === holder.id,
      guestExchange: holder.acceptGuestExchanges,
      guestDeal: viewer
        ? null
        : await dealOf({ holderId: holder.id, videoId: video.id }),
      request: viewer
        ? await dealOf({ holderId: holder.id, videoId: video.id })
        : null,
      guestFileBytes,
    };
  }

  private owner(u: {
    username: string;
    displayName: string;
    avatarKey: string | null;
    pageHidden: boolean;
    exchangeWants: string | null;
    exchangeAvoid: string | null;
  }) {
    return {
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.users.mediaUrl(u.avatarKey),
      pageHidden: u.pageHidden,
      exchangeWants: u.exchangeWants,
      exchangeAvoid: u.exchangeAvoid,
    };
  }

  /**
   * A link that still works and the videos it still offers: the owner's, not bookmarks, ready and not
   * hidden. None left (or the owner gone, banned) is a 404.
   */
  async open(code: string) {
    const link = await this.prisma.exchangeLink.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        revokedAt: true,
        owner: {
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
        items: { orderBy: { position: 'asc' }, select: { videoId: true } },
      },
    });
    if (!link || link.revokedAt || link.owner.status !== 'ACTIVE')
      throw notFound();
    const ids = link.items.map((i) => i.videoId);
    const usable = new Set(await this.offerable(link.owner.id, ids));
    const rows = await this.prisma.video.findMany({
      where: { id: { in: [...usable] } },
      include: { author: AUTHOR },
    });
    const byId = new Map(rows.map((v) => [v.id, v]));
    const videos = ids.flatMap((id) => {
      const v = byId.get(id);
      return v ? [v] : [];
    });
    if (!videos.length) throw notFound();
    return { link, videos };
  }

  /** The anonymous links `holderId`'s copies of these videos came through. */
  private async holdingLinks(
    holderId: string,
    videoIds: string[],
  ): Promise<Map<string, string | null>> {
    if (!videoIds.length) return new Map();
    const rows = await this.prisma.videoAccess.findMany({
      where: {
        holderId,
        videoId: { in: videoIds },
        anonymousLinkId: { not: null },
      },
      select: { videoId: true, anonymousLinkId: true },
    });
    return new Map(rows.map((r) => [r.videoId, r.anonymousLinkId]));
  }

  /** A video by its code, or by the code it goes by through an anonymous link. */
  private async videoByCode(raw: string): Promise<string | null> {
    const code = raw.toLowerCase();
    const [video, seen] = await Promise.all([
      this.prisma.video.findUnique({ where: { code }, select: { id: true } }),
      this.prisma.anonymousCode.findUnique({
        where: { code },
        select: { videoId: true },
      }),
    ]);
    return video?.id ?? seen?.videoId ?? null;
  }

  /** Of `ids`, those `ownerId` may still give in an exchange: their own copies, ready. */
  private async offerable(ownerId: string, ids: string[]): Promise<string[]> {
    const rows = await this.prisma.videoAccess.findMany({
      where: {
        holderId: ownerId,
        videoId: { in: ids },
        source: { not: 'PUBLIC_ADD' },
        hidden: false,
        video: { deletedAt: null, status: 'READY' },
      },
      select: { videoId: true },
    });
    return rows.map((r) => r.videoId);
  }
}

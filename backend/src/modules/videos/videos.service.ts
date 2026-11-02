import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  Prisma,
  Video,
  VideoFrame,
} from '../../generated/prisma/client.js';
import type { DeleteReason } from '../../generated/prisma/enums.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { StacksService } from '../collection/stacks.service.js';
import { tilePictures } from '../collection/video-card.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import {
  canAddToCollection,
  canHide,
  canManage,
  pageVisible,
} from '../access/access-policy.js';
import type { UpdateVideosDto } from '../collection/collection.dto.js';
import type {
  ListMineQueryDto,
  SetThumbnailDto,
  UpdateHoldingDto,
  UpdateVideoDto,
  VideoDetailDto,
  VideoContextDto,
  VideoDto,
  VideoListDto,
} from './videos.dto.js';
import { isCustomThumbKey, smallFrameKey } from './video-previews.js';
import { normalizeVideoCode } from '../../common/validation/video-code.js';
import { anonymousHandle } from '../anonymous-links/anonymous-link-rules.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import { exitOf } from '../trash/trash-state.js';

const DEFAULT_PAGE = 50;

export interface DeletableVideo {
  id: string;
  authorId: string;
  title: string;
  sizeBytes: bigint;
}

/** Author-side video API plus the holder-side bits (hide, category) of one video. */
@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queues: QueueService,
    private readonly categories: CategoriesService,
    private readonly outbox: OutboxService,
    private readonly exchange: ExchangeService,
    private readonly stacks: StacksService,
    private readonly anonymous: AnonymousLinksService,
  ) {}

  toDto(v: Video): VideoDto {
    return {
      id: v.id,
      code: v.code,
      authorId: v.authorId,
      title: v.title,
      description: v.description,
      visibility: v.visibility,
      sensitive: v.sensitive,
      status: v.status,
      stage: v.stage,
      progress: v.progress,
      failReason: v.failReason,
      originalFilename: v.originalFilename,
      sizeBytes: Number(v.sizeBytes),
      durationSec: v.durationSec,
      width: v.width,
      height: v.height,
      thumbnailUrl: v.thumbnailKey
        ? this.storage.publicUrl(v.thumbnailKey)
        : null,
      contactSheetUrl: v.contactSheetKey
        ? this.storage.publicUrl(v.contactSheetKey)
        : null,
      // What a tile shows, as a listing gives it: a live update of a tile no longer swaps its small
      // pictures for the full-size ones, six times heavier.
      ...tilePictures(this.storage, v),
      thumbnailFrameIndex: v.thumbnailFrameIndex,
      createdAt: v.createdAt.toISOString(),
      processedAt: v.processedAt?.toISOString() ?? null,
    };
  }

  toDetailDto(v: Video & { frames: VideoFrame[] }): VideoDetailDto {
    return Object.assign(this.toDto(v), {
      frames: v.frames
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((f) => ({
          index: f.index,
          timestampSec: f.timestampSec,
          url: this.storage.publicUrl(f.key),
          width: f.width,
          height: f.height,
        })),
    });
  }

  async listMine(
    userId: string,
    query: ListMineQueryDto,
  ): Promise<VideoListDto> {
    const limit = query.limit ?? DEFAULT_PAGE;
    const rows = await this.prisma.video.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { id: 'desc' }, // uuid v7: newest first
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map((v) => this.toDto(v));
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]!.id : null,
    };
  }

  async getOwn(
    userId: string,
    id: string,
  ): Promise<Video & { frames: VideoFrame[] }> {
    const video = await this.prisma.video.findFirst({
      where: { id, authorId: userId, deletedAt: null },
      include: { frames: true },
    });
    if (!video)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'videoNotFound',
        'errors.videos.notFound',
      );
    return video;
  }

  async getOwnDto(userId: string, id: string): Promise<VideoDetailDto> {
    return this.toDetailDto(await this.getOwn(userId, id));
  }

  /** Metadata edits (author only); a new title re-renders the contact sheet. */
  async update(
    userId: string,
    id: string,
    dto: UpdateVideoDto,
  ): Promise<VideoDetailDto> {
    const video = await this.getOwn(userId, id);
    const title = dto.title?.trim();
    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        title: title || undefined,
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
        visibility: dto.visibility,
        sensitive: dto.sensitive,
      },
      include: { frames: true },
    });
    if (title && title !== video.title && video.contactSheetKey)
      await this.queues.enqueueSheet({ videoId: id, userId });
    return this.toDetailDto(updated);
  }

  /** One of the 16 frames (instant) or an arbitrary second (worker job). */
  async setThumbnail(
    userId: string,
    id: string,
    dto: SetThumbnailDto,
  ): Promise<VideoDetailDto> {
    const video = await this.getOwn(userId, id);
    if (dto.frameIndex !== undefined) {
      const frame = video.frames.find((f) => f.index === dto.frameIndex);
      if (!frame)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'frameNotFound',
          'errors.videos.frameNotFound',
        );
      const updated = await this.prisma.video.update({
        where: { id },
        data: {
          thumbnailKey: frame.key,
          thumbnailSmallKey:
            video.smallFrames && video.assetPrefix
              ? smallFrameKey(video.assetPrefix, frame.index)
              : null,
          thumbnailFrameIndex: frame.index,
        },
        include: { frames: true },
      });
      const stale = [video.thumbnailKey, video.thumbnailSmallKey].filter(
        isCustomThumbKey,
      );
      if (stale.length)
        await this.storage
          .deleteObjects('public', stale)
          .catch(() => undefined);
      return this.toDetailDto(updated);
    }
    if (dto.timestampSec !== undefined) {
      if (video.status !== 'READY' || !video.durationSec)
        throw new AppException(
          HttpStatus.CONFLICT,
          'videoNotReady',
          'errors.videos.notReady',
        );
      if (dto.timestampSec > video.durationSec)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'timestampOutOfRange',
          'errors.videos.timestampOutOfRange',
        );
      await this.queues.enqueueThumbnail({
        videoId: id,
        userId,
        timestampSec: dto.timestampSec,
      });
      return this.toDetailDto(video);
    }
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'validation',
      'errors.validation',
    );
  }

  /**
   * Soft delete: the video vanishes everywhere at once, files stay
   * in S3 for the admin trash, the author's quota is released immediately.
   */
  async softDelete(user: RequestUser, id: string): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
    });
    if (!video || !canManage(viewerOf(user), video)) throw notFound();
    // Someone else's video goes through the admin panel: with the rule and a note for the author
    // and a line in the audit log. Through here it had neither.
    if (video.authorId !== user.id)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'deleteInAdminPanel',
        'errors.videos.deleteInAdminPanel',
      );
    await this.deleteVideos(user.id, [video]);
  }

  /**
   * Soft delete of one or more videos in one transaction: deletedAt, the author's quota and a
   * `video.removed` outbox event per video that other people hold (notification VIDEO_REMOVED).
   */
  private async deleteVideos(
    deletedById: string,
    videos: DeletableVideo[],
  ): Promise<void> {
    if (videos.length === 0) return;
    await this.prisma.$transaction((tx) =>
      this.softDeleteInTx(tx, deletedById, videos),
    );
    await this.outbox.nudge();
  }

  /**
   * The soft delete itself, inside the caller's transaction (account deletion reuses it). The reason
   * defaults to USER when the deleter authored every video, ADMIN otherwise.
   */
  async softDeleteInTx(
    tx: Prisma.TransactionClient,
    deletedById: string,
    videos: DeletableVideo[],
    reason?: DeleteReason,
    /** Holders told otherwise (the author of an admin removal gets the reasons). */
    skipHolders: string[] = [],
  ): Promise<void> {
    if (videos.length === 0) return;
    // Locked and read again inside the transaction: of two deletions of the same video running at
    // once (a double click, the bulk bar and the video page), only the first one counts. Each used to
    // release its size again, and a full shelf could be refilled until the nightly recount.
    const asked = videos.map((v) => v.id);
    // The size freed is read here too: the original plus an edited file made from it.
    const alive = new Map(
      (
        await tx.$queryRaw<{ id: string; bytes: bigint; authorId: string }[]>`
          SELECT id, "sizeBytes" + COALESCE("renderBytes", 0) AS bytes, "authorId" FROM "Video"
          WHERE id = ANY(${asked}::uuid[]) AND "deletedAt" IS NULL
          ORDER BY id FOR UPDATE`
      ).map((r) => [r.id, r]),
    );
    // What the caller read may be out of date: a video already gone is skipped, and the author
    // comes from the row under the lock, so the right person's quota is freed, once.
    videos = videos.flatMap((v) => {
      const now = alive.get(v.id);
      if (!now) return [];
      return [{ ...v, authorId: now.authorId }];
    });
    if (videos.length === 0) return;
    const ids = videos.map((v) => v.id);
    const why =
      reason ??
      (videos.every((v) => v.authorId === deletedById) ? 'USER' : 'ADMIN');
    const now = new Date();
    // Removed by an admin or with the account, it is past the author's trash from the start.
    const exit = exitOf(why);
    await tx.video.updateMany({
      where: { id: { in: ids } },
      data: {
        deletedAt: now,
        deletedById,
        deleteReason: why,
        ...(exit ? { trashExit: exit, trashExitAt: now } : {}),
      },
    });
    const byAuthor = new Map<string, bigint>();
    for (const v of videos)
      byAuthor.set(
        v.authorId,
        (byAuthor.get(v.authorId) ?? 0n) +
          (alive.get(v.id)?.bytes ?? v.sizeBytes),
      );
    for (const [authorId, freed] of byAuthor)
      await tx.user.update({
        where: { id: authorId },
        data: { storageUsedBytes: { decrement: freed } },
      });
    const holdings = await tx.videoAccess.findMany({
      where: {
        videoId: { in: ids },
        holderId: { notIn: [deletedById, ...skipHolders] },
      },
      select: { videoId: true, holderId: true, anonymousLinkId: true },
    });
    // Holders who know the author by an anonymous link learn it under that link's name.
    const linkNames = await this.anonymous.names(
      holdings.map((h) => h.anonymousLinkId),
    );
    const authors = await tx.user.findMany({
      where: { id: { in: [...byAuthor.keys()] } },
      select: { id: true, displayName: true },
    });
    const authorName = new Map(authors.map((a) => [a.id, a.displayName]));
    await this.exchange.onVideosUnavailable(tx, ids);
    // Grouped once: filtering every holding for every video was quadratic for a big author.
    const holdersOf = new Map<string, string[]>();
    const maskedOf = new Map<string, Record<string, string>>();
    for (const h of holdings) {
      const list = holdersOf.get(h.videoId);
      if (list) list.push(h.holderId);
      else holdersOf.set(h.videoId, [h.holderId]);
      if (h.anonymousLinkId)
        maskedOf.set(h.videoId, {
          ...maskedOf.get(h.videoId),
          [h.holderId]: linkNames.get(h.anonymousLinkId) ?? '',
        });
    }
    for (const v of videos) {
      const holderIds = holdersOf.get(v.id) ?? [];
      if (holderIds.length === 0) continue;
      await this.outbox.emit(tx, 'video.removed', {
        videoId: v.id,
        title: v.title,
        authorId: v.authorId,
        authorName: authorName.get(v.authorId) ?? '',
        deletedById,
        holderIds,
        ...(maskedOf.has(v.id) ? { maskedNames: maskedOf.get(v.id) } : {}),
      });
    }
  }

  /**
   * Bookmark a public video: a PUBLIC_ADD holding. Bookmarked from
   * a page opened through an anonymous link (`code`), the copy keeps its author masked.
   */
  async addToCollection(
    user: RequestUser,
    id: string,
    code?: string,
  ): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
    });
    if (!video) throw notFound();
    if (video.authorId === user.id)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'cannotAddToCollection',
        'errors.videos.cannotAddToCollection',
      );
    const holding = await this.holdingOf(user.id, id);
    if (holding)
      throw new AppException(
        HttpStatus.CONFLICT,
        'alreadyInCollection',
        'errors.videos.alreadyInCollection',
      );
    if (!canAddToCollection(viewerOf(user), video, null))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'cannotAddToCollection',
        'errors.videos.cannotAddToCollection',
      );
    const anonymousLinkId = await this.anonymousLinkOf(id, code);
    await this.prisma.videoAccess
      .create({
        data: {
          videoId: id,
          holderId: user.id,
          source: 'PUBLIC_ADD',
          anonymousLinkId,
        },
      })
      .catch((err: { code?: string }) => {
        if (err.code === 'P2002')
          throw new AppException(
            HttpStatus.CONFLICT,
            'alreadyInCollection',
            'errors.videos.alreadyInCollection',
          );
        throw err;
      });
  }

  /** Hide/show a video of my shelf and/or file it under one of my categories. */
  async updateHolding(
    user: RequestUser,
    id: string,
    dto: UpdateHoldingDto,
  ): Promise<void> {
    const holding = await this.holdingOf(user.id, id);
    if (!holding) throw notFound();
    if (dto.hidden !== undefined && !canHide(viewerOf(user), holding))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'cannotHide',
        'errors.videos.cannotHide',
      );
    // One's own video is renamed for everyone in its edit form; the holder's name is for others'.
    if (
      (dto.title !== undefined || dto.description !== undefined) &&
      holding.source === 'AUTHOR'
    )
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'ownVideoRename',
        'errors.videos.ownVideoRename',
      );
    if (dto.categoryId)
      await this.categories.assertOwn(user.id, dto.categoryId);
    await this.prisma.$transaction(async (tx) => {
      // Changing category on its own takes the video out of its stack.
      if (dto.categoryId !== undefined)
        await this.stacks.beforeCategoryChange(tx, user.id, [id]);
      await tx.videoAccess.update({
        where: { id: holding.id },
        data: {
          hidden: dto.hidden,
          categoryId: dto.categoryId,
          ...(dto.categoryId !== undefined ? { inbox: false } : {}),
          customTitle: ownText(dto.title),
          customDescription: ownText(dto.description),
        },
      });
    });
  }

  /** Bulk visibility / sensitive switch of own videos; videos the user does not author are skipped. */
  async bulkUpdate(user: RequestUser, dto: UpdateVideosDto): Promise<number> {
    if (dto.visibility === undefined && dto.sensitive === undefined) return 0;
    const r = await this.prisma.video.updateMany({
      where: { id: { in: dto.videoIds }, authorId: user.id, deletedAt: null },
      data: {
        visibility: dto.visibility,
        sensitive: dto.sensitive,
      },
    });
    return r.count;
  }

  /** Bulk soft delete of own videos (same semantics as `softDelete`); returns how many were deleted. */
  async softDeleteMany(user: RequestUser, ids: string[]): Promise<number> {
    const videos = await this.prisma.video.findMany({
      where: { id: { in: ids }, authorId: user.id, deletedAt: null },
      select: { id: true, authorId: true, title: true, sizeBytes: true },
    });
    await this.deleteVideos(user.id, videos);
    return videos.length;
  }

  /** `/v/:id` → the page the video should open on. */
  /**
   * Which page a bare video link opens in: the viewer's own shelf if they hold the video, else the
   * author's. Found by id (old /v/<id> links) or by the short code (/<code>).
   */
  async context(
    viewer: RequestUser | undefined,
    by: { id: string } | { code: string },
  ): Promise<VideoContextDto> {
    if ('code' in by) {
      const seen = await this.anonymousContext(viewer, by.code);
      if (seen) return seen;
    }
    const where =
      'id' in by ? { id: by.id } : { code: normalizeVideoCode(by.code) ?? '' };
    const video = await this.prisma.video.findFirst({
      where: { ...where, deletedAt: null },
      select: {
        id: true,
        code: true,
        author: {
          select: { id: true, username: true, status: true, pageHidden: true },
        },
      },
    });
    if (!video) throw notFound();
    const ctx = { id: video.id, code: video.code };
    if (viewer) {
      const own = await this.prisma.videoAccess.findUnique({
        where: { videoId_holderId: { videoId: video.id, holderId: viewer.id } },
        select: { holder: { select: { username: true } } },
      });
      if (own) return { ...ctx, username: own.holder.username };
    }
    if (!pageVisible(video.author, viewer ?? null)) throw notFound();
    // An old /v/<id> link would lead from a picture's address to the author of a video seen through
    // their anonymous link: such a video no longer opens by its id for anyone else.
    if (
      'id' in by &&
      (await this.prisma.anonymousCode.count({ where: { videoId: video.id } }))
    )
      throw notFound();
    return { ...ctx, username: video.author.username };
  }

  /**
   * A code seen through an anonymous link: the video opens in that link's page, so its owner
   * stays masked; the one who holds it through that link, or the owner, opens their own copy.
   */
  private async anonymousContext(
    viewer: RequestUser | undefined,
    raw: string,
  ): Promise<VideoContextDto | null> {
    const code = normalizeVideoCode(raw);
    if (!code) return null;
    const seen = await this.prisma.anonymousCode.findUnique({
      where: { code },
      select: {
        code: true,
        videoId: true,
        linkId: true,
        link: { select: { ownerId: true, code: true } },
        video: { select: { deletedAt: true } },
      },
    });
    if (!seen) return null;
    if (seen.video.deletedAt) throw notFound();
    const ctx = { id: seen.videoId, code: seen.code };
    if (viewer) {
      const own = await this.prisma.videoAccess.findUnique({
        where: {
          videoId_holderId: { videoId: seen.videoId, holderId: viewer.id },
        },
        select: {
          anonymousLinkId: true,
          holder: { select: { username: true } },
        },
      });
      if (
        own &&
        (own.anonymousLinkId === seen.linkId || viewer.id === seen.link.ownerId)
      )
        return { ...ctx, username: own.holder.username };
    }
    const link = await this.anonymous.resolve(seen.link.code);
    if (!link) throw notFound();
    return { ...ctx, username: anonymousHandle(link.code) };
  }

  /**
   * The anonymous link a bookmark made on a page opened by `code` carries: that link when the
   * video is its owner's, else the one the page's copy already had.
   */
  private async anonymousLinkOf(
    videoId: string,
    raw: string | undefined,
  ): Promise<string | null> {
    const code = raw ? normalizeVideoCode(raw) : null;
    if (!code) return null;
    const seen = await this.prisma.anonymousCode.findUnique({
      where: { code },
      select: {
        videoId: true,
        linkId: true,
        link: { select: { ownerId: true } },
      },
    });
    if (!seen || seen.videoId !== videoId) return null;
    const passed = await this.anonymous.passedOn(
      this.prisma,
      seen.link.ownerId,
      [videoId],
      { id: seen.linkId, ownerId: seen.link.ownerId },
    );
    return passed.get(videoId) ?? null;
  }

  private holdingOf(userId: string, videoId: string) {
    return this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId, holderId: userId } },
    });
  }
}

function viewerOf(user: RequestUser) {
  return { id: user.id, role: user.role, tier: user.tier };
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );

/** The holder's own text: blank means the author's again (null); not sent means unchanged. */
function ownText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

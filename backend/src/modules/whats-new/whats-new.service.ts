import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { videoCard } from '../collection/video-card.js';
import {
  WHATS_NEW_PAGE,
  type WhatsNewListDto,
  type WhatsNewQueryDto,
} from './whats-new.dto.js';

/**
 * "What's new": the videos of the people one follows (friends among them), newest
 * first, by the time each first became ready; no ranking. Only what the viewer would see on that
 * person's shelf: ready, not deleted, not kept "only for me", an active account, no block
 * either way. It replaces the notifications and emails about each new video.
 */
@Injectable()
export class WhatsNewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(
    viewerId: string,
    query: WhatsNewQueryDto,
  ): Promise<WhatsNewListDto> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? WHATS_NEW_PAGE;
    // The page's ids first: the followed authors' videos in the feed's order (Video_feed_idx),
    // the author's own holding checked for the page's rows only, one more row for "more". The
    // filter on every followed video and a count of them all took 60 + 170 ms for someone
    // following 5,000 people.
    const [ids, viewer] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c.id
        FROM (
          SELECT v.id, v."readyAt", v."authorId"
          FROM "Follow" f
          JOIN "User" a ON a.id = f."followeeId" AND a.status = 'ACTIVE'::"UserStatus" AND NOT a."pageHidden"
          JOIN "Video" v ON v."authorId" = f."followeeId" AND v."deletedAt" IS NULL
            AND v.status = 'READY'::"VideoStatus" AND v."readyAt" IS NOT NULL
          WHERE f."followerId" = ${viewerId}::uuid
            AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE b."blockerId" = a.id AND b."blockedId" = ${viewerId}::uuid)
            AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE b."blockerId" = ${viewerId}::uuid AND b."blockedId" = a.id)
          ORDER BY v."readyAt" DESC, v.id DESC
        ) c
        -- Not kept "only for me" by its author.
        CROSS JOIN LATERAL (
          SELECT 1 FROM "VideoAccess" va
          WHERE va."videoId" = c.id AND va."holderId" = c."authorId" AND va.hidden = false
          LIMIT 1
        ) h
        ORDER BY c."readyAt" DESC, c.id DESC
        OFFSET ${offset} LIMIT ${limit + 1}`),
      this.prisma.user.findUniqueOrThrow({
        where: { id: viewerId },
        select: { whatsNewSeenAt: true },
      }),
    ]);
    const pageIds = ids.slice(0, limit).map((r) => r.id);
    const found = new Map(
      (
        await this.prisma.video.findMany({
          where: { id: { in: pageIds } },
          include: {
            author: { select: { id: true, username: true, displayName: true } },
          },
        })
      ).map((v) => [v.id, v]),
    );
    const videos = pageIds.flatMap((id) => found.get(id) ?? []);
    const follows = new Map(
      (
        await this.prisma.follow.findMany({
          where: {
            followerId: viewerId,
            followeeId: { in: [...new Set(videos.map((v) => v.authorId))] },
          },
          select: { followeeId: true, createdAt: true },
        })
      ).map((f) => [f.followeeId, f.createdAt]),
    );
    return {
      hasMore: ids.length > limit,
      offset,
      items: videos.map((v) => {
        const followed = follows.get(v.authorId);
        const at = v.readyAt!;
        return {
          video: videoCard(this.storage, v, v.author),
          at: at.toISOString(),
          isNew:
            !!followed &&
            at > followed &&
            (!viewer.whatsNewSeenAt || at > viewer.whatsNewSeenAt),
        };
      }),
    };
  }

  /** The dot on "What's new": anything there newer than the last look and than its follow. */
  async hasNew(viewerId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ hasNew: boolean }[]>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM "Follow" f
        JOIN "User" me ON me.id = f."followerId"
        JOIN "User" a ON a.id = f."followeeId" AND a.status = 'ACTIVE'::"UserStatus" AND NOT a."pageHidden"
        JOIN "Video" v ON v."authorId" = f."followeeId"
        JOIN "VideoAccess" va ON va."videoId" = v.id AND va."holderId" = v."authorId"
        WHERE f."followerId" = ${viewerId}::uuid
          AND v."deletedAt" IS NULL AND v.status = 'READY'::"VideoStatus" AND va.hidden = false
          AND v."readyAt" > GREATEST(f."createdAt", COALESCE(me."whatsNewSeenAt", f."createdAt"))
          -- Two checks, not one with OR: the OR can turn into a scan of every block.
          AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE b."blockerId" = me.id AND b."blockedId" = a.id)
          AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE b."blockerId" = a.id AND b."blockedId" = me.id)
      ) AS "hasNew"`);
    return rows[0]?.hasNew === true;
  }

  async markSeen(viewerId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: viewerId },
      data: { whatsNewSeenAt: new Date() },
    });
  }
}

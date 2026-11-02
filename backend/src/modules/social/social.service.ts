import type { UserStatus } from '../../generated/prisma/enums.js';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { NotificationType } from '../../generated/prisma/client.js';
import { OutboxService } from '../../infra/outbox/outbox.service.js';
import type { Delivery } from '../../infra/outbox/outbox.types.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { pageVisible } from '../access/access-policy.js';
import { UsersService } from '../users/users.service.js';
import { relationView } from './social-rules.js';
import type {
  RelationDto,
  SocialListDto,
  SocialListQueryDto,
  UserCardDto,
} from './social.dto.js';
import { relationFacts, socialCounts } from './social.queries.js';

const DEFAULT_LIMIT = 50;
/** The same "new follower" / "now friends" news about the same person is not repeated within a day. */
const RENOTIFY_AFTER_MS = 24 * 60 * 60 * 1000;

interface Target {
  id: string;
  username: string;
  displayName: string;
  status: UserStatus;
  pageHidden: boolean;
}

/**
 * Follows and friends. Following is one click
 * and idempotent; when it becomes mutual both sides hear that they are friends now.
 */
interface ListRow {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  pageHidden: boolean;
  publicVideos: number;
  privateVideos: number;
  receivedVideos: number;
  exchanges: number;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly users: UsersService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * The same news about the same person at most once a day. Counted by a mark in Redis set
   * when the news goes out: the bell rows alone missed it for someone with in-app news switched off
   * and email on, and a follow/unfollow loop mailed them 30 times a minute.
   */
  private async recentlyTold(
    tx: Prisma.TransactionClient,
    userId: string,
    type: NotificationType,
    aboutUserId: string,
  ): Promise<boolean> {
    const marked = await this.redis
      .exists(newsKey(userId, type, aboutUserId))
      .catch(() => 0);
    return marked > 0 || toldInBell(tx, userId, type, aboutUserId);
  }

  /**
   * `invited`: both sides agreed through an invitation — the inviter by making it, the other
   * by taking it — so a hidden page's "no new followers" does not stand between them.
   */
  async follow(
    viewerId: string,
    username: string,
    { invited = false }: { invited?: boolean } = {},
  ): Promise<RelationDto> {
    const target = await this.activeTarget(username);
    if (target.id === viewerId)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'selfFollow',
        'errors.social.selfFollow',
      );
    const facts = await relationFacts(this.prisma, viewerId, target.id, true);
    // The blocked side is not told why: the same answer as for any refused follow.
    if (facts.viewerBlocked || facts.blockedByTarget)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'followNotAllowed',
        'errors.social.followNotAllowed',
      );
    if (facts.following) return relationView(facts);
    // No page, no new followers — but whoever they follow may follow them back.
    if (target.pageHidden && !facts.followedBy && !invited)
      throw notFoundUser();
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { username: true, displayName: true },
    });
    let told: Delivery[] = [];
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.follow.createMany({
        data: [{ followerId: viewerId, followeeId: target.id }],
        skipDuplicates: true,
      });
      if (created.count === 0) return;
      const mutual = await tx.follow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: target.id,
            followeeId: viewerId,
          },
        },
        select: { createdAt: true },
      });
      const deliveries: Delivery[] = [];
      if (mutual) {
        if (
          !(await this.recentlyTold(tx, target.id, 'FRIEND_ACCEPTED', viewerId))
        )
          deliveries.push({
            userId: target.id,
            type: 'FRIEND_ACCEPTED',
            payload: {
              userId: viewerId,
              withName: me.displayName,
              withUsername: me.username,
            },
          });
        if (
          !(await this.recentlyTold(tx, viewerId, 'FRIEND_ACCEPTED', target.id))
        )
          deliveries.push({
            userId: viewerId,
            type: 'FRIEND_ACCEPTED',
            payload: {
              userId: target.id,
              withName: target.displayName,
              withUsername: target.username,
            },
          });
      } else if (
        !(await this.recentlyTold(tx, target.id, 'NEW_FOLLOWER', viewerId))
      ) {
        deliveries.push({
          userId: target.id,
          type: 'NEW_FOLLOWER',
          payload: {
            userId: viewerId,
            fromName: me.displayName,
            fromUsername: me.username,
          },
        });
      }
      if (deliveries.length)
        await this.outbox.emit(tx, 'notify', { deliveries });
      told = deliveries;
    });
    for (const d of told)
      await this.redis
        .set(
          newsKey(d.userId, d.type, (d.payload as { userId: string }).userId),
          '1',
          'EX',
          RENOTIFY_AFTER_MS / 1000,
        )
        .catch(() => undefined);
    await this.outbox.nudge();
    return relationView({ ...facts, following: true });
  }

  /** Unfollowing ends a friendship; chat history stays, sending stops. */
  async unfollow(viewerId: string, username: string): Promise<RelationDto> {
    const target = await this.activeTarget(username);
    await this.prisma.follow.deleteMany({
      where: { followerId: viewerId, followeeId: target.id },
    });
    return this.relation(viewerId, target.id, true);
  }

  async relation(
    viewerId: string,
    targetId: string,
    targetActive: boolean,
  ): Promise<RelationDto> {
    return relationView(
      await relationFacts(this.prisma, viewerId, targetId, targetActive),
    );
  }

  /** Public lists of a page: friends, followers, following; active accounts only. */
  /**
   * A list with what tells the people apart: their videos (public, private,
   * received) and, for the list's own owner, how many exchanges they completed with each one;
   * sorted by exchanges, then by videos, then by the most recent follow.
   */
  async list(
    username: string,
    query: SocialListQueryDto,
    viewer?: RequestUser,
  ): Promise<SocialListDto> {
    const target = await this.activeTarget(username);
    if (!pageVisible(target, viewer ?? null)) throw notFoundUser();
    const list = query.list ?? 'friends';
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const own =
      !!viewer && (viewer.id === target.id || viewer.role === 'ADMIN');
    // People who hid their page are in the lists of their owner only (and an admin's view).
    const counts = await socialCounts(this.prisma, target.id, own);
    const members =
      list === 'friends'
        ? Prisma.sql`SELECT f."followeeId" AS id, GREATEST(f."createdAt", b."createdAt") AS since
            FROM "Follow" f
            JOIN "Follow" b ON b."followerId" = f."followeeId" AND b."followeeId" = f."followerId"
            WHERE f."followerId" = ${target.id}::uuid`
        : list === 'followers'
          ? Prisma.sql`SELECT f."followerId" AS id, f."createdAt" AS since FROM "Follow" f
              WHERE f."followeeId" = ${target.id}::uuid`
          : Prisma.sql`SELECT f."followeeId" AS id, f."createdAt" AS since FROM "Follow" f
              WHERE f."followerId" = ${target.id}::uuid`;
    const rows = await this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
      SELECT * FROM (
        WITH m AS (${members})
        SELECT u.id, u.username, u."displayName", u."avatarKey", u."pageHidden", m.since,
          (SELECT count(*)::int FROM "Video" v
             WHERE v."authorId" = u.id AND v."deletedAt" IS NULL AND v.visibility = 'PUBLIC'::"Visibility") AS "publicVideos",
          (SELECT count(*)::int FROM "Video" v
             WHERE v."authorId" = u.id AND v."deletedAt" IS NULL AND v.visibility = 'PRIVATE'::"Visibility") AS "privateVideos",
          (SELECT count(*)::int FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
             WHERE va."holderId" = u.id AND va.source <> 'AUTHOR'::"AccessSource" AND v."deletedAt" IS NULL) AS "receivedVideos",
          (SELECT count(*)::int FROM "VideoRequest" r
             WHERE r.status = 'ACCEPTED'::"RequestStatus"
               AND ((r."requesterId" = ${target.id}::uuid AND r."holderId" = u.id)
                 OR (r."requesterId" = u.id AND r."holderId" = ${target.id}::uuid))) AS exchanges
        FROM m JOIN "User" u ON u.id = m.id
        WHERE u.status = 'ACTIVE'::"UserStatus" ${own ? Prisma.empty : Prisma.sql`AND NOT u."pageHidden"`}
      ) t
      ORDER BY ${own ? Prisma.sql`t.exchanges DESC,` : Prisma.empty}
        (t."publicVideos" + t."privateVideos" + t."receivedVideos") DESC, t.since DESC, t.id
      OFFSET ${offset} LIMIT ${limit}`);
    return {
      list,
      items: rows.map((u) =>
        Object.assign(this.card(u), {
          videos: {
            public: u.publicVideos,
            private: u.privateVideos,
            received: u.receivedVideos,
          },
          exchanges: own ? u.exchanges : null,
        }),
      ),
      total: counts[list],
      offset,
      counts,
    };
  }

  card(u: {
    id: string;
    username: string;
    displayName: string;
    avatarKey: string | null;
    pageHidden: boolean;
  }): UserCardDto {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.users.mediaUrl(u.avatarKey),
      pageHidden: u.pageHidden,
    };
  }

  /** An active account, whether or not its page is hidden: unfollowing one always works. */
  private async activeTarget(username: string): Promise<Target> {
    const user = await this.users.resolveByUsername(username);
    if (!user || user.status !== 'ACTIVE') throw notFoundUser();
    return user;
  }
}

const notFoundUser = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'userNotFound',
    'errors.users.notFound',
  );

/** Marks that `userId` was told `type` about `aboutUserId` (whatever the channels). */
function newsKey(userId: string, type: string, aboutUserId: string): string {
  return `vs:follow-news:${userId}:${type}:${aboutUserId}`;
}

/** The bell rows of news told before the Redis mark existed still count. */
async function toldInBell(
  tx: Prisma.TransactionClient,
  userId: string,
  type: NotificationType,
  aboutUserId: string,
): Promise<boolean> {
  const n = await tx.notification.count({
    where: {
      userId,
      type,
      createdAt: { gt: new Date(Date.now() - RENOTIFY_AFTER_MS) },
      payload: { path: ['userId'], equals: aboutUserId },
    },
  });
  return n > 0;
}

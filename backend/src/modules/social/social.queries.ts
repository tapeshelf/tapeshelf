import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { RelationFacts } from './social-rules.js';

/** Follows and blocks between two users, in both directions. */
export async function relationFacts(
  prisma: PrismaService,
  viewerId: string,
  targetId: string,
  targetActive: boolean,
): Promise<RelationFacts> {
  const [follows, blocks] = await Promise.all([
    prisma.follow.findMany({
      where: {
        OR: [
          { followerId: viewerId, followeeId: targetId },
          { followerId: targetId, followeeId: viewerId },
        ],
      },
      select: { followerId: true },
    }),
    prisma.block.findMany({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    }),
  ]);
  return {
    following: follows.some((f) => f.followerId === viewerId),
    followedBy: follows.some((f) => f.followerId === targetId),
    viewerBlocked: blocks.some((b) => b.blockerId === viewerId),
    blockedByTarget: blocks.some((b) => b.blockerId === targetId),
    targetActive,
  };
}

/** Followers, following and friends of a user, counting active accounts only. */
export async function socialCounts(
  prisma: PrismaService,
  userId: string,
  /** People who hid their page count only for the lists' owner and admins. */
  withHidden: boolean,
): Promise<{ followers: number; following: number; friends: number }> {
  const shown = withHidden ? Prisma.empty : Prisma.sql`AND NOT u."pageHidden"`;
  const [row] = await prisma.$queryRaw<
    { followers: number; following: number; friends: number }[]
  >`
    SELECT
      (SELECT count(*)::int FROM "Follow" f JOIN "User" u ON u.id = f."followerId"
        WHERE f."followeeId" = ${userId}::uuid AND u.status = 'ACTIVE' ${shown}) AS followers,
      (SELECT count(*)::int FROM "Follow" f JOIN "User" u ON u.id = f."followeeId"
        WHERE f."followerId" = ${userId}::uuid AND u.status = 'ACTIVE' ${shown}) AS following,
      (SELECT count(*)::int FROM "Follow" f
        JOIN "Follow" b ON b."followerId" = f."followeeId" AND b."followeeId" = f."followerId"
        JOIN "User" u ON u.id = f."followeeId"
        WHERE f."followerId" = ${userId}::uuid AND u.status = 'ACTIVE' ${shown}) AS friends`;
  return row ?? { followers: 0, following: 0, friends: 0 };
}

/** Whether two users follow each other (both directions present). */
export async function areFriends(
  prisma: PrismaService,
  a: string,
  b: string,
): Promise<boolean> {
  const n = await prisma.follow.count({
    where: {
      OR: [
        { followerId: a, followeeId: b },
        { followerId: b, followeeId: a },
      ],
    },
  });
  return n === 2;
}

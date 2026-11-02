import type { Redis } from 'ioredis';

/**
 * Who has a live websocket (used to email chat messages only to people who are offline).
 * A counter per user with a TTL that the gateway refreshes while sockets stay open, so a crashed
 * process cannot leave someone "online" for longer than the TTL.
 */
export const PRESENCE_TTL_SECONDS = 120;
export const PRESENCE_REFRESH_MS = 60_000;

export function presenceKey(userId: string): string {
  return `vs:online:${userId}`;
}

export async function markOnline(redis: Redis, userId: string): Promise<void> {
  const key = presenceKey(userId);
  await redis.multi().incr(key).expire(key, PRESENCE_TTL_SECONDS).exec();
}

export async function markOffline(redis: Redis, userId: string): Promise<void> {
  const key = presenceKey(userId);
  const left = await redis.decr(key);
  if (left <= 0) await redis.del(key);
}

export async function refreshOnline(
  redis: Redis,
  userIds: Iterable<string>,
): Promise<void> {
  const pipeline = redis.pipeline();
  for (const id of userIds)
    pipeline.expire(presenceKey(id), PRESENCE_TTL_SECONDS);
  await pipeline.exec();
}

export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const value = await redis.get(presenceKey(userId));
  return value !== null && Number(value) > 0;
}

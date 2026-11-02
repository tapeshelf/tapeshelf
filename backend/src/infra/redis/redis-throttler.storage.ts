import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

/** Mirrors @nestjs/throttler's ThrottlerStorageRecord (not exported from the package index). */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed storage for @nestjs/throttler so limits hold across processes.
 * Atomic INCR + block window in one Lua script (same semantics as the in-memory storage).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private static readonly SCRIPT = `
    local hits = redis.call('INCR', KEYS[1])
    if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
    local ttl = redis.call('PTTL', KEYS[1])
    local blockTtl = redis.call('PTTL', KEYS[2])
    local blocked = 0
    if blockTtl > 0 then blocked = 1 end
    if hits > tonumber(ARGV[2]) and blocked == 0 then
      redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
      blocked = 1
      blockTtl = tonumber(ARGV[3])
    end
    return { hits, ttl, blocked, blockTtl }
  `;

  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'throttle',
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${this.prefix}:${throttlerName}:${key}:hits`;
    const blockKey = `${this.prefix}:${throttlerName}:${key}:block`;
    const block = blockDuration > 0 ? blockDuration : ttl;
    const [totalHits, expireMs, blocked, blockMs] = (await this.redis.eval(
      RedisThrottlerStorage.SCRIPT,
      2,
      hitsKey,
      blockKey,
      String(ttl),
      String(limit),
      String(block),
    )) as [number, number, number, number];
    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(expireMs / 1000)),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
    };
  }
}

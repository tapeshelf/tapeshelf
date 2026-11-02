import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppException } from '../../common/errors/app.exception.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';

const MAX_FAILURES = 10;
const WINDOW_SEC = 15 * 60;

/**
 * Per-account brute-force protection (the throttler already limits per IP): keyed by the email for
 * passwords, by `2fa:<user id>` for the second step.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string): string {
    return `auth:fail:${email}`;
  }

  async assertAllowed(email: string): Promise<void> {
    const count = Number((await this.redis.get(this.key(email))) ?? 0);
    if (count >= MAX_FAILURES) {
      const ttl = await this.redis.ttl(this.key(email));
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'tooManyAttempts',
        'errors.auth.tooManyAttempts',
        {
          params: { count: Math.max(1, Math.ceil(ttl / 60)) },
        },
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const count = await this.redis.incr(this.key(email));
    if (count === 1) await this.redis.expire(this.key(email), WINDOW_SEC);
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}

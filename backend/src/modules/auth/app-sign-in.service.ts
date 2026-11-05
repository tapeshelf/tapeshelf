import { createHash, randomBytes } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppException } from '../../common/errors/app.exception.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';

/** How long the app has to pick its sign-in up after the browser handed it over. */
const CODE_TTL_SEC = 120;

/**
 * A sign-in that happens in a browser and continues in the phone app (Google today).
 *
 * The app cannot read the browser's cookies, so the browser is sent back to the app with a
 * one-time code, and the app exchanges the code for a session of its own. The code alone is worth
 * nothing: when the app starts the sign-in it sends the hash of a secret it keeps (the challenge),
 * and the exchange needs the secret itself. Another app that catches the link gets a code it
 * cannot use.
 */
@Injectable()
export class AppSignInService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** `base64url(sha256(verifier))`: 43 characters. */
  isChallenge(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  }

  /** Where the browser is sent to return to the app; the app's manifest claims this address. */
  returnUrl(params: { code: string } | { error: string }): string {
    return `tapeshelf://app/auth/google?${new URLSearchParams(params).toString()}`;
  }

  /** A one-time code for this account, redeemable only by whoever holds the challenge's secret. */
  async issue(userId: string, challenge: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.key(code),
      JSON.stringify({ userId, challenge }),
      'EX',
      CODE_TTL_SEC,
    );
    return code;
  }

  /** The account the code was issued for. A code is spent by the first attempt, right or wrong. */
  async redeem(code: string, verifier: string): Promise<string> {
    const stored = await this.redis.getdel(this.key(code));
    const failed = new AppException(
      HttpStatus.BAD_REQUEST,
      'googleFailed',
      'errors.auth.googleFailed',
    );
    if (!stored) throw failed;
    const { userId, challenge } = JSON.parse(stored) as {
      userId: string;
      challenge: string;
    };
    const given = createHash('sha256').update(verifier).digest('base64url');
    if (given !== challenge) throw failed;
    return userId;
  }

  private key(code: string): string {
    return `auth:app-code:${createHash('sha256').update(code).digest('hex')}`;
  }
}

import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';

/** A sign-up from an IP makes the next one from it within this window ask for the captcha. */
export const SIGNUP_MEMORY_SEC = 24 * 3600;
const TIMEOUT_MS = 10_000;
const key = (ip: string) => `signup:ip:${ip}`;

/**
 * Open registration without limits on newcomers: the first account from an IP is created
 * as is, another one from the same IP within a day has to pass Cloudflare Turnstile. Off without
 * TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY (a self-hosted instance may leave it so).
 */
@Injectable()
export class SignupCaptchaService {
  private readonly logger = new Logger(SignupCaptchaService.name);
  /** Public key for the widget; null = the captcha is off. */
  readonly siteKey: string | null;
  private readonly secret: string | null;
  private readonly verifyUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const site = config.get('TURNSTILE_SITE_KEY', { infer: true }) ?? null;
    const secret = config.get('TURNSTILE_SECRET_KEY', { infer: true }) ?? null;
    this.siteKey = site && secret ? site : null;
    this.secret = site && secret ? secret : null;
    this.verifyUrl = config.get('TURNSTILE_VERIFY_URL', { infer: true });
  }

  /** Before an account is created: a repeated sign-up from this IP must bring a valid token. */
  async check(
    ip: string | undefined,
    token: string | undefined,
  ): Promise<void> {
    if (!this.secret || !ip) return;
    const seen = await this.redis.exists(key(ip)).catch(() => 0);
    if (!seen) return;
    if (!token)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'captchaRequired',
        'errors.auth.captchaRequired',
      );
    if (!(await this.verify(token, ip)))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'captchaFailed',
        'errors.auth.captchaFailed',
      );
  }

  /** Every time, when the site has the widget: a new guest starting a deal. */
  async demand(
    ip: string | undefined,
    token: string | undefined,
  ): Promise<void> {
    if (!this.secret || !ip) return;
    if (!token)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'captchaRequired',
        'errors.auth.captchaRequired',
      );
    if (!(await this.verify(token, ip)))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'captchaFailed',
        'errors.auth.captchaFailed',
      );
  }

  /** After an account was created from this IP. */
  async remember(ip: string | undefined): Promise<void> {
    if (!this.secret || !ip) return;
    await this.redis
      .set(key(ip), '1', 'EX', SIGNUP_MEMORY_SEC)
      .catch(() => undefined);
  }

  /** Cloudflare's siteverify; tokens are single-use and live five minutes. */
  private async verify(token: string, ip: string): Promise<boolean> {
    try {
      const res = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: this.secret!,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
      } | null;
      return body?.success === true;
    } catch (err) {
      this.logger.error(`Turnstile unavailable: ${(err as Error).message}`);
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'captchaUnavailable',
        'errors.auth.captchaUnavailable',
      );
    }
  }
}

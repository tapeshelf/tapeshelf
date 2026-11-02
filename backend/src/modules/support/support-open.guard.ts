import { type CanActivate, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';

/**
 * No support on the public demo: its visitors write to the site's address, and the demo's
 * admin is not sent tickets of a database erased every day.
 */
@Injectable()
export class SupportOpenGuard implements CanActivate {
  private readonly demo: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.demo = config.get('DEMO_MODE', { infer: true });
  }

  canActivate(): boolean {
    if (this.demo)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'notFound',
        'errors.notFound',
      );
    return true;
  }
}

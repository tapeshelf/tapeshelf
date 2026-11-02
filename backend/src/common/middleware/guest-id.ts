import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';

import type { AppRequest } from '../auth/request-user.js';

export const GUEST_COOKIE = 'gid';
const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

/** Every visitor gets a stable anonymous id (used for guest playback tokens and rate limits). */
export function guestIdMiddleware(secure: boolean) {
  return (req: AppRequest, res: Response, next: NextFunction): void => {
    const existing = req.cookies?.[GUEST_COOKIE];
    if (typeof existing === 'string' && /^[0-9a-f-]{36}$/.test(existing)) {
      req.guestId = existing;
    } else {
      const id = randomUUID();
      req.guestId = id;
      res.cookie(GUEST_COOKIE, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: ONE_YEAR_MS,
      });
    }
    next();
  };
}

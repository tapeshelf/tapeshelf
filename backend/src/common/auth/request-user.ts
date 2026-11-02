import type { Request } from 'express';

import type {
  Locale,
  Role,
  Tier,
  UserStatus,
} from '../../generated/prisma/enums.js';

/** What guards attach to the request for an authenticated user. */
export interface RequestUser {
  id: string;
  role: Role;
  /** Effective tier: an expired PREMIUM is already BASIC. */
  tier: Tier;
  status: UserStatus;
  locale: Locale;
  emailVerified: boolean;
  sessionId: string;
  /** Set while an admin looks at the site as this user (read-only); the admin's id. */
  viewAsBy?: string;
  /**
   * An admin whose session has not passed the second step: `role` is USER until it has, and
   * the admin API answers twoFactorRequired.
   */
  adminLocked?: true;
  /**
   * Signed in with a connected app's token, not a session: only routes marked
   * @AppTokenAccess() take it, CSRF does not apply (no cookies), and there is no admin role.
   */
  appTokenId?: string;
  /**
   * An admin's account signed in where it has no admin powers — a connected app's token:
   * `role` stays USER, but its limits are still an admin's (no storage quota, no daily limit).
   */
  adminAccount?: true;
}

export interface AppRequest extends Request {
  user?: RequestUser;
  locale?: string;
  guestId?: string;
  cookies: Record<string, string>;
  signedCookies: Record<string, string | false>;
}

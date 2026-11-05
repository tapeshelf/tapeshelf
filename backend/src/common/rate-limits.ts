import { Throttle } from '@nestjs/throttler';

const MIN = 60_000;

/**
 * Every rate limit of the API in one table: requests per window, counted per user for
 * signed-in requests and per IP for guests. A signed-in user gets `limit × apiRateMultiplier` of
 * their tier (PlanThrottlerGuard); `default` covers every route without its own entry.
 */
export const RATE_LIMITS = {
  default: { limit: 300, ttl: MIN },

  register: { limit: 5, ttl: MIN },
  login: { limit: 20, ttl: MIN },
  refresh: { limit: 60, ttl: MIN },
  verifyEmail: { limit: 10, ttl: MIN },
  resendVerification: { limit: 3, ttl: 15 * MIN },
  forgotPassword: { limit: 5, ttl: 15 * MIN },
  resetPassword: { limit: 10, ttl: MIN },
  googleStart: { limit: 10, ttl: MIN },
  googleComplete: { limit: 10, ttl: MIN },
  /** The phone app picking up a sign-in the browser handed over. */
  appExchange: { limit: 10, ttl: MIN },
  /** The phone app saying where its pushes go (at each start, and when the address changes). */
  deviceRegister: { limit: 20, ttl: MIN },
  /** A phone fetching what a push said, or asking for news by itself. */
  devicePushes: { limit: 120, ttl: MIN },
  deleteAccount: { limit: 5, ttl: MIN },
  /** A link in a mail, signed: enough for a person and a mail provider behind one address. */
  unsubscribe: { limit: 30, ttl: MIN },
  /** Codes, passkeys and the password of the two-step sign-in; misses lock it besides. */
  twoFactor: { limit: 10, ttl: MIN },

  profileImage: { limit: 20, ttl: MIN },
  uploadStart: { limit: 30, ttl: MIN },
  uploadParts: { limit: 120, ttl: MIN },
  uploadComplete: { limit: 30, ttl: MIN },
  playback: { limit: 60, ttl: MIN },
  streamKey: { limit: 120, ttl: MIN },
  /** The phone app saving a video for watching without a network, or renewing its links. */
  offlineSave: { limit: 60, ttl: MIN },
  /** What saving would take, before the phone asks the person. */
  offlineQuote: { limit: 30, ttl: MIN },
  /** The phone checking its copies, when it comes back online. */
  offlineCheck: { limit: 12, ttl: MIN },
  download: { limit: 10, ttl: MIN },
  billingPortal: { limit: 10, ttl: MIN },
  downloadFile: { limit: 30, ttl: MIN },

  follow: { limit: 30, ttl: MIN },
  exchangeCreate: { limit: 30, ttl: MIN },
  chatSend: { limit: 60, ttl: MIN },
  report: { limit: 10, ttl: 60 * MIN },
  supportTicket: { limit: 10, ttl: 60 * MIN },
  supportMessage: { limit: 30, ttl: MIN },

  linkCreate: { limit: 20, ttl: MIN },
  linkUnlock: { limit: 10, ttl: MIN },
  linkCode: { limit: 10, ttl: 15 * MIN },
  linkDownload: { limit: 60, ttl: MIN },
  linkZip: { limit: 5, ttl: MIN },
  /** A guest starting a deal or opening one elsewhere; a day's starts are capped besides. */
  guestDeal: { limit: 10, ttl: MIN },
  /** The extension trading its sign-in code for a token, per IP. */
  appTokenExchange: { limit: 10, ttl: MIN },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** The route's own entry of RATE_LIMITS instead of `default`. */
export const RateLimit = (name: Exclude<RateLimitName, 'default'>) =>
  Throttle({ default: RATE_LIMITS[name] });

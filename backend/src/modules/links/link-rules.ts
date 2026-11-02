import type { AccessSource, UserStatus } from '../../generated/prisma/enums.js';
import { linkable } from '../access/access-policy.js';

/**
 * Temporary links: the rules both the links module and
 * the streaming of their videos follow. No I/O.
 */
export const LINK_TTLS = ['1h', '1d', '2d', '3d', '7d'] as const;
export type LinkTtl = (typeof LINK_TTLS)[number];

const HOUR_MS = 3600_000;
export const LINK_TTL_MS: Record<LinkTtl, number> = {
  '1h': HOUR_MS,
  '1d': 24 * HOUR_MS,
  '2d': 48 * HOUR_MS,
  '3d': 72 * HOUR_MS,
  '7d': 168 * HOUR_MS,
};

/** Videos in one link, links that still work per person. */
export const LINK_MAX_VIDEOS = 50;
export const LINK_MAX_ACTIVE = 100;
export const LINK_PASSWORD_MIN = 4;
export const LINK_PASSWORD_MAX = 64;

/** The emailed code: six digits, a quarter of an hour, five tries. */
export const LINK_CODE_TTL_SEC = 15 * 60;
export const LINK_CODE_TRIES = 5;
export const LINK_CODES_PER_HOUR = 5;

/** Expired and revoked links are kept this long (for "Opened" news to point somewhere), then erased. */
export const LINK_KEEP_DAYS = 30;

export interface LinkState {
  expiresAt: Date;
  revokedAt: Date | null;
  sender: { status: UserStatus };
}

/** A link opens while its time runs, nobody took it back and its sender is still with us. */
export function linkLive(link: LinkState, now = new Date()): boolean {
  return (
    link.revokedAt === null &&
    link.expiresAt > now &&
    link.sender.status === 'ACTIVE'
  );
}

export interface LinkVideoState {
  status: string;
  deletedAt: Date | null;
}

/**
 * A video stays in its link while it is ready (not deleted, not being edited) and its sender
 * still holds it in a way they may pass on: their upload or a copy they received.
 */
export function linkCarries(
  video: LinkVideoState,
  senderHolding: {
    holderId: string;
    source: AccessSource;
    hidden: boolean;
  } | null,
): boolean {
  return (
    video.deletedAt === null &&
    video.status === 'READY' &&
    linkable(senderHolding)
  );
}

/** "r•••@gmail.com": enough for the right person to recognise their address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

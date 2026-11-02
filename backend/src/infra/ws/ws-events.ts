import type { Redis } from 'ioredis';

/** Redis pub/sub channel through which any process (worker included) pushes events to a user's sockets. */
export const WS_CHANNEL = 'vs:ws';

/**
 * Why a handshake was refused (the client's `connect_error` message). `sessionExpired`: no live
 * access cookie or session — the client renews the session and connects again; `forbidden`: a
 * foreign Origin — nothing to retry.
 */
export const WS_CONNECT_ERROR = {
  sessionExpired: 'sessionExpired',
  forbidden: 'forbidden',
} as const;

export interface UserEventMessage {
  userId: string;
  event: string;
  payload: unknown;
}

export async function publishUserEvent(
  redis: Redis,
  message: UserEventMessage,
): Promise<void> {
  await redis.publish(WS_CHANNEL, JSON.stringify(message));
}

/**
 * Control message: the sessions of a user were revoked (logout, password change, ban, deletion).
 * The gateway drops the matching sockets: all of the user's, or only those of `sessionIds`, or all
 * but `exceptSessionId`. A socket cannot reconnect without a live session.
 */
export const SESSIONS_REVOKED = 'session.revoked';

export interface SessionsRevokedPayload {
  sessionIds?: string[];
  exceptSessionId?: string;
}

export async function publishSessionsRevoked(
  redis: Redis,
  userId: string,
  payload: SessionsRevokedPayload = {},
): Promise<void> {
  await publishUserEvent(redis, {
    userId,
    event: SESSIONS_REVOKED,
    payload,
  }).catch(() => undefined);
}

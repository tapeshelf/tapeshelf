import { createHmac, timingSafeEqual } from 'node:crypto';

import type { NotificationType } from '../../generated/prisma/enums.js';
import { NOTIFICATION_TYPES } from './notification.types.js';

/** Keeps this signature from ever passing for anything else signed with the same secret. */
const CONTEXT = 'mail-unsubscribe:v1:';

const sign = (secret: string, body: string): string =>
  createHmac('sha256', secret)
    .update(CONTEXT + body)
    .digest('base64url');

/**
 * What a link in a mail carries: this person, this type of email, signed. It can do one
 * thing, turn that email off or on, and never expires: a mail may be opened years later.
 */
export function unsubscribeToken(
  secret: string,
  userId: string,
  type: NotificationType,
): string {
  const body = Buffer.from(`${userId}:${type}`).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function readUnsubscribeToken(
  secret: string,
  token: unknown,
): { userId: string; type: NotificationType } | null {
  if (typeof token !== 'string' || token.length > 300) return null;
  const [body, signature, ...rest] = token.split('.');
  if (!body || !signature || rest.length) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  const [userId, type] = Buffer.from(body, 'base64url').toString().split(':');
  if (!userId || !NOTIFICATION_TYPES.includes(type as NotificationType))
    return null;
  return { userId, type: type as NotificationType };
}

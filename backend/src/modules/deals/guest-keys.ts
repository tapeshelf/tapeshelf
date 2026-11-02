import { createHash, hkdfSync, randomBytes } from 'node:crypto';

import { seal, unseal } from '../auth/two-factor/two-factor-crypto.js';

/** A guest's browser carries their key: all a guest is, without an account. */
export const GUEST_COOKIE = 'vs_guest';
export const GUEST_COOKIE_PATH = '/api';
export const GUEST_COOKIE_MAX_AGE_MS = 400 * 24 * 3600 * 1000;

/** Ghost accounts are named so no person can take the name: a person's username has no dash. */
export const GUEST_USERNAME_PREFIX = 'guest-';

export function isGuestUsername(username: string): boolean {
  return username.startsWith(GUEST_USERNAME_PREFIX);
}

export function newGuestKey(): string {
  return randomBytes(24).toString('base64url');
}

export function hashGuestKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The key that seals guests' keys for the mails that lead back to their deal, from KEK. */
export function guestKeyBox(kekHex: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(kekHex, 'hex'),
      'tapeshelf-guest',
      'guest-key',
      32,
    ),
  );
}

export function sealGuestKey(box: Buffer, key: string): string {
  return seal(box, key);
}

export function unsealGuestKey(box: Buffer, sealed: string): string {
  return unseal(box, sealed);
}

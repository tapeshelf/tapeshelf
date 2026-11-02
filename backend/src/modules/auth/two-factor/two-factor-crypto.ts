import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomInt,
  randomBytes,
} from 'node:crypto';

/**
 * Keys of the two-step sign-in, derived from KEK like the videos' keys: a copy of
 * the database alone neither reads an app's secret nor checks a recovery code offline.
 */
export function twoFactorKeys(kekHex: string): {
  secret: Buffer;
  codes: Buffer;
} {
  const kek = Buffer.from(kekHex, 'hex');
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', kek, 'tapeshelf-2fa', info, 32));
  return { secret: derive('totp-secret'), codes: derive('recovery-codes') };
}

/** AES-256-GCM: `v1.<iv>.<tag>.<data>`, base64url. */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function unseal(key: Buffer, sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('unknown sealed format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** 32 signs without 0/O and 1/I: a code read off paper is typed back right. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const RECOVERY_CODES = 10;

/** `XXXXX-XXXXX`: 50 random bits. */
export function newRecoveryCode(): string {
  const signs = Array.from(
    { length: 10 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
  return `${signs.slice(0, 5)}-${signs.slice(5)}`;
}

/** Case, spaces and dashes do not matter. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function hashRecoveryCode(key: Buffer, code: string): string {
  return createHmac('sha256', key)
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}

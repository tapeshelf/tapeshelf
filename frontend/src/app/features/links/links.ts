import type { LinkTtl } from '../../api';

/** The terms a temporary link can have, shortest first; three days unless chosen. */
export const LINK_TTLS: readonly LinkTtl[] = ['1h', '1d', '2d', '3d', '7d'];
export const DEFAULT_TTL: LinkTtl = '3d';
export const LINK_PASSWORD_MIN = 4;
export const LINK_PASSWORD_MAX = 64;

/** A video offered for a link: what the dialog shows of it. */
export interface LinkCandidate {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/** Letters and digits that cannot be mistaken for each other (no i, l, o, 0, 1). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** "kx7q-m2pz-r9tf": twelve characters in groups of four, easy to read out and type. */
export function generatePassword(
  random: (count: number) => ArrayLike<number> = (count) =>
    crypto.getRandomValues(new Uint8Array(count)),
): string {
  const chars = Array.from(random(12), (b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Where the link opens. */
export function linkUrl(code: string): string {
  return `${location.origin}/t/${code}`;
}

/** Time left as whole days and a "hh:mm:ss" clock; nothing left is zero. */
export function timeLeft(ms: number): { days: number; clock: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const rest = total % 86_400;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    days,
    clock: `${pad(Math.floor(rest / 3600))}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`,
  };
}

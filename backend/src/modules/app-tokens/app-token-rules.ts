import { createHash, randomBytes } from 'node:crypto';

/**
 * Connected apps: the browser extension gets a token by the OAuth authorization-code flow
 * with PKCE, in the browser's own sign-in window (chrome.identity.launchWebAuthFlow). These are its
 * rules, apart from the database and Redis.
 */

/** Tokens start with this, so they are recognised (and found by secret scanners) at a glance. */
export const APP_TOKEN_PREFIX = 'tsa_';
/** A code lives this long between "Connect" and the extension exchanging it. */
export const CODE_TTL_SEC = 300;
/** Connected apps one person may have at once; the oldest is disconnected past this. */
export const MAX_APP_TOKENS = 20;
export const NAME_MAX = 80;

const b64url = (b: Buffer) => b.toString('base64url');

export function newAppToken(): string {
  return APP_TOKEN_PREFIX + b64url(randomBytes(32));
}

export function newCode(): string {
  return b64url(randomBytes(32));
}

export function hashAppToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** The token of `Authorization: Bearer tsa_…`, or null for anything else. */
export function readBearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(tsa_[A-Za-z0-9_-]{20,100})\s*$/.exec(header ?? '');
  return m ? m[1]! : null;
}

/**
 * Where the sign-in window may send the code: the address the browser gives an extension for
 * launchWebAuthFlow — https://<extension id>.chromiumapp.org/… in Chrome, Edge, Brave and Opera,
 * https://<40 hex>.extensions.allizom.org/… in Firefox. Nothing else: a code must not
 * leave for a site.
 */
export function isExtensionRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    (/^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname) ||
      /^[\da-f]{40}\.extensions\.allizom\.org$/.test(url.hostname)) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  );
}

/** PKCE S256: the challenge is base64url(SHA-256(verifier)), the verifier 43–128 unreserved characters. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return b64url(createHash('sha256').update(verifier).digest()) === challenge;
}

/** Midnight UTC of `now`'s day: the extension's daily limit counts from here. */
export function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

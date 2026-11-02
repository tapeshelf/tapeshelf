import { createHash } from 'node:crypto';

import {
  hashAppToken,
  isExtensionRedirect,
  newAppToken,
  pkceMatches,
  readBearer,
  startOfUtcDay,
} from './app-token-rules.js';

describe('app token rules', () => {
  it('a token is tsa_ and 43 base64url characters, read back from the header', () => {
    const token = newAppToken();
    expect(token).toMatch(/^tsa_[A-Za-z0-9_-]{43}$/);
    expect(readBearer(`Bearer ${token}`)).toBe(token);
    expect(readBearer(`bearer ${token}`)).toBeNull();
    expect(readBearer('Bearer abc')).toBeNull();
    expect(readBearer(undefined)).toBeNull();
    expect(hashAppToken(token)).toHaveLength(64);
  });

  it('the code goes only to an extension’s chromiumapp.org address', () => {
    const id = 'abcdefghijklmnopabcdefghijklmnop';
    expect(isExtensionRedirect(`https://${id}.chromiumapp.org/`)).toBe(true);
    expect(isExtensionRedirect(`https://${id}.chromiumapp.org/cb`)).toBe(true);
    for (const bad of [
      `http://${id}.chromiumapp.org/`,
      `https://${id}.chromiumapp.org.evil.com/`,
      `https://evil.com/${id}.chromiumapp.org/`,
      `https://${id}.chromiumapp.org/?x=1`,
      `https://${id}.chromiumapp.org/#x`,
      `https://${id}.chromiumapp.org:444/`,
      `https://user@${id}.chromiumapp.org/`,
      `https://zz${id.slice(2)}.chromiumapp.org/`,
      'https://example.chromiumapp.org/',
      'not a url',
    ])
      expect(isExtensionRedirect(bad)).toBe(false);
  });

  it('…and to a Firefox extension’s extensions.allizom.org address', () => {
    const hash = 'f5b5d7a2c4e6f8091a2b3c4d5e6f708192a3b4c5';
    expect(isExtensionRedirect(`https://${hash}.extensions.allizom.org/`)).toBe(
      true,
    );
    for (const bad of [
      `http://${hash}.extensions.allizom.org/`,
      `https://${hash}.extensions.allizom.org.evil.com/`,
      `https://${hash.slice(1)}.extensions.allizom.org/`,
      `https://${hash}.extensions.allizom.org/?x=1`,
      'https://evil.extensions.allizom.org/',
    ])
      expect(isExtensionRedirect(bad)).toBe(false);
  });

  it('PKCE S256: the verifier must hash to the challenge', () => {
    const verifier = 'a'.repeat(43) + '-._~';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier + 'x', challenge)).toBe(false);
    expect(
      pkceMatches(
        'short',
        createHash('sha256').update('short').digest('base64url'),
      ),
    ).toBe(false);
  });

  it('the day starts at midnight UTC', () => {
    expect(
      startOfUtcDay(new Date('2026-10-26T23:59:59+01:00')).toISOString(),
    ).toBe('2026-10-26T00:00:00.000Z');
    expect(
      startOfUtcDay(new Date('2026-10-27T00:30:00+01:00')).toISOString(),
    ).toBe('2026-10-26T00:00:00.000Z');
  });
});

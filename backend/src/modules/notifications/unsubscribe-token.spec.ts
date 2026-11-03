import { describe, expect, it } from 'vitest';

import { readUnsubscribeToken, unsubscribeToken } from './unsubscribe-token.js';

const SECRET = 's'.repeat(40);
const USER = '0190a1b2-0000-7000-8000-000000000001';

describe('the unsubscribe token', () => {
  it('reads back who and what it was signed for', () => {
    const t = unsubscribeToken(SECRET, USER, 'NEW_MESSAGE');
    expect(readUnsubscribeToken(SECRET, t)).toEqual({
      userId: USER,
      type: 'NEW_MESSAGE',
    });
  });

  it('fails when the other part is changed, the secret differs or it is not a token', () => {
    const t = unsubscribeToken(SECRET, USER, 'NEW_MESSAGE');
    const other = unsubscribeToken(SECRET, USER, 'ADMIN_NOTICE');
    expect(readUnsubscribeToken('o'.repeat(40), t)).toBeNull();
    expect(
      readUnsubscribeToken(SECRET, `${other.split('.')[0]}.${t.split('.')[1]}`),
    ).toBeNull();
    for (const bad of ['', 'a.b', 'a.b.c', undefined, 5, 'x'.repeat(400)])
      expect(readUnsubscribeToken(SECRET, bad)).toBeNull();
  });
});

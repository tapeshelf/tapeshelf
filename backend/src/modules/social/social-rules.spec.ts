import {
  type RelationFacts,
  orderedPair,
  previewOf,
  relationView,
  sendBlocker,
} from './social-rules.js';

const base: RelationFacts = {
  following: false,
  followedBy: false,
  viewerBlocked: false,
  blockedByTarget: false,
  targetActive: true,
};

describe('relationView', () => {
  it.each<
    [string, Partial<RelationFacts>, Partial<ReturnType<typeof relationView>>]
  >([
    ['strangers', {}, { friends: false, canFollow: true, canMessage: false }],
    [
      'I follow',
      { following: true },
      { following: true, canFollow: false, canMessage: false },
    ],
    [
      'they follow me',
      { followedBy: true },
      { followsYou: true, canFollow: true, canMessage: false },
    ],
    [
      'friends',
      { following: true, followedBy: true },
      { friends: true, canMessage: true },
    ],
    [
      'I blocked them',
      { viewerBlocked: true, followedBy: true },
      { blocked: true, canFollow: false, canMessage: false, followsYou: false },
    ],
    [
      'they blocked me: nothing reveals it',
      { blockedByTarget: true, following: true, followedBy: true },
      { blocked: false, friends: false, canFollow: false, canMessage: false },
    ],
    [
      'banned or deleted target',
      { targetActive: false, following: true, followedBy: true },
      { canFollow: false, canMessage: false },
    ],
  ])('%s', (_name, facts, expected) => {
    expect(relationView({ ...base, ...facts })).toMatchObject(expected);
  });
});

describe('sendBlocker', () => {
  it.each([
    [{ otherActive: true, mutual: true, blockedEither: false }, null],
    [{ otherActive: true, mutual: false, blockedEither: false }, 'notFriends'],
    [{ otherActive: true, mutual: true, blockedEither: true }, 'notFriends'],
    [{ otherActive: false, mutual: true, blockedEither: false }, 'unavailable'],
  ] as const)('%j → %s', (facts, expected) => {
    expect(sendBlocker(facts)).toBe(expected);
  });
});

describe('helpers', () => {
  it('orders a pair the same way whichever side starts', () => {
    const a = '0199d1c0-0000-7000-8000-000000000001';
    const b = '0199d1c0-0000-7000-8000-000000000002';
    expect(orderedPair(a, b)).toEqual([a, b]);
    expect(orderedPair(b, a)).toEqual([a, b]);
  });

  it('builds one-line previews', () => {
    expect(previewOf('  hello\n\nthere  ')).toBe('hello there');
    expect(previewOf('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

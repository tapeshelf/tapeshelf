import {
  type RuleOffer,
  type RuleRequest,
  actionsFor,
  lossOutcome,
  roleOf,
  splitItems,
  validateOfferShape,
} from './exchange-rules.js';

const H = 'holder-id';
const R = 'requester-id';
const X = 'someone-else';

function request(over: Partial<RuleRequest> = {}): RuleRequest {
  return {
    id: 'req',
    requesterId: R,
    holderId: H,
    status: 'OPEN',
    round: 0,
    currentOfferId: 'o0',
    awaitingUserId: H,
    ...over,
  };
}

describe('exchange rules', () => {
  it('knows the roles', () => {
    expect(roleOf(request(), H)).toBe('holder');
    expect(roleOf(request(), R)).toBe('requester');
    expect(roleOf(request(), X)).toBe('none');
  });

  it.each([
    [
      'round 0, holder awaiting',
      request(),
      H,
      ['share', 'block', 'accept', 'decline', 'counter'],
    ],
    ['round 0, requester', request(), R, ['cancel']],
    [
      'round 1, requester awaiting',
      request({ round: 1, awaitingUserId: R }),
      R,
      ['cancel', 'accept', 'decline', 'counter'],
    ],
    [
      'round 1, holder not awaiting',
      request({ round: 1, awaitingUserId: R }),
      H,
      ['share', 'block'],
    ],
    ['stranger', request(), X, []],
    ['closed', request({ status: 'ACCEPTED', awaitingUserId: null }), H, []],
    ['declined', request({ status: 'DECLINED', awaitingUserId: null }), R, []],
  ] as const)('%s', (_name, req, user, expected) => {
    expect(actionsFor(req, user)).toEqual(expected);
  });

  it('validates offer shapes per round', () => {
    expect(
      validateOfferShape({ holderGives: ['a'], requesterGives: [] }, 0, 20),
    ).toBeNull();
    expect(
      validateOfferShape({ holderGives: [], requesterGives: [] }, 0, 20),
    ).toBe('emptyHolderSide');
    expect(
      validateOfferShape({ holderGives: ['a'], requesterGives: [] }, 1, 20),
    ).toBe('emptyRequesterSide');
    expect(
      validateOfferShape({ holderGives: ['a'], requesterGives: ['b'] }, 1, 20),
    ).toBeNull();
    expect(
      validateOfferShape({ holderGives: ['a'], requesterGives: ['a'] }, 1, 20),
    ).toBe('duplicateVideo');
    expect(
      validateOfferShape(
        { holderGives: ['a', 'b'], requesterGives: ['c'] },
        1,
        2,
      ),
    ).toBe('tooManyVideos');
  });

  it('splits items by side', () => {
    expect(
      splitItems([
        { videoId: 'a', givingSide: 'HOLDER' },
        { videoId: 'b', givingSide: 'REQUESTER' },
      ]),
    ).toEqual({ holderGives: ['a'], requesterGives: ['b'] });
  });

  describe('losing a video', () => {
    const round0 = ['a', 'b'];
    const offer = (round: number, items: RuleOffer['items']): RuleOffer => ({
      id: 'o',
      round,
      proposedById: round === 0 ? R : H,
      status: 'PENDING',
      items,
    });
    const r0items: RuleOffer['items'] = [
      { videoId: 'a', givingSide: 'HOLDER' },
      { videoId: 'b', givingSide: 'HOLDER' },
    ];

    it('ignores unrelated videos and closed requests', () => {
      expect(
        lossOutcome(request(), offer(0, r0items), round0, new Set(['zzz'])),
      ).toEqual({ kind: 'none' });
      expect(
        lossOutcome(
          request({ status: 'ACCEPTED' }),
          offer(0, r0items),
          round0,
          new Set(['a']),
        ),
      ).toEqual({ kind: 'none' });
    });

    it('invalidates when every requested video is gone', () => {
      expect(
        lossOutcome(request(), offer(0, r0items), round0, new Set(['a', 'b'])),
      ).toEqual({
        kind: 'invalidate',
      });
    });

    it('drops a lost video from round 0 and keeps going', () => {
      expect(
        lossOutcome(request(), offer(0, r0items), round0, new Set(['b'])),
      ).toEqual({
        kind: 'reset',
        keepRound0: ['a'],
        voidCurrent: false,
      });
    });

    it('voids a counter-offer that contains the lost video and falls back to round 0', () => {
      const counter = offer(1, [
        { videoId: 'a', givingSide: 'HOLDER' },
        { videoId: 'x', givingSide: 'REQUESTER' },
      ]);
      expect(
        lossOutcome(
          request({ round: 1, awaitingUserId: R }),
          counter,
          round0,
          new Set(['x']),
        ),
      ).toEqual({
        kind: 'reset',
        keepRound0: ['a', 'b'],
        voidCurrent: true,
      });
      // The round-0 request loses a video that the counter-offer does not mention: no void, just trimming.
      expect(
        lossOutcome(
          request({ round: 1, awaitingUserId: R }),
          counter,
          round0,
          new Set(['b']),
        ),
      ).toEqual({
        kind: 'reset',
        keepRound0: ['a'],
        voidCurrent: false,
      });
    });
  });
});

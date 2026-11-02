import type {
  GivingSide,
  OfferStatus,
  RequestStatus,
} from '../../generated/prisma/enums.js';

/**
 * Pure rules of the negotiation state machine. No I/O: the
 * service loads the request with its current offer and asks these functions; table tests cover them.
 */

export interface RuleRequest {
  id: string;
  requesterId: string;
  holderId: string;
  status: RequestStatus;
  round: number;
  currentOfferId: string | null;
  awaitingUserId: string | null;
}

export interface RuleItem {
  videoId: string;
  givingSide: GivingSide;
}

export interface RuleOffer {
  id: string;
  round: number;
  proposedById: string;
  status: OfferStatus;
  items: RuleItem[];
}

export type Role = 'holder' | 'requester' | 'none';

export type RequestAction =
  'share' | 'block' | 'accept' | 'decline' | 'counter' | 'cancel';

export const REQUEST_ACTIONS: RequestAction[] = [
  'share',
  'block',
  'accept',
  'decline',
  'counter',
  'cancel',
];

export function roleOf(request: RuleRequest, userId: string): Role {
  if (request.holderId === userId) return 'holder';
  if (request.requesterId === userId) return 'requester';
  return 'none';
}

export function isOpen(request: RuleRequest): boolean {
  return request.status === 'OPEN';
}

/** Everything `userId` may do right now. */
export function actionsFor(
  request: RuleRequest,
  userId: string,
): RequestAction[] {
  if (!isOpen(request)) return [];
  const role = roleOf(request, userId);
  const out: RequestAction[] = [];
  if (role === 'holder') out.push('share', 'block');
  if (role === 'requester') out.push('cancel');
  if (role !== 'none' && request.awaitingUserId === userId)
    out.push('accept', 'decline', 'counter');
  return out;
}

export function canDo(
  request: RuleRequest,
  userId: string,
  action: RequestAction,
): boolean {
  return actionsFor(request, userId).includes(action);
}

export interface OfferDraft {
  holderGives: string[];
  requesterGives: string[];
}

export type OfferProblem =
  'emptyHolderSide' | 'emptyRequesterSide' | 'duplicateVideo' | 'tooManyVideos';

/**
 * Shape rules of an offer: round 0 lists what the holder gives
 * and, if the requester offers something from the start, what they give; later rounds need
 * at least one video on each side. Ownership and state are checked by the service against the
 * database.
 */
export function validateOfferShape(
  draft: OfferDraft,
  round: number,
  maxVideos: number,
): OfferProblem | null {
  const all = [...draft.holderGives, ...draft.requesterGives];
  if (new Set(all).size !== all.length) return 'duplicateVideo';
  if (all.length > maxVideos) return 'tooManyVideos';
  if (draft.holderGives.length === 0) return 'emptyHolderSide';
  if (round > 0 && draft.requesterGives.length === 0)
    return 'emptyRequesterSide';
  return null;
}

/** Items of an offer split by side. */
export function splitItems(items: RuleItem[]): OfferDraft {
  return {
    holderGives: items
      .filter((i) => i.givingSide === 'HOLDER')
      .map((i) => i.videoId),
    requesterGives: items
      .filter((i) => i.givingSide === 'REQUESTER')
      .map((i) => i.videoId),
  };
}

export type LossOutcome =
  | { kind: 'none' }
  /** Everything requested in round 0 is gone: the request closes. */
  | { kind: 'invalidate' }
  /** Lost videos leave the round-0 offer; a later-round offer is voided and the negotiation returns to round 0. */
  | { kind: 'reset'; keepRound0: string[]; voidCurrent: boolean };

/**
 * a video of the current offer was deleted or its side no longer holds it.
 * `round0Gives` are the holder-side videos of round 0, `lost` the ids no longer available.
 */
export function lossOutcome(
  request: RuleRequest,
  currentOffer: RuleOffer,
  round0Gives: string[],
  lost: ReadonlySet<string>,
): LossOutcome {
  if (!isOpen(request)) return { kind: 'none' };
  const keepRound0 = round0Gives.filter((id) => !lost.has(id));
  const currentHit = currentOffer.items.some((i) => lost.has(i.videoId));
  if (!currentHit && keepRound0.length === round0Gives.length)
    return { kind: 'none' };
  if (keepRound0.length === 0) return { kind: 'invalidate' };
  return {
    kind: 'reset',
    keepRound0,
    voidCurrent: currentOffer.round > 0 && currentHit,
  };
}

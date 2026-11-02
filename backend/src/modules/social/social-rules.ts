/**
 * Pure rules of the social graph.
 * "Add as friend" is a follow; two follows in opposite directions make friends.
 */

/** What the database says about a viewer and another user. */
export interface RelationFacts {
  /** The viewer follows the target. */
  following: boolean;
  /** The target follows the viewer. */
  followedBy: boolean;
  /** The viewer blocked the target. */
  viewerBlocked: boolean;
  /** The target blocked the viewer. Never shown to the viewer. */
  blockedByTarget: boolean;
  /** The target account is ACTIVE (not banned, not deleted). */
  targetActive: boolean;
}

export interface RelationView {
  following: boolean;
  followsYou: boolean;
  friends: boolean;
  /** The viewer blocked this user (shown so they can unblock). */
  blocked: boolean;
  canFollow: boolean;
  canMessage: boolean;
}

/**
 * What the viewer sees and may do. A block in either direction removes follow and message
 * actions; only the viewer's own block is visible, so the blocked side just finds no buttons.
 */
export function relationView(f: RelationFacts): RelationView {
  const blockedEither = f.viewerBlocked || f.blockedByTarget;
  // Follows are deleted when a block is created, but stay defensive about stale rows.
  const following = f.following && !blockedEither;
  const followsYou = f.followedBy && !blockedEither && !f.blockedByTarget;
  const friends = following && followsYou;
  return {
    following,
    followsYou,
    friends,
    blocked: f.viewerBlocked,
    canFollow: f.targetActive && !following && !blockedEither,
    canMessage: f.targetActive && friends,
  };
}

export type SendBlocker = 'notFriends' | 'unavailable';

/**
 * Whether a message may be sent: only between friends, both accounts active, no block.
 * A block also ends the friendship, so the blocked side gets the same "not friends" answer and
 * learns nothing about the block. History always stays readable.
 */
export function sendBlocker(f: {
  otherActive: boolean;
  mutual: boolean;
  blockedEither: boolean;
}): SendBlocker | null {
  if (!f.otherActive) return 'unavailable';
  if (!f.mutual || f.blockedEither) return 'notFriends';
  return null;
}

/** A conversation row stores the pair in a fixed order, so one pair has exactly one row. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export const MESSAGE_MAX = 4000;
export const PREVIEW_MAX = 140;

/** One-line preview of a message for lists, notifications and emails. */
export function previewOf(body: string, max = PREVIEW_MAX): string {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

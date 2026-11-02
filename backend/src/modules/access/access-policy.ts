import type {
  AccessSource,
  Role,
  Tier,
  UserStatus,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';

/**
 * Pure access rules. No I/O: callers load the viewer, the video
 * and the relevant holdings and ask these functions. Admin bypass lives only here.
 */

export interface PolicyViewer {
  id: string;
  role: Role;
  tier: Tier;
}

/** `null` is a guest. */
export type Viewer = PolicyViewer | null;

export interface PolicyVideo {
  id: string;
  authorId: string;
  visibility: Visibility;
  status: VideoStatus;
  deletedAt: Date | null;
  /** Files erased from storage (admin trash); unknown when the caller did not load it. */
  purgedAt?: Date | null;
}

export interface PolicyHolding {
  holderId: string;
  source: AccessSource;
  hidden: boolean;
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer?.role === 'ADMIN';
}

function isAuthor(viewer: Viewer, video: PolicyVideo): boolean {
  return !!viewer && viewer.id === video.authorId;
}

function holds(viewer: Viewer, holding: PolicyHolding | null): boolean {
  return !!viewer && !!holding && holding.holderId === viewer.id;
}

/** Deleted videos exist only for the admin trash; everywhere else they are gone. */
export function isAvailable(video: PolicyVideo): boolean {
  return video.deletedAt === null;
}

/**
 * The admin may still watch a video in the trash while its files are there, to
 * judge before erasing or restoring it. Nothing else opens up: no download, no management.
 */
function adminWatchesTrash(viewer: Viewer, video: PolicyVideo): boolean {
  return isAdmin(viewer) && video.deletedAt !== null && video.purgedAt === null;
}

/** May the viewer see the video itself (player, download link...), not just its contact sheet. */
export function canView(
  viewer: Viewer,
  video: PolicyVideo,
  viewerHolding: PolicyHolding | null,
): boolean {
  if (!isAvailable(video)) return adminWatchesTrash(viewer, video);
  if (
    isAdmin(viewer) ||
    isAuthor(viewer, video) ||
    holds(viewer, viewerHolding)
  )
    return true;
  return video.visibility === 'PUBLIC' && video.status === 'READY';
}

export function canStream(
  viewer: Viewer,
  video: PolicyVideo,
  viewerHolding: PolicyHolding | null,
): boolean {
  return video.status === 'READY' && canView(viewer, video, viewerHolding);
}

/**
 * anyone signed in who may watch the video — its author,
 * every holder (bookmarks included) and, for a public video, everyone; guests never. How fast and
 * how often is a matter of the tier, not of access.
 */
export function canDownload(
  viewer: Viewer,
  video: PolicyVideo,
  viewerHolding: PolicyHolding | null,
): boolean {
  if (!viewer) return false;
  if (isAdmin(viewer)) return isAvailable(video) && video.status === 'READY';
  return canStream(viewer, video, viewerHolding);
}

/** Bookmark a public video (no daily limit). */
export function canAddToCollection(
  viewer: Viewer,
  video: PolicyVideo,
  viewerHolding: PolicyHolding | null,
): boolean {
  if (!viewer || !isAvailable(video)) return false;
  if (isAuthor(viewer, video) || holds(viewer, viewerHolding)) return false;
  return video.visibility === 'PUBLIC' && video.status === 'READY';
}

/** Edit metadata, change visibility, delete. */
export function canManage(viewer: Viewer, video: PolicyVideo): boolean {
  if (!isAvailable(video)) return false;
  return isAdmin(viewer) || isAuthor(viewer, video);
}

/**
 * The video editor: an author with Pro (everyone on a self-hosted instance, which
 * has no tiers) edits their own ready videos; an admin edits any.
 */
export function canEditVideo(
  viewer: Viewer,
  video: PolicyVideo,
  hasTiers: boolean,
): boolean {
  return video.status === 'READY' && canUseEditor(viewer, video, hasTiers);
}

/** The same right, whatever the video's state: its editor also follows an edit under way. */
export function canUseEditor(
  viewer: Viewer,
  video: PolicyVideo,
  hasTiers: boolean,
): boolean {
  if (!viewer || !isAvailable(video)) return false;
  if (isAdmin(viewer)) return true;
  return isAuthor(viewer, video) && (!hasTiers || viewer.tier === 'PREMIUM');
}

/**
 * Hide/show from visitors: any holding of one's own, the author's too ("only for
 * me"): a hidden video is not on the shelf, cannot be requested from it, and
 * followers do not learn of it.
 */
export function canHide(
  viewer: Viewer,
  holding: PolicyHolding | null,
): boolean {
  return holds(viewer, holding);
}


/**
 * Whether a holding shown on `holder`'s page is visible to this viewer: hidden and unfinished items only for the holder (and admins); a bookmark
 * of a public video only while it stays public.
 */
export function holdingVisibleTo(
  viewer: Viewer,
  video: PolicyVideo,
  pageHolding: PolicyHolding,
): boolean {
  if (!isAvailable(video)) {
    return false;
  }
  if (holds(viewer, pageHolding) || isAdmin(viewer)) return true;
  if (pageHolding.hidden) return false;
  if (video.status !== 'READY') return false;
  if (pageHolding.source === 'PUBLIC_ADD' && video.visibility !== 'PUBLIC')
    return false;
  return true;
}

export type RequestBlocker =
  'guest' | 'ownPage' | 'bookmark' | 'notReady' | 'hidden' | 'alreadyWatchable';

/**
 * Static part of `canRequest`; blocks, open requests, cooldown and the daily limit come on top. Returns the first reason the button must not be offered, or null.
 */
export function requestBlocker(
  viewer: Viewer,
  video: PolicyVideo,
  pageHolding: PolicyHolding,
  viewerHolding: PolicyHolding | null,
): RequestBlocker | null {
  if (!viewer) return 'guest';
  if (viewer.id === pageHolding.holderId) return 'ownPage';
  if (canView(viewer, video, viewerHolding)) return 'alreadyWatchable';
  if (video.status !== 'READY' || !isAvailable(video)) return 'notReady';
  if (pageHolding.hidden) return 'hidden';
  if (pageHolding.source === 'PUBLIC_ADD') return 'bookmark';
  return null;
}

/** What decides whether someone's page shows. */
export interface PolicyPageOwner {
  id: string;
  status: UserStatus;
  pageHidden: boolean;
}

/**
 * A user page (and everything in its context: the shelf, the lists, the copies on it) exists only
 * for active accounts; a page its owner hid only for them and
 * for admins. A viewer reading "as a guest" (`X-As-Guest`) or an admin looking as someone else is
 * that guest or that someone here, so the owner previewing their page gets the 404 too.
 */
export function pageVisible(owner: PolicyPageOwner, viewer: Viewer): boolean {
  if (owner.status !== 'ACTIVE') return false;
  return !owner.pageHidden || viewer?.id === owner.id || isAdmin(viewer);
}

/**
 * Who may hide their page: Pro and admins; on a self-hosted instance, which has
 * no tiers, everyone. `tier` is the effective one (an expired Pro is already Free).
 */
export function canHidePage(user: PolicyViewer, hasTiers: boolean): boolean {
  return !hasTiers || isAdmin(user) || user.tier === 'PREMIUM';
}

/**
 * Who may make anonymous links to their shelf, and whose links open at all: Pro and admins;
 * on a self-hosted instance, which has no tiers, everyone. `tier` is the effective one.
 */
export function canMakeAnonymousLinks(
  user: PolicyViewer,
  hasTiers: boolean,
): boolean {
  return !hasTiers || isAdmin(user) || user.tier === 'PREMIUM';
}

/**
 * Who may protect a temporary link with a password (the links themselves are for everyone):
 * Pro and admins; on a self-hosted instance, which has no tiers, everyone. `tier` is the
 * effective one.
 */
export function canProtectLinks(
  user: PolicyViewer,
  hasTiers: boolean,
): boolean {
  return !hasTiers || isAdmin(user) || user.tier === 'PREMIUM';
}

/** What a temporary link may carry (as in an exchange): never a bookmark. */
export function linkable(holding: PolicyHolding | null): boolean {
  return !!holding && holding.source !== 'PUBLIC_ADD';
}

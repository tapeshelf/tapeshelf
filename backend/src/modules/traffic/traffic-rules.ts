/** The same person watching the same video again within this window spends nothing. */
export const VIEW_WINDOW_SEC = 24 * 3600;
/** The same download again within this window spends nothing: a retry, as for the count. */
export const DOWNLOAD_WINDOW_SEC = 3600;

/**
 * What a view costs: what the player streams, the whole of it however much is watched. Files
 * packaged before this was measured count by the file they came from.
 */
export function playbackSize(video: {
  playbackBytes: bigint | null;
  renderBytes: bigint | null;
  sizeBytes: bigint;
}): number {
  return Number(video.playbackBytes ?? video.renderBytes ?? video.sizeBytes);
}

/** The first day of a calendar month (UTC) as the database's date. */
export function monthKey(start: Date): string {
  return start.toISOString().slice(0, 10);
}

/** The share of the month's traffic after which the account is told it is running out. */
export const WARN_SHARE = 0.8;
/** Months of traffic kept: this one and the two before it; older rows are swept. */
export const KEEP_MONTHS = 3;

export type TrafficNotice = 'runningOut' | 'usedUp';

/** What an account that has spent `used` of its `limit` this month is told, if anything. */
export function trafficNotice(
  used: number,
  limit: number,
): TrafficNotice | null {
  if (limit <= 0) return null;
  if (used >= limit) return 'usedUp';
  if (used >= limit * WARN_SHARE) return 'runningOut';
  return null;
}

/** The first day of the oldest month kept; rows of earlier months are swept. */
export function keptFrom(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (KEEP_MONTHS - 1), 1),
  );
}

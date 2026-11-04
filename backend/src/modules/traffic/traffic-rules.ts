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

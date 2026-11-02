/** Wider than any page scrollbar (ours is 10 px, others up to about 17). */
const SCROLLBAR_SLACK_PX = 24;
/** The scrollbar comes and goes within frames; a real resize back to the same width is later. */
const BOUNCE_WINDOW_MS = 1000;

/**
 * The width a shelf lays out at, from the width it measures. The page's scrollbar
 * takes no room of its own, so it narrows the shelf when the page grows taller than the
 * window; a justified shelf laid out narrower can come out lower, the page then fits, the scrollbar
 * goes, the shelf widens, grows taller again — at some window sizes and numbers of videos the two
 * fed each other and every tile flickered for good, reload or not. A widening that only takes back
 * a scrollbar-sized narrowing of a moment ago is ignored: the shelf stays at the narrower width.
 */
export class WidthDamper {
  private current = 0;
  private bounce: { wide: number; narrow: number; at: number } | null = null;

  /** The width to lay out at now, or null to keep the last one. */
  next(measured: number, now: number): number | null {
    if (!measured || measured === this.current) return null;
    const b = this.bounce;
    if (b && measured === b.wide && this.current === b.narrow && now - b.at < BOUNCE_WINDOW_MS)
      return null;
    const narrowing = this.current - measured;
    this.bounce =
      narrowing > 0 && narrowing <= SCROLLBAR_SLACK_PX
        ? { wide: this.current, narrow: measured, at: now }
        : null;
    this.current = measured;
    return measured;
  }
}

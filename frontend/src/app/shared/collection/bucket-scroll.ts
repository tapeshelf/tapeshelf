import { type Slot } from './slots';
import { letterOf, monthOf } from './slot-groups';

/** Room the compact bar takes at the top of the window, and a little air under it. */
const TOP_OFFSET = 64;

/** The month or letter a tile belongs to, as the listing is divided. */
export function bucketOf(slot: Slot, by: 'month' | 'letter'): string {
  return by === 'month' ? monthOf(slot) : letterOf(slot);
}

/**
 * Which bucket the view is at: the tile under a point just below the compact bar. A few points
 * across the width, in case the first falls in a gap between tiles.
 */
export function bucketAtTop(
  slots: readonly Slot[],
  by: 'month' | 'letter',
  /** Null when none of these tiles is there (a visitor's section looked up one by one). */
  strict = false,
): string | null {
  // A few points across and down: a gap between tiles or a month's heading may be first.
  for (const y of [TOP_OFFSET + 24, TOP_OFFSET + 90, TOP_OFFSET + 180]) {
    for (const x of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      const el = document
        .elementFromPoint(window.innerWidth * x, y)
        ?.closest<HTMLElement>('[data-video-id]');
      const id = el?.dataset['videoId'];
      if (!id) continue;
      const slot = slots.find((s) =>
        s.kind === 'video' ? s.item.video.id === id : s.items.some((i) => i.video.id === id),
      );
      if (slot) return bucketOf(slot, by);
    }
  }
  // Above the first tile (the shelf's head in view): the first bucket.
  return !strict && slots[0] ? bucketOf(slots[0], by) : null;
}

/**
 * Scrolls to the first tile of a bucket (a month's heading when it has one) once it is drawn: the
 * caller has loaded that far; the mosaic needs a frame or two to lay the new tiles out.
 */
export async function scrollToBucket(
  key: string,
  by: 'month' | 'letter',
  slots: readonly Slot[],
  /** The heading's `data-month` when it differs from the key (a visitor's carries the section). */
  heading = key,
): Promise<boolean> {
  const slot = slots.find((s) => bucketOf(s, by) === key);
  if (!slot) return false;
  const id = slot.kind === 'video' ? slot.item.video.id : slot.items[0]!.video.id;
  for (let i = 0; i < 20; i++) {
    const target =
      (by === 'month' ? document.querySelector<HTMLElement>(`[data-month="${heading}"]`) : null) ??
      document.querySelector<HTMLElement>(`[data-video-id="${id}"]`);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      return true;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
}

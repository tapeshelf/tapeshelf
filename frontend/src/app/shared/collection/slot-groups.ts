import { type CollectionBucketDto } from '../../api';
import { type Slot } from './slots';

/** Tiles of one month (or one first letter), in the shelf's order. */
export interface SlotGroup {
  key: string;
  slots: Slot[];
}

/** The holding a tile stands for: a video, or the first video of a stack (where the stack stands). */
function lead(slot: Slot) {
  return slot.kind === 'video' ? slot.item : slot.items[0]!;
}

/** "2026-10": the month a tile was added to the shelf, in this browser's time zone. */
export function monthOf(slot: Slot): string {
  const d = new Date(lead(slot).addedAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "A", "Ж", "#": the first letter of a tile's title as the server divides by it. */
export function letterOf(slot: Slot): string {
  const title = slot.kind === 'stack' && slot.name ? slot.name : lead(slot).video.title;
  const first = title.trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(first) ? first : '#';
}

/**
 * The tiles cut where the month changes, a stack in the month of its first video. A run of
 * one month is one group, so the shelf draws one mosaic per month with its heading.
 */
export function groupByMonth(slots: readonly Slot[]): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const slot of slots) {
    const key = monthOf(slot);
    const last = groups.at(-1);
    if (last?.key === key) last.slots.push(slot);
    else groups.push({ key, slots: [slot] });
  }
  return groups;
}

/** "Октябрь 2026", "October 2026": a month heading in the page's language. */
export function monthLabel(key: string, lang: string): string {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, 1);
  const month = new Intl.DateTimeFormat(lang, { month: 'long' }).format(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${y}`;
}

/** "Окт 26", "Oct 26": a short mark on the quick scroller. */
export function monthMark(key: string, lang: string): string {
  const [y, m] = key.split('-').map(Number);
  const month = new Intl.DateTimeFormat(lang, { month: 'short' })
    .format(new Date(y!, (m ?? 1) - 1, 1))
    .replace('.', '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(y).slice(2)}`;
}

/** How many videos come before `key` in the listing: the scroller loads that far before it jumps. */
export function videosBefore(buckets: readonly CollectionBucketDto[], key: string): number {
  let n = 0;
  for (const b of buckets) {
    if (b.key === key) return n;
    n += b.count;
  }
  return n;
}

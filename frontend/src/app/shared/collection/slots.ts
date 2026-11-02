import { type CollectionItemDto } from '../../api';
import { aspectOf, stackLayout } from '../ui/mosaic/mosaic-layout';

/** A tile of the shelf: one video, or a stack of them shown as one. */
export type Slot =
  | { kind: 'video'; item: CollectionItemDto }
  | {
      kind: 'stack';
      id: string;
      name: string | null;
      /** The video chosen for the cover; null = the first one. */
      coverVideoId: string | null;
      /** How many videos the stack has in this listing (the server counts, pages may still be loading). */
      size: number;
      /** The videos loaded so far, in shelf order. */
      items: CollectionItemDto[];
    };

/**
 * Folds a listing into tiles: a stack takes the place of its first video and gathers the others
 * wherever they are in the list. A stack the listing shows only one video of is just that video
 * (a visitor who may see one of its videos, a category that holds one of them).
 */
export function toSlots(items: readonly CollectionItemDto[]): Slot[] {
  const slots: Slot[] = [];
  const stacks = new Map<string, Extract<Slot, { kind: 'stack' }>>();
  for (const item of items) {
    const ref = item.stack;
    if (!ref || ref.size < 2) {
      slots.push(videoSlot(item));
      continue;
    }
    const known = stacks.get(ref.id);
    if (known) {
      known.items.push(item);
      continue;
    }
    const slot = {
      kind: 'stack' as const,
      id: ref.id,
      name: ref.name,
      coverVideoId: ref.coverVideoId,
      size: ref.size,
      items: [item],
    };
    stacks.set(ref.id, slot);
    slots.push(slot);
  }
  return slots;
}

/**
 * One slot object per item object: a progress event replaces one item, and the others keep their
 * slots, so the mosaic keeps their cells and their tiles are not redrawn.
 */
const videoSlots = new WeakMap<CollectionItemDto, Slot>();
function videoSlot(item: CollectionItemDto): Slot {
  let slot = videoSlots.get(item);
  if (!slot) videoSlots.set(item, (slot = { kind: 'video', item }));
  return slot;
}

export function slotKey(slot: Slot): string {
  return slot.kind === 'stack' ? `stack:${slot.id}` : `video:${slot.item.video.id}`;
}

/** The picture a slot shows: the video, or the stack's cover (the chosen one, else the first). */
export function slotCover(slot: Slot): CollectionItemDto {
  if (slot.kind === 'video') return slot.item;
  return slot.items.find((i) => i.video.id === slot.coverVideoId) ?? slot.items[0]!;
}

/**
 * A stack's videos for its tile: the cover first, the rest in shelf order. While the shelf has not
 * loaded enough of them (they fall wherever the order puts them), the server's first pictures of
 * the stack (`peek`) stand in, so the tile looks the same now as once the shelf has loaded further.
 */
export function stackPictures(slot: Extract<Slot, { kind: 'stack' }>): CollectionItemDto[] {
  // The same array for the same slot: a new one each time the shelf was checked redrew every stack
  // tile, on every scroll and progress event. Slots are built anew when the shelf changes.
  let pictures = PICTURES.get(slot);
  if (!pictures) PICTURES.set(slot, (pictures = picturesOf(slot)));
  return pictures;
}

const PICTURES = new WeakMap<Slot, CollectionItemDto[]>();

function picturesOf(slot: Extract<Slot, { kind: 'stack' }>): CollectionItemDto[] {
  const cover = slotCover(slot);
  const loaded = [cover, ...slot.items.filter((i) => i !== cover)];
  const peek = slot.items.find((i) => i.stack?.peek?.length)?.stack?.peek;
  if (!peek?.length || loaded.length >= Math.min(4, slot.size)) return loaded;
  const byId = new Map(loaded.map((i) => [i.video.id, i]));
  const base = slot.items[0]!;
  const coverId =
    slot.coverVideoId &&
    (byId.has(slot.coverVideoId) || peek.some((v) => v.id === slot.coverVideoId))
      ? slot.coverVideoId
      : peek[0]!.id;
  const pictures = [
    ...peek.filter((v) => v.id === coverId),
    ...peek.filter((v) => v.id !== coverId),
  ].map((video) => byId.get(video.id) ?? { ...base, video });
  const shown = new Set(pictures.map((i) => i.video.id));
  return [...pictures, ...loaded.filter((i) => !shown.has(i.video.id))];
}

export function slotAspect(slot: Slot): number {
  // A stack is a folder shaped by what it holds.
  if (slot.kind === 'stack')
    return stackLayout(
      stackPictures(slot).map((i) => aspectOf(i.video.width, i.video.height)),
      slot.size,
    ).aspect;
  const v = slotCover(slot).video;
  return aspectOf(v.width, v.height);
}

/** Video ids of a slot, in order. */
export function slotIds(slot: Slot): string[] {
  // Asked per tile on every check of the shelf and in loops over all its slots: once per slot.
  let ids = IDS.get(slot);
  if (!ids)
    IDS.set(
      slot,
      (ids = slot.kind === 'stack' ? slot.items.map((i) => i.video.id) : [slot.item.video.id]),
    );
  return ids;
}

const IDS = new WeakMap<Slot, string[]>();

/** The slot a video is shown in. */
export function slotOf(slots: readonly Slot[], videoId: string): Slot | null {
  return slots.find((s) => slotIds(s).includes(videoId)) ?? null;
}

/** How many tiles a shelf of `all` videos draws when `stacked` of them sit in `stacks` stacks. */
export function tileCount(all: number, stacked: number, stacks: number): number {
  return Math.max(0, all - stacked + stacks);
}

export type StackCategoryPlan =
  /** Every video already has the stack's category (or none, like the stack): nothing to decide. */
  | { kind: 'same' }
  /** Videos without a category join a stack that has one: they simply take it. */
  | { kind: 'auto'; categoryId: string }
  /** A category would be lost or changed: the user chooses one for the whole stack. */
  | { kind: 'ask'; options: (string | null)[]; preselect: string | null };

/**
 * What stacking `dragged` videos onto a target of category `target` means for categories:
 * a stack keeps one category. The target decides; a video adapts silently only when it gains
 * a category. Dropping a filed video onto a stack without a category suggests filing the stack.
 */
export function planStackCategory(
  target: string | null,
  dragged: readonly (string | null)[],
): StackCategoryPlan {
  const distinct = [...new Set(dragged)];
  if (distinct.every((c) => c === target)) return { kind: 'same' };
  if (target !== null && distinct.every((c) => c === null))
    return { kind: 'auto', categoryId: target };
  const options = [...new Set([target, ...distinct])];
  const filed = distinct.filter((c): c is string => c !== null);
  const preselect = target === null && filed.length === 1 ? filed[0]! : target;
  return { kind: 'ask', options, preselect };
}

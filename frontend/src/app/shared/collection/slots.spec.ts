import { type CollectionItemDto } from '../../api';
import {
  planStackCategory,
  slotCover,
  slotIds,
  slotKey,
  slotOf,
  stackPictures,
  tileCount,
  toSlots,
} from './slots';

function item(
  id: string,
  stack: {
    id: string;
    size: number;
    coverVideoId?: string;
    peek?: CollectionItemDto['video'][];
  } | null = null,
): CollectionItemDto {
  return {
    section: 'PRIVATE',
    source: 'AUTHOR',
    hidden: false,
    unseen: false,
    originalTitle: null,
    categoryId: null,
    position: 0,
    addedAt: '',
    stack: stack ? { name: null, coverVideoId: null, ...stack } : null,
    video: {
      id,
      code: id,
      title: id,
      visibility: 'PRIVATE',
      status: 'READY',
      stage: null,
      progress: 100,
      failReason: null,
      durationSec: 1,
      width: 16,
      height: 9,
      sizeBytes: 1,
      thumbnailUrl: null,
      contactSheetUrl: null,
      frameUrls: [],
      sensitive: false,
      createdAt: '',
      author: { id: 'u', username: 'u', displayName: 'U', guest: false },
    },
  };
}

describe('toSlots', () => {
  it('a stack takes the place of its first video and gathers the others', () => {
    const slots = toSlots([
      item('a'),
      item('b', { id: 's', size: 3 }),
      item('c'),
      item('d', { id: 's', size: 3 }),
      item('e', { id: 's', size: 3 }),
    ]);
    expect(slots.map(slotKey)).toEqual(['video:a', 'stack:s', 'video:c']);
    expect(slotIds(slots[1]!)).toEqual(['b', 'd', 'e']);
    expect(slotOf(slots, 'd')).toBe(slots[1]);
  });

  it('a stack with one video in this listing is just that video', () => {
    const slots = toSlots([item('a', { id: 's', size: 1 }), item('b')]);
    expect(slots.map(slotKey)).toEqual(['video:a', 'video:b']);
  });

  it('a stack whose other videos are on a later page is still a stack, with the server’s count', () => {
    const slots = toSlots([item('a', { id: 's', size: 4 })]);
    expect(slots[0]).toMatchObject({ kind: 'stack', size: 4, items: [expect.anything()] });
  });

  it('the chosen cover comes first on the tile; the shelf order stays', () => {
    const s = { id: 's', size: 3, coverVideoId: 'd' };
    const slots = toSlots([item('b', s), item('c'), item('d', s), item('e', s)]);
    const stack = slots[0]!;
    expect(stack.kind).toBe('stack');
    expect(slotCover(stack).video.id).toBe('d');
    expect(slotIds(stack)).toEqual(['b', 'd', 'e']);
    if (stack.kind === 'stack')
      expect(stackPictures(stack).map((i) => i.video.id)).toEqual(['d', 'b', 'e']);
    // A cover that is not in this listing (a visitor may not see it): the first video stands in.
    const guest = toSlots([
      item('b', { id: 's', size: 2, coverVideoId: 'zz' }),
      item('e', { id: 's', size: 2, coverVideoId: 'zz' }),
    ]);
    expect(slotCover(guest[0]!).video.id).toBe('b');
  });

  it('a stack with only some videos loaded shows the server’s first pictures, the cover first', () => {
    const peek = ['p', 'q', 'a', 'r'].map((id) => item(id).video);
    const s = { id: 's', size: 6, peek };
    const slots = toSlots([item('a', s), item('x')]);
    const stack = slots[0]!;
    if (stack.kind !== 'stack') throw new Error('not a stack');
    // The loaded one keeps its own item; the rest come from the peek.
    const pictures = stackPictures(stack);
    expect(pictures.map((i) => i.video.id)).toEqual(['p', 'q', 'a', 'r']);
    expect(pictures[2]).toBe(stack.items[0]);
    // Selection and drags still work on what is loaded.
    expect(slotIds(stack)).toEqual(['a']);
    // The same slot gives the same pictures, not a copy each time.
    expect(stackPictures(stack)).toBe(pictures);
    // A cover chosen since then comes first: the stack comes with it, and the slots are new.
    const again = toSlots([item('a', { ...s, coverVideoId: 'r' }), item('x')])[0]!;
    if (again.kind !== 'stack') throw new Error('not a stack');
    expect(stackPictures(again).map((i) => i.video.id)).toEqual(['r', 'p', 'q', 'a']);
    // Loaded enough: the shelf's own order.
    const full = toSlots(['a', 'b', 'c', 'd'].map((id) => item(id, { id: 't', size: 4 })));
    if (full[0]!.kind === 'stack')
      expect(stackPictures(full[0]!).map((i) => i.video.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('counts tiles: videos minus what the stacks fold', () => {
    expect(tileCount(10, 6, 2)).toBe(6);
    expect(tileCount(3, 0, 0)).toBe(3);
  });
});

describe('planStackCategory', () => {
  it('nothing to decide when the videos agree with the target', () => {
    expect(planStackCategory(null, [null, null])).toEqual({ kind: 'same' });
    expect(planStackCategory('a', ['a'])).toEqual({ kind: 'same' });
  });

  it('a video without a category takes the stack’s own', () => {
    expect(planStackCategory('a', [null])).toEqual({ kind: 'auto', categoryId: 'a' });
  });

  it('a filed video onto an unfiled target suggests filing the stack', () => {
    expect(planStackCategory(null, ['a'])).toEqual({
      kind: 'ask',
      options: [null, 'a'],
      preselect: 'a',
    });
  });

  it('a filed video onto another category suggests the target’s', () => {
    expect(planStackCategory('b', ['a'])).toEqual({
      kind: 'ask',
      options: ['b', 'a'],
      preselect: 'b',
    });
    expect(planStackCategory(null, ['a', 'b', null])).toEqual({
      kind: 'ask',
      options: [null, 'a', 'b'],
      preselect: null,
    });
  });
});

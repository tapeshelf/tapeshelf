import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Api,
  type CollectionDto,
  type CollectionItemDto,
  type CollectionSummaryDto,
  collectionList,
  collectionSummary,
  myCollectionDeleteVideos,
  myCollectionMove,
  myCollectionUpdateHoldings,
  myCollectionUpdateVideos,
  stacksAdd,
  stacksCreate,
} from '../../api';
import { WsService } from '../../core/ws/ws.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { BACKGROUND_RELOAD_MS, LibraryStore, hasNewIds } from './library.store';

function item(id: string, extra: Partial<CollectionItemDto> = {}): CollectionItemDto {
  return {
    section: 'PRIVATE',
    source: 'AUTHOR',
    hidden: false,
    unseen: false,
    originalTitle: null,
    categoryId: null,
    stack: null,
    position: 0,
    addedAt: '2026-10-12T00:00:00.000Z',
    video: {
      id,
      code: 'k3x9ab2',
      title: id,
      visibility: 'PRIVATE',
      status: 'READY',
      stage: null,
      progress: 100,
      failReason: null,
      durationSec: 10,
      width: 640,
      height: 360,
      sizeBytes: 1000,
      thumbnailUrl: null,
      contactSheetUrl: null,
      frameUrls: [],
      sensitive: false,
      createdAt: '2026-10-12T00:00:00.000Z',
      author: { id: 'me', username: 'me', displayName: 'Me', guest: false },
    },
    ...extra,
  };
}

const SUMMARY: CollectionSummaryDto = {
  all: 3,
  public: 0,
  private: 2,
  others: 1,
  hidden: 0,
  uncategorized: 3,
  stacked: 0,
  stacks: 0,
  trash: 0,
  categories: [],
  newSince: null,
  inbox: 0,
  newCount: 0,
};

/** Answers by function identity and records the calls, like the upload store spec does. */
class FakeApi {
  calls: { fn: unknown; params: Record<string, unknown> | undefined }[] = [];
  items: CollectionItemDto[] = [];
  /** The next list request fails like a body-less network error. */
  failNextList = false;
  failMove = false;

  async invoke(fn: unknown, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ fn, params });
    if (fn === collectionList && this.failNextList) {
      this.failNextList = false;
      throw new Error('network down');
    }
    if (fn === collectionList) {
      const offset = (params?.['offset'] as number | undefined) ?? 0;
      const limit = (params?.['limit'] as number | undefined) ?? this.items.length;
      return {
        mode: 'OWNER',
        sort: 'added',
        total: this.items.length,
        offset,
        items: this.items.slice(offset, offset + limit),
      } as CollectionDto;
    }
    if (fn === collectionSummary) return SUMMARY;
    if (
      fn === myCollectionUpdateHoldings ||
      fn === myCollectionUpdateVideos ||
      fn === myCollectionDeleteVideos
    )
      return { updated: (params!['body'] as { videoIds: string[] }).videoIds.length };
    if (fn === myCollectionMove) {
      if (this.failMove) throw new Error('refused');
      return { ok: true };
    }
    if (fn === stacksCreate || fn === stacksAdd)
      return {
        id: (params?.['id'] as string | undefined) ?? 's1',
        name: null,
        coverVideoId: null,
        categoryId: null,
        size: 2,
      };
    return {};
  }

  of(fn: unknown) {
    return this.calls.filter((c) => c.fn === fn);
  }
}

class FakeWs {
  handlers = new Map<string, (payload: unknown) => void>();
  on(event: string, handler: (payload: unknown) => void): () => void {
    this.handlers.set(event, handler);
    return () => this.handlers.delete(event);
  }
  resyncs = new Set<() => void>();
  onResync(handler: () => void): () => void {
    this.resyncs.add(handler);
    return () => this.resyncs.delete(handler);
  }
  /** The socket is back after a break. */
  resync(): void {
    for (const h of this.resyncs) h();
  }
  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LibraryStore', () => {
  let api: FakeApi;
  let ws: FakeWs;
  let store: LibraryStore;

  beforeEach(() => {
    api = new FakeApi();
    ws = new FakeWs();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideHttpClient(),
        { provide: Api, useValue: api },
        { provide: WsService, useValue: ws },
        LibraryStore,
      ],
    });
    store = TestBed.inject(LibraryStore);
    api.items = [item('a'), item('b'), item('c', { source: 'EXCHANGE', section: 'OTHERS' })];
  });

  it('a stack of more videos than the API takes at once is made in several requests', async () => {
    api.items = Array.from({ length: 251 }, (_, i) => item(`v${i}`));
    store.init('me', 'manual');
    await flush();
    await store.loadMore(300);
    expect(store.items()).toHaveLength(251);
    const ids = api.items.slice(1).map((i) => i.video.id);
    await store.stackOnto({ id: 'v0', stackId: null }, ids);
    const made = api.of(stacksCreate).map((c) => c.params!['body'] as { videoIds: string[] });
    const added = api
      .of(stacksAdd)
      .map((c) => c.params as { id: string; body: { videoIds: string[] } });
    expect(made).toHaveLength(1);
    expect(made[0]!.videoIds).toEqual(['v0', ...ids.slice(0, 199)]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: 's1', body: { videoIds: ids.slice(199) } });
  });

  it('loads the folder with the owner sort and keeps selection helpers consistent', async () => {
    store.init('me', 'manual');
    await flush();
    expect(store.loaded()).toBe(true);
    expect(store.order()).toEqual(['a', 'b', 'c']);
    expect(api.of(collectionList)[0]!.params).toMatchObject({ username: 'me', sort: 'manual' });
    store.click('a', { ctrl: false, shift: false });
    store.click('c', { ctrl: false, shift: true });
    expect(store.selectedIds()).toEqual(['a', 'b', 'c']);
    expect(store.selectedOwn().map((i) => i.video.id)).toEqual(['a', 'b']);
    expect(store.selectedReceived().map((i) => i.video.id)).toEqual(['c']);
    store.clearSelection();
    expect(store.selectedIds()).toEqual([]);
  });

  it('sorts by a table column either way, and a drag under it adopts that order', async () => {
    store.init('me', 'added');
    await flush();
    store.setSort('duration');
    await flush();
    expect(api.of(collectionList).at(-1)!.params).toMatchObject({ sort: 'duration' });
    expect(api.of(collectionList).at(-1)!.params!['dir']).toBeUndefined();
    store.setSort('duration', 'asc');
    await flush();
    expect(api.of(collectionList).at(-1)!.params).toMatchObject({ sort: 'duration', dir: 'asc' });
    expect(await store.moveTo(['c'], [], 'a', false)).toBe(true);
    expect(api.of(myCollectionMove)[0]!.params!['body']).toMatchObject({
      adopt: 'duration',
      adoptDir: 'asc',
    });
    // Manual now, with no way left over.
    expect([store.sort(), store.dir()]).toEqual(['manual', null]);
  });

  it('changing the folder reloads with the right query and drops the selection', async () => {
    store.init('me', 'added');
    await flush();
    store.selectAll();
    store.setFolder({ kind: 'CATEGORY', id: 'cat-1' });
    await flush();
    expect(store.selectedIds()).toEqual([]);
    expect(api.of(collectionList).at(-1)!.params).toMatchObject({ categoryId: 'cat-1' });
    store.setFolder({ kind: 'HIDDEN' });
    await flush();
    expect(api.of(collectionList).at(-1)!.params).toMatchObject({ section: 'HIDDEN' });
    store.setFolder({ kind: 'NONE' });
    await flush();
    expect(api.of(collectionList).at(-1)!.params).toMatchObject({ categoryId: 'none' });
  });

  it('visibility applies to own videos only, hiding to all; misfits leave the folder', async () => {
    api.items = [
      item('a'),
      item('b', { video: { ...item('b').video, visibility: 'PUBLIC' }, section: 'PUBLIC' }),
      item('c', { source: 'SHARE' }),
    ];
    store.init('me', 'added');
    await flush();
    store.setFolder({ kind: 'PRIVATE' });
    await flush();
    await store.setVisibility(['a', 'c'], 'PUBLIC');
    const call = api.of(myCollectionUpdateVideos)[0]!;
    expect(call.params).toMatchObject({ body: { videoIds: ['a'], visibility: 'PUBLIC' } });
    expect(store.order()).toEqual(['b', 'c']); // "a" left the Private folder
    // Hiding takes own videos too ("only for me").
    await store.setHidden(['b', 'c'], true);
    expect(api.of(myCollectionUpdateHoldings)[0]!.params).toMatchObject({
      body: { videoIds: ['b', 'c'], hidden: true },
    });
    expect(store.order()).toEqual([]);
  });

  it('deletes own videos, reorders locally and tells the server', async () => {
    store.init('me', 'manual');
    await flush();
    const deleted = await store.deleteVideos(['a', 'c']);
    expect(deleted).toBe(1);
    expect(api.of(myCollectionDeleteVideos)[0]!.params).toMatchObject({
      body: { videoIds: ['a'] },
    });
    expect(store.order()).toEqual(['b', 'c']);
    // A drag: at once on screen, and on the whole shelf on the server (manual already: no adopt).
    expect(await store.moveTo(['c'], [], 'b', false)).toBe(false);
    expect(store.order()).toEqual(['c', 'b']);
    expect(api.of(myCollectionMove)[0]!.params).toMatchObject({
      body: { videoIds: ['c'], stackIds: [], anchorId: 'b', side: 'before', adopt: undefined },
    });
  });

  it('a drag under another sort adopts it on the server; a refused drag puts the list back', async () => {
    store.init('me', 'added');
    await flush();
    expect(store.order()).toEqual(['a', 'b', 'c']);
    api.failMove = true;
    await expect(store.moveTo(['a'], [], 'c', true)).rejects.toThrow('refused');
    expect(store.order()).toEqual(['a', 'b', 'c']);
    expect(store.sort()).toBe('added');
    api.failMove = false;
    expect(await store.moveTo(['a'], [], 'c', true)).toBe(true);
    expect(api.of(myCollectionMove).at(-1)!.params).toMatchObject({
      body: { videoIds: ['a'], anchorId: 'c', side: 'after', adopt: 'added' },
    });
    expect(store.sort()).toBe('manual');
  });

  it('a background reload brings back as many videos as were loaded; bulk actions go in pieces of 200', async () => {
    api.items = Array.from({ length: 450 }, (_, i) => item(`v${i}`));
    store.init('me', 'added');
    await flush();
    expect(store.items()).toHaveLength(60);
    await store.loadMore();
    await store.loadMore();
    expect(store.items()).toHaveLength(180);
    api.calls = [];
    await store.reload();
    expect(store.items()).toHaveLength(180);
    expect(api.of(collectionList).map((c) => [c.params!['offset'], c.params!['limit']])).toEqual([
      [0, 100],
      [100, 80],
    ]);
    // A new folder starts from its first page.
    store.setFolder({ kind: 'PUBLIC' });
    await flush();
    expect(store.items()).toHaveLength(60);
    store.setFolder({ kind: 'ALL' });
    await flush();
    for (let i = 0; i < 6; i++) await store.loadMore();
    expect(store.items()).toHaveLength(420);
    api.calls = [];
    await store.setVisibility(store.order(), 'PUBLIC');
    expect(
      api
        .of(myCollectionUpdateVideos)
        .map((c) => (c.params!['body'] as { videoIds: string[] }).videoIds.length),
    ).toEqual([200, 200, 20]);
  });

  it('patches live processing events; a tile keeps the small pictures the event names', async () => {
    api.items = [item('a', { video: { ...item('a').video, status: 'QUEUED', progress: 0 } })];
    store.init('me', 'added');
    await flush();
    ws.emit('video.progress', {
      videoId: 'a',
      status: 'PROCESSING',
      stage: 'PACKAGE',
      progress: 42,
    });
    expect(store.items()[0]!.video).toMatchObject({
      status: 'PROCESSING',
      stage: 'PACKAGE',
      progress: 42,
    });
    ws.emit('video.changed', {
      video: {
        ...item('a').video,
        contactSheetUrl: 'https://cdn/v/a/abc/sheet-ff.jpg',
        thumbnailUrl: 'https://cdn/v/a/abc/f07.jpg',
        tileThumbnailUrl: 'https://cdn/v/a/abc/s07.webp',
        tileFrameUrls: Array.from(
          { length: 16 },
          (_, i) => `https://cdn/v/a/abc/s${String(i).padStart(2, '0')}.webp`,
        ),
      },
    });
    // Not the full-size JPEGs, six times heavier.
    expect(store.items()[0]!.video.thumbnailUrl).toBe('https://cdn/v/a/abc/s07.webp');
    expect(store.items()[0]!.video.frameUrls).toHaveLength(16);
    expect(store.items()[0]!.video.frameUrls[15]).toBe('https://cdn/v/a/abc/s15.webp');
    // An unknown video (fresh upload) triggers a reload instead.
    const before = api.of(collectionList).length;
    ws.emit('video.changed', { video: item('zzz').video });
    await flush();
    expect(api.of(collectionList).length).toBe(before); // coalesced, fetched after a short pause
    await new Promise((r) => setTimeout(r, BACKGROUND_RELOAD_MS + 30));
    await flush();
    expect(api.of(collectionList).length).toBe(before + 1);
    vi.restoreAllMocks();
  });
  it('coalesces a burst of background changes into one reload', async () => {
    store.init('me', 'added');
    await flush();
    const before = api.of(collectionList).length;
    // An upload finishing plus WS news about videos this page has not seen yet, many times over.
    for (let i = 0; i < 25; i++) {
      store.onUploaded();
      ws.emit('video.changed', { video: { ...item(`new-${i}`).video } });
    }
    expect(api.of(collectionList).length).toBe(before);
    await new Promise((r) => setTimeout(r, BACKGROUND_RELOAD_MS + 30));
    await flush();
    expect(api.of(collectionList).length).toBe(before + 1);
    expect(api.of(collectionSummary).length).toBe(before + 1);
  });

  it('news in the background fetches the top only, however much is loaded', async () => {
    api.items = Array.from({ length: 250 }, (_, i) => item(`v${i}`));
    store.init('me', 'added');
    await flush();
    await store.loadMore(200);
    expect(store.items()).toHaveLength(250);
    // A new video at the top of the folder.
    api.items = [item('fresh'), ...api.items];
    const before = api.of(collectionList).length;
    ws.emit('video.changed', { video: item('fresh').video });
    await new Promise((r) => setTimeout(r, BACKGROUND_RELOAD_MS + 30));
    await flush();
    const asked = api.of(collectionList).slice(before);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.params).toMatchObject({ offset: 0, limit: 100 });
    expect(store.items()).toHaveLength(251);
    expect(store.items()[0]!.video.id).toBe('fresh');
    expect(store.items()[250]!.video.id).toBe('v249');
  });

  it('keeps the items on screen when a reload fails and clears the error on retry', async () => {
    store.init('me', 'added');
    await flush();
    api.failNextList = true;
    await store.reload();
    expect(store.items().map((i) => i.video.id)).toEqual(['a', 'b', 'c']);
    expect(store.loaded()).toBe(true);
    expect(store.error()).toBe('Something went wrong. Please try again.');
    await store.reload();
    expect(store.error()).toBeNull();
  });

  it('tells new finished uploads from ones already seen', () => {
    expect(hasNewIds(new Set(['u1', 'u2']), ['u1', 'u2'])).toBe(false);
    expect(hasNewIds(new Set(['u1', 'u2']), ['u2'])).toBe(false);
    expect(hasNewIds(new Set(['u1']), ['u1', 'u3'])).toBe(true);
    expect(hasNewIds(new Set(), [])).toBe(false);
  });
});

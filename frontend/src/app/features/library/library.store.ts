import { Injectable, computed, inject, signal } from '@angular/core';

import {
  Api,
  type CollectionBucketsDto,
  type CollectionFilter,
  type CollectionItemDto,
  type CollectionSort,
  type ListSort,
  type SortDirection,
  type CollectionSummaryDto,
  type StackDto,
  type VideoDto,
  type Visibility,
  collectionBuckets,
  collectionList,
  collectionSummary,
  myCollectionDeleteVideos,
  myCollectionMove,
  myCollectionRemoveVideos,
  myCollectionUpdateHoldings,
  myCollectionUpdateVideos,
  stacksAdd,
  stacksCreate,
  stacksDissolve,
  stacksList,
  stacksRemove,
  stacksUpdate,
} from '../../api';
import { TranslocoService } from '@jsverse/transloco';

import { toApiError } from '../../core/api/api-error';
import { CategoriesStore } from '../../core/categories/categories.store';
import { type Slot, slotIds, tileCount, toSlots } from '../../shared/collection/slots';
import { type VideoProgressEvent, VideosStore } from '../../core/videos/videos.store';
import { WsService } from '../../core/ws/ws.service';
import {
  EMPTY_SELECTION,
  type ClickModifiers,
  type SelectionState,
  applyClick,
  applyContextClick,
  moveBefore,
  pruneSelection,
  selectAll,
} from './selection';

/** Sidebar folders; TRASH lists the owner's own deletions. */
export type Folder =
  | { kind: 'ALL' | 'PUBLIC' | 'PRIVATE' | 'OTHERS' | 'HIDDEN' | 'NONE' | 'TRASH' | 'INBOX' }
  | { kind: 'CATEGORY'; id: string };

const PAGE = 60;
/** The most the API lists at once; a reload that keeps what was loaded asks in pieces this big. */
const LIST_MAX = 100;
/** The most ids the API takes per bulk operation (backend BULK_MAX); more go in several requests. */
const BULK_MAX = 200;
/** The most videos one drag moves (backend MOVE_MAX): its order is computed whole, not in pieces. */
export const MOVE_MAX = 2000;

/** `ids` in pieces of at most `size`. */
function chunks<T>(ids: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Bursts of background changes (finished uploads, new videos over WS) are fetched once, after this pause. */
export const BACKGROUND_RELOAD_MS = 400;

/** Whether `after` holds an id that `before` did not. */
export function hasNewIds(before: ReadonlySet<string>, after: readonly string[]): boolean {
  return after.some((id) => !before.has(id));
}

/** The folder as it is written in the address (`?folder=`): nothing for "All", `c:<id>` for a category. */
export function folderToParam(folder: Folder): string | null {
  if (folder.kind === 'ALL') return null;
  return folder.kind === 'CATEGORY' ? `c:${folder.id}` : folder.kind.toLowerCase();
}

export function folderFromParam(param: string | null | undefined): Folder {
  if (!param) return { kind: 'ALL' };
  if (param.startsWith('c:') && param.length > 2) return { kind: 'CATEGORY', id: param.slice(2) };
  const kind = param.toUpperCase();
  return kind === 'PUBLIC' ||
    kind === 'PRIVATE' ||
    kind === 'OTHERS' ||
    kind === 'HIDDEN' ||
    kind === 'NONE' ||
    kind === 'TRASH' ||
    kind === 'INBOX'
    ? { kind }
    : { kind: 'ALL' };
}

function sameFolder(a: Folder, b: Folder): boolean {
  return a.kind === b.kind && (a.kind !== 'CATEGORY' || a.id === (b as { id: string }).id);
}

/**
 * The owner's file manager: the current folder's items, selection and the bulk actions.
 * One instance per library page; live events patch items in place.
 */
@Injectable()
export class LibraryStore {
  private readonly api = inject(Api);
  private readonly ws = inject(WsService);
  private readonly videos = inject(VideosStore);
  private readonly categories = inject(CategoriesStore);
  private readonly t = inject(TranslocoService);
  private readonly unsubscribe: (() => void)[] = [];
  private username = '';
  private requestSeq = 0;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  readonly folder = signal<Folder>({ kind: 'ALL' });
  readonly sort = signal<ListSort>('added');
  /** The way of a table column's order; null: the column's own first way. */
  readonly dir = signal<SortDirection | null>(null);
  /** How the listing divides into months or letters; null for none or until known. */
  readonly buckets = signal<CollectionBucketsDto | null>(null);
  /** A search over the whole shelf (within "Hidden" when that is open); empty: none. */
  readonly search = signal('');
  readonly items = signal<CollectionItemDto[]>([]);
  readonly total = signal(0);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<CollectionSummaryDto | null>(null);
  readonly selection = signal<SelectionState>(EMPTY_SELECTION);

  /** Tiles: videos, with the stacks folded. */
  readonly slots = computed(() => toSlots(this.items()));
  /** How many tiles the whole shelf draws, for the size of every tile; null until known. */
  readonly tileCount = computed(() => {
    const s = this.summary();
    return s ? tileCount(s.all, s.stacked, s.stacks) : null;
  });
  /** The stack open in its window, and its videos (all of them, whatever folder is open). */
  readonly openStackId = signal<string | null>(null);
  readonly stackItems = signal<CollectionItemDto[]>([]);

  readonly order = computed(() => this.items().map((i) => i.video.id));
  readonly hasMore = computed(() => this.items().length < this.total());
  readonly selectedIds = computed(() => [...this.selection().selected]);
  readonly selectedItems = computed(() => {
    const ids = this.selection().selected;
    // From the shelf and the open stack's window, whose videos may not be on the loaded shelf.
    const seen = new Set<string>();
    return [...this.items(), ...this.stackItems()].filter((i) => {
      if (!ids.has(i.video.id) || seen.has(i.video.id)) return false;
      seen.add(i.video.id);
      return true;
    });
  });
  readonly selectedOwn = computed(() => this.selectedItems().filter((i) => i.source === 'AUTHOR'));
  readonly selectedReceived = computed(() =>
    this.selectedItems().filter((i) => i.source !== 'AUTHOR'),
  );

  constructor() {
    this.unsubscribe.push(
      this.ws.on<VideoProgressEvent>('video.progress', (e) =>
        this.patchVideo(e.videoId, { status: e.status, stage: e.stage, progress: e.progress }),
      ),
      this.ws.on<{ video: VideoDto }>('video.changed', ({ video }) => this.onChanged(video)),
      // An edited copy that never came to be (a cancel, a failure) leaves the shelf.
      this.ws.on<{ videoId: string }>('video.removed', ({ videoId }) => {
        this.drop([videoId]);
        void this.afterChange();
      }),
      // After a break the progress and "ready" events of that time are lost.
      this.ws.onResync(() => {
        if (this.items().some((i) => i.video.status !== 'READY' && i.video.status !== 'FAILED'))
          void this.reload();
      }),
      this.videos.onEdited((video) => this.onEdited(video)),
    );
  }

  init(
    username: string,
    sort: CollectionSort,
    folder: Folder = { kind: 'ALL' },
    search = '',
  ): void {
    this.username = username;
    this.sort.set(sort);
    this.folder.set(folder);
    this.search.set(search);
    void this.reload({ fresh: true });
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
  }

  /**
   * Something changed outside this page (an upload finished, a new video arrived over WS). Such
   * events come in bursts, so the top of the folder is fetched once after they settle instead of
   * per event — the top only: what arrives is there, and the whole loaded shelf was fetched again
   * for each, hundreds of requests on a very large shelf. What lands further down comes with the scroll.
   */
  requestReload(): void {
    if (!this.loaded()) return;
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reloadTop();
    }, BACKGROUND_RELOAD_MS);
  }

  /** The folder's first page, put over the top of what is loaded; the counts come again. */
  private async reloadTop(): Promise<void> {
    if (this.items().length <= LIST_MAX) return this.reload();
    const seq = ++this.requestSeq;
    try {
      const [page, summary, buckets] = await Promise.all([
        this.fetch(0, LIST_MAX),
        this.fetchSummary(),
        this.fetchBuckets(),
      ]);
      if (seq !== this.requestSeq) return;
      const top = new Set(page.items.map((i) => i.video.id));
      this.items.update((list) => [...page.items, ...list.filter((i) => !top.has(i.video.id))]);
      this.total.set(page.total);
      this.summary.set(summary);
      this.buckets.set(buckets);
      this.selection.update((s) => pruneSelection(s, this.order()));
    } catch {
      // what is shown stays; the next change or reload brings it up to date
    }
  }

  setFolder(folder: Folder): void {
    if (sameFolder(this.folder(), folder)) return;
    this.folder.set(folder);
    this.selection.set(EMPTY_SELECTION);
    void this.reload({ fresh: true });
  }

  setSort(sort: ListSort, dir: SortDirection | null = null): void {
    if (this.sort() === sort && this.dir() === dir) return;
    this.sort.set(sort);
    this.dir.set(dir);
    void this.reload({ fresh: true });
  }

  /** Another search keeps the folder; what was picked goes, as with another folder. */
  setSearch(search: string): void {
    if (this.search() === search) return;
    this.search.set(search);
    this.selection.set(EMPTY_SELECTION);
    void this.reload({ fresh: true });
  }

  /**
   * Reloads the current folder from the start; the selection survives for ids that are still there.
   * A background reload (an upload done, a stack made) brings back as many videos as were loaded:
   * it used to cut the shelf back to its first page, with the scroll and the selection.
   * `fresh` (another folder or sort): the first page. On failure the items already shown stay; the
   * page shows the error with a retry next to them.
   */
  async reload(opts: { fresh?: boolean } = {}): Promise<void> {
    const seq = ++this.requestSeq;
    const want = opts.fresh ? PAGE : Math.max(PAGE, this.items().length);
    this.loading.set(true);
    this.error.set(null);
    try {
      // The trash is listed by its own view (library-trash); only the counts are needed here.
      const trash = this.folder().kind === 'TRASH';
      const [page, summary, buckets] = await Promise.all([
        trash ? { items: [], total: 0 } : this.fetchUpTo(want),
        this.fetchSummary(),
        trash ? null : this.fetchBuckets(),
      ]);
      if (seq !== this.requestSeq) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.summary.set(summary);
      this.buckets.set(buckets);
      this.loaded.set(true);
      this.selection.update((s) => pruneSelection(s, this.order()));
      if (this.openStackId()) void this.refreshStack();
    } catch (e) {
      // A body-less failure (network, proxy) has no message: still say something went wrong.
      if (seq === this.requestSeq)
        this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }

  /** The owner's stacks with their category: "Move to" offers them under the category. */
  readonly stacks = signal<StackDto[]>([]);

  async loadStacks(): Promise<void> {
    try {
      this.stacks.set(await this.api.invoke(stacksList));
    } catch {
      // the categories alone are offered
    }
  }

  async loadMore(limit = PAGE): Promise<void> {
    if (this.loading() || !this.hasMore()) return;
    const seq = this.requestSeq;
    this.loading.set(true);
    try {
      const page = await this.fetch(this.items().length, limit);
      if (seq !== this.requestSeq) return;
      this.items.update((list) => {
        const have = new Set(list.map((i) => i.video.id));
        return [...list, ...page.items.filter((i) => !have.has(i.video.id))];
      });
      this.total.set(page.total);
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }

  /**
   * Loads on until `count` videos are in (or the listing ends): the quick scroller jumps to a month
   * further down than the pages loaded so far. Big pieces, one after another.
   */
  async loadUntil(count: number): Promise<void> {
    const seq = this.requestSeq;
    while (this.items().length < count && this.hasMore() && seq === this.requestSeq) {
      if (this.loading()) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      const before = this.items().length;
      await this.loadMore(LIST_MAX);
      if (this.items().length === before) break;
    }
  }

  async reloadSummary(): Promise<void> {
    try {
      const summary = await this.fetchSummary();
      this.summary.set(summary);
    } catch {
      /* counts are decorative */
    }
  }

  // --- selection -----------------------------------------------------------

  click(id: string, mods: ClickModifiers): void {
    this.selection.update((s) => applyClick(s, this.order(), id, mods));
  }

  contextClick(id: string): void {
    this.selection.update((s) => applyContextClick(s, id));
  }

  selectAll(): void {
    this.selection.set(selectAll(this.order()));
  }

  clearSelection(): void {
    if (this.selection().selected.size) this.selection.set(EMPTY_SELECTION);
  }

  isSelected(id: string): boolean {
    return this.selection().selected.has(id);
  }

  /** A stack tile stands for all its videos: it is selected when every one of them is. */
  isSlotSelected(slot: Slot): boolean {
    return slotIds(slot).every((id) => this.isSelected(id));
  }

  /** A click on a tile: a stack's videos are picked or dropped together. */
  clickSlot(slot: Slot, mods: ClickModifiers): void {
    if (slot.kind === 'video') return this.click(slot.item.video.id, mods);
    const ids = slotIds(slot);
    if (mods.shift) {
      this.click(ids[ids.length - 1]!, mods);
      this.selection.update((s) => ({ ...s, selected: new Set([...s.selected, ...ids]) }));
      return;
    }
    if (mods.ctrl) {
      const allIn = this.isSlotSelected(slot);
      this.selection.update((s) => {
        const selected = new Set(s.selected);
        for (const id of ids)
          if (allIn) selected.delete(id);
          else selected.add(id);
        return { selected, anchor: ids[0]! };
      });
      return;
    }
    this.selection.set({ selected: new Set(ids), anchor: ids[0]! });
  }

  contextClickSlot(slot: Slot): void {
    if (!this.isSlotSelected(slot)) this.clickSlot(slot, { ctrl: false, shift: false });
  }

  // --- stacks ----------------------------------------------

  /** Opens a stack's window: its videos show at once from what is loaded, then all of them arrive. */
  openStack(id: string): void {
    if (this.openStackId() === id) return;
    this.openStackId.set(id);
    this.stackItems.set(this.items().filter((i) => i.stack?.id === id));
    void this.refreshStack();
  }

  closeStack(): void {
    this.openStackId.set(null);
    this.stackItems.set([]);
  }

  async refreshStack(): Promise<void> {
    const id = this.openStackId();
    if (!id) return;
    try {
      const page = await this.api.invoke(collectionList, {
        username: this.username,
        stackId: id,
        limit: 100,
        sort: this.sort(),
        dir: this.dir() ?? undefined,
      });
      if (this.openStackId() === id) this.stackItems.set(page.items);
    } catch {
      /* what is loaded stays */
    }
  }

  /**
   * Puts `ids` into the stack of `target` (a tile: the stack it is, or a new one with the video it
   * shows). `categoryId` is the category the user chose for the whole stack, when one was needed.
   */
  async stackOnto(
    target: { id: string; stackId: string | null },
    ids: string[],
    categoryId?: string | null,
  ): Promise<StackDto> {
    ids = (await this.withWholeStacks(ids)).map((i) => i.video.id);
    const category = categoryId === undefined ? {} : { categoryId };
    // More than the API takes at once goes in several requests, the stack made by the first.
    const [first = [], ...rest] = chunks(target.stackId ? ids : [target.id, ...ids], BULK_MAX);
    let stack = target.stackId
      ? await this.api.invoke(stacksAdd, {
          id: target.stackId,
          body: { videoIds: first, ...category },
        })
      : await this.api.invoke(stacksCreate, {
          body: { videoIds: first, ...category },
        });
    for (const part of rest)
      stack = await this.api.invoke(stacksAdd, {
        id: stack.id,
        body: { videoIds: part, ...category },
      });
    const members = new Set([
      ...this.items()
        .filter((i) => i.stack?.id === stack.id)
        .map((i) => i.video.id),
      target.id,
      ...ids,
    ]);
    const ref = {
      id: stack.id,
      name: stack.name,
      coverVideoId: stack.coverVideoId,
      size: stack.size,
    };
    this.patchItems([...members], (i) => ({ ...i, stack: ref, ...category }));
    // The dragged videos line up behind the stack, where the target tile is.
    const anchor =
      this.items()
        .filter((i) => members.has(i.video.id) && !ids.includes(i.video.id))
        .at(-1)?.video.id ?? target.id;
    const byId = new Map(this.items().map((i) => [i.video.id, i]));
    this.items.set(
      moveBefore(this.order(), ids, anchor, true)
        .map((id) => byId.get(id))
        .filter((i): i is CollectionItemDto => !!i),
    );
    if (categoryId !== undefined) this.dropLeavers([...members], categoryId);
    await this.afterChange();
    void this.reload();
    return stack;
  }

  /** Takes videos out of their stacks; a stack left with one video is dissolved by the server. */
  async takeOut(ids: string[]): Promise<{ dissolved: boolean }> {
    const byStack = new Map<string, string[]>();
    for (const i of [...this.items(), ...this.stackItems()])
      if (ids.includes(i.video.id) && i.stack && !byStack.get(i.stack.id)?.includes(i.video.id))
        byStack.set(i.stack.id, [...(byStack.get(i.stack.id) ?? []), i.video.id]);
    let dissolved = false;
    for (const [stackId, videoIds] of byStack) {
      const result = await this.api.invoke(stacksRemove, { id: stackId, body: { videoIds } });
      const gone = result.dissolved
        ? (i: CollectionItemDto) => i.stack?.id === stackId
        : (i: CollectionItemDto) => videoIds.includes(i.video.id);
      this.items.update((list) =>
        list.map((i) =>
          gone(i)
            ? { ...i, stack: null }
            : i.stack?.id === stackId
              ? { ...i, stack: { ...i.stack, size: result.size } }
              : i,
        ),
      );
      this.stackItems.update((list) => list.filter((i) => !gone(i)));
      dissolved ||= result.dissolved;
    }
    await this.afterChange();
    void this.reload();
    return { dissolved };
  }

  async unstack(stackId: string): Promise<void> {
    await this.api.invoke(stacksDissolve, { id: stackId });
    this.items.update((list) =>
      list.map((i) => (i.stack?.id === stackId ? { ...i, stack: null } : i)),
    );
    if (this.openStackId() === stackId) this.closeStack();
    await this.afterChange();
  }

  async renameStack(stackId: string, name: string): Promise<void> {
    await this.updateStack(stackId, { name });
  }

  /** The video on a stack's cover; null = its first video again. */
  async setCover(stackId: string, coverVideoId: string | null): Promise<void> {
    await this.updateStack(stackId, { coverVideoId });
  }

  private async updateStack(
    stackId: string,
    body: { name?: string; coverVideoId?: string | null },
  ): Promise<void> {
    const stack = await this.api.invoke(stacksUpdate, { id: stackId, body });
    const patch = (i: CollectionItemDto) =>
      i.stack?.id === stackId
        ? { ...i, stack: { ...i.stack, name: stack.name, coverVideoId: stack.coverVideoId } }
        : i;
    this.items.update((list) => list.map(patch));
    this.stackItems.update((list) => list.map(patch));
  }

  /**
   * A drag between tiles: the list changes at once, and the server moves the videos, with
   * every video of the dragged stacks, on the whole shelf — not only the loaded part, which broke
   * past 200 loaded videos and on bigger shelves. Under another sort the
   * shelf first takes the order on screen as its manual order; the saved order is then fetched
   * again. A refusal puts the list back. True when the shelf turned manual.
   */
  async moveTo(
    ids: string[],
    stackIds: string[],
    anchorId: string,
    after: boolean,
  ): Promise<boolean> {
    const adopt = this.sort() === 'manual' ? undefined : this.sort();
    const adoptDir = adopt ? (this.dir() ?? undefined) : undefined;
    const before = this.items();
    const byId = new Map(before.map((i) => [i.video.id, i]));
    this.items.set(
      moveBefore(this.order(), ids, anchorId, after)
        .map((id) => byId.get(id))
        .filter((i): i is CollectionItemDto => !!i),
    );
    try {
      await this.api.invoke(myCollectionMove, {
        body: {
          videoIds: ids,
          stackIds,
          anchorId,
          side: after ? 'after' : 'before',
          adopt,
          adoptDir,
        },
      });
    } catch (e) {
      this.items.set(before);
      throw e;
    }
    if (!adopt) return false;
    this.sort.set('manual');
    this.dir.set(null);
    await this.reload();
    return true;
  }

  /**
   * Manual order inside an open stack: the dragged videos move next to `anchorId`, nothing else on
   * the shelf moves; under another sort the shelf turns manual first, as on the shelf.
   */
  async reorderWithin(ids: string[], anchorId: string, after: boolean): Promise<boolean> {
    const adopt = this.sort() === 'manual' ? undefined : this.sort();
    const adoptDir = adopt ? (this.dir() ?? undefined) : undefined;
    const before = this.stackItems();
    const byId = new Map(before.map((i) => [i.video.id, i]));
    this.stackItems.set(
      moveBefore(
        before.map((i) => i.video.id),
        ids,
        anchorId,
        after,
      )
        .map((id) => byId.get(id))
        .filter((i): i is CollectionItemDto => !!i),
    );
    try {
      await this.api.invoke(myCollectionMove, {
        body: { videoIds: ids, anchorId, side: after ? 'after' : 'before', adopt, adoptDir },
      });
    } catch (e) {
      this.stackItems.set(before);
      throw e;
    }
    if (adopt) {
      this.sort.set('manual');
      this.dir.set(null);
    }
    void this.reload();
    return !!adopt;
  }

  /**
   * The stacks every loaded video of which is among `ids`: tiles the user picked as a whole. In a
   * stack's window single videos are picked, never their stack.
   */
  stacksIn(ids: readonly string[]): string[] {
    if (this.openStackId()) return [];
    const picked = new Set(ids);
    const byStack = new Map<string, boolean>();
    for (const i of this.items())
      if (i.stack)
        byStack.set(i.stack.id, (byStack.get(i.stack.id) ?? true) && picked.has(i.video.id));
    return [...byStack].filter(([, all]) => all).map(([id]) => id);
  }

  /**
   * The items of `ids` (shelf and stack window), with every video of a whole picked stack added, the
   * ones the shelf has not loaded too: an action on a stack tile acted on its loaded videos only, and
   * the server split or dissolved the stack.
   */
  private async withWholeStacks(ids: readonly string[]): Promise<CollectionItemDto[]> {
    const known = new Map(
      [...this.stackItems(), ...this.items()].map((i) => [i.video.id, i] as const),
    );
    const out = new Map<string, CollectionItemDto>();
    for (const id of ids) {
      const item = known.get(id);
      if (item) out.set(id, item);
    }
    for (const stackId of this.stacksIn(ids)) {
      const loaded = this.items().filter((i) => i.stack?.id === stackId);
      if (loaded.length >= (loaded[0]?.stack?.size ?? 0)) continue;
      const page = await this.api.invoke(collectionList, {
        username: this.username,
        stackId,
        limit: LIST_MAX,
      });
      for (const i of page.items) out.set(i.video.id, i);
    }
    return [...out.values()];
  }

  // --- mutations -----------------------------------------------------------

  async moveToCategory(ids: string[], categoryId: string | null): Promise<void> {
    const targets = await this.withWholeStacks(ids);
    const all = targets.map((i) => i.video.id);
    for (const part of chunks(all, BULK_MAX))
      await this.api.invoke(myCollectionUpdateHoldings, { body: { videoIds: part, categoryId } });
    this.patchItems(all, (i) => ({ ...i, categoryId }));
    // A video moved without the rest of its stack left it on the server: the
    // sizes of the stacks come back with the folder, without a stale "ghost" tile.
    const touchedStacks = targets.some((i) => i.stack);
    this.dropLeavers(all, categoryId);
    await this.afterChange();
    if (touchedStacks) void this.reload();
  }

  /** After a category change: videos that no longer belong to the open folder leave the list. */
  private dropLeavers(ids: string[], categoryId: string | null): void {
    const folder = this.folder();
    if (folder.kind === 'CATEGORY' && folder.id !== categoryId) this.drop(ids);
    if (folder.kind === 'NONE' && categoryId !== null) this.drop(ids);
  }

  /** Hidden from visitors: received videos and own ones alike ("only for me"). */
  async setHidden(ids: string[], hidden: boolean): Promise<void> {
    const eligible = (await this.withWholeStacks(ids)).map((i) => i.video.id);
    if (eligible.length === 0) return;
    for (const part of chunks(eligible, BULK_MAX))
      await this.api.invoke(myCollectionUpdateHoldings, { body: { videoIds: part, hidden } });
    this.patchItems(eligible, (i) => ({ ...i, hidden }));
    if ((this.folder().kind === 'HIDDEN') !== hidden) this.drop(eligible);
    await this.afterChange();
  }

  async setVisibility(ids: string[], visibility: Visibility): Promise<void> {
    const own = await this.ownOf(ids);
    if (own.length === 0) return;
    for (const part of chunks(own, BULK_MAX))
      await this.api.invoke(myCollectionUpdateVideos, { body: { videoIds: part, visibility } });
    this.patchItems(own, (i) => ({
      ...i,
      section: visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
      video: { ...i.video, visibility },
    }));
    const kind = this.folder().kind;
    if (
      (kind === 'PUBLIC' && visibility !== 'PUBLIC') ||
      (kind === 'PRIVATE' && visibility !== 'PRIVATE')
    )
      this.drop(own);
    await this.afterChange();
  }

  /** The sensitive mark, own videos only. */
  async setSensitive(ids: string[], sensitive: boolean): Promise<void> {
    const own = await this.ownOf(ids);
    if (own.length === 0) return;
    for (const part of chunks(own, BULK_MAX))
      await this.api.invoke(myCollectionUpdateVideos, { body: { videoIds: part, sensitive } });
    this.patchItems(own, (i) => ({ ...i, video: { ...i.video, sensitive } }));
  }

  async deleteVideos(ids: string[]): Promise<number> {
    const own = await this.ownOf(ids);
    if (own.length === 0) return 0;
    let updated = 0;
    for (const part of chunks(own, BULK_MAX))
      updated += (await this.api.invoke(myCollectionDeleteVideos, { body: { videoIds: part } }))
        .updated;
    this.drop(own);
    this.videos.forget(own);
    void this.videos.reloadQuota();
    await this.afterChange();
    if (this.openStackId()) void this.refreshStack();
    return updated;
  }

  /**
   * Received videos off my shelf: only my copy goes, the video stays with its
   * author and other holders. A stack left with one video dissolves on the server, so the shelf is
   * read again then.
   */
  async removeReceived(ids: string[]): Promise<number> {
    const received = (await this.withWholeStacks(ids)).filter((i) => i.source !== 'AUTHOR');
    if (received.length === 0) return 0;
    const gone = received.map((i) => i.video.id);
    let updated = 0;
    for (const part of chunks(gone, BULK_MAX))
      updated += (await this.api.invoke(myCollectionRemoveVideos, { body: { videoIds: part } }))
        .updated;
    this.drop(gone);
    await this.afterChange();
    if (this.openStackId()) void this.refreshStack();
    if (received.some((i) => i.stack)) void this.reload();
    return updated;
  }

  // --- internals -----------------------------------------------------------

  /** The first `want` videos of the folder, in pieces the API accepts. */
  private async fetchUpTo(want: number): Promise<{ items: CollectionItemDto[]; total: number }> {
    const items: CollectionItemDto[] = [];
    // Each page checked against a set, not the whole list so far: 4 s of CPU at tens of thousands.
    const have = new Set<string>();
    let total = 0;
    for (let offset = 0; offset < want; offset += LIST_MAX) {
      const page = await this.fetch(offset, Math.min(LIST_MAX, want - offset));
      total = page.total;
      for (const i of page.items)
        if (!have.has(i.video.id)) {
          have.add(i.video.id);
          items.push(i);
        }
      if (offset + page.items.length >= page.total || page.items.length === 0) break;
    }
    return { items, total };
  }

  /** What the folder, sort and search ask of the listing (the page and the months alike). */
  private listParams() {
    const folder = this.folder();
    const section: CollectionFilter | undefined =
      folder.kind === 'PUBLIC' ||
      folder.kind === 'PRIVATE' ||
      folder.kind === 'OTHERS' ||
      folder.kind === 'HIDDEN' ||
      folder.kind === 'INBOX'
        ? folder.kind
        : undefined;
    const categoryId =
      folder.kind === 'CATEGORY' ? folder.id : folder.kind === 'NONE' ? 'none' : undefined;
    // A search covers the whole shelf; hidden videos show only in their folder, so there
    // it stays within it.
    const q = this.search();
    const whole = !!q && folder.kind !== 'HIDDEN';
    return {
      username: this.username,
      section: whole ? undefined : section,
      categoryId: whole ? undefined : categoryId,
      sort: this.sort(),
      dir: this.dir() ?? undefined,
      q: q || undefined,
    };
  }

  private fetch(offset: number, limit = PAGE) {
    return this.api.invoke(collectionList, { ...this.listParams(), offset, limit });
  }

  /** The months (or letters) of the listing, for its headings and the quick scroller. */
  private fetchBuckets(): Promise<CollectionBucketsDto | null> {
    return this.api
      .invoke(collectionBuckets, {
        ...this.listParams(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .catch(() => null);
  }

  private fetchSummary() {
    return this.api.invoke(collectionSummary, { username: this.username });
  }

  /** The own videos among `ids`, whole picked stacks included. */
  private async ownOf(ids: string[]): Promise<string[]> {
    return (await this.withWholeStacks(ids))
      .filter((i) => i.source === 'AUTHOR')
      .map((i) => i.video.id);
  }

  /** The shelf and the open stack's window both. */
  /** The holder's own name for a received video: null shows the author's again. */
  renamed(id: string, title: string | null): void {
    this.patchItems([id], (i) => {
      const original = i.originalTitle ?? i.video.title;
      return {
        ...i,
        originalTitle: title ? original : null,
        video: { ...i.video, title: title ?? original },
      };
    });
  }

  private patchItems(ids: string[], fn: (item: CollectionItemDto) => CollectionItemDto): void {
    const set = new Set(ids);
    const patch = (list: CollectionItemDto[]) => list.map((i) => (set.has(i.video.id) ? fn(i) : i));
    this.items.update(patch);
    this.stackItems.update(patch);
  }

  private patchVideo(id: string, partial: Partial<CollectionItemDto['video']>): void {
    this.patchItems([id], (i) => ({ ...i, video: { ...i.video, ...partial } }));
  }

  private drop(ids: string[]): void {
    const set = new Set(ids);
    const before = this.items().length;
    this.items.update((list) => list.filter((i) => !set.has(i.video.id)));
    this.stackItems.update((list) => list.filter((i) => !set.has(i.video.id)));
    this.total.update((t) => Math.max(0, t - (before - this.items().length)));
    this.selection.update((s) => pruneSelection(s, this.order()));
  }

  private async afterChange(): Promise<void> {
    await this.reloadSummary();
    const summary = this.summary();
    if (summary) this.categories.setCounts(new Map(summary.categories.map((c) => [c.id, c.count])));
  }

  /** A processed (or newly uploaded) own video: patch what we show, or fetch the folder again when it is new. */
  private onChanged(video: VideoDto): void {
    if (!this.items().some((i) => i.video.id === video.id)) {
      this.requestReload();
      return;
    }
    this.patchVideo(video.id, {
      title: video.title,
      visibility: video.visibility,
      status: video.status,
      stage: video.stage,
      progress: video.progress,
      failReason: video.failReason,
      durationSec: video.durationSec,
      width: video.width,
      height: video.height,
      sizeBytes: video.sizeBytes,
      // The tile's own small pictures, as the listing gives them.
      thumbnailUrl: video.tileThumbnailUrl,
      contactSheetUrl: video.contactSheetUrl,
      frameUrls: video.tileFrameUrls,
    });
    this.patchItems([video.id], (i) => ({
      ...i,
      section:
        i.source !== 'AUTHOR' ? 'OTHERS' : video.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
    }));
  }

  /**
   * Renamed or re-marked in this tab (the upload panel, the edit dialog): only what an edit changes;
   * the picture stays the small tile copy the shelf was given.
   */
  private onEdited(video: VideoDto): void {
    this.patchVideo(video.id, {
      title: video.title,
      visibility: video.visibility,
      sensitive: video.sensitive,
    });
    this.patchItems([video.id], (i) => ({
      ...i,
      section:
        i.source !== 'AUTHOR' ? 'OTHERS' : video.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
    }));
  }

  /** Called by the page when the upload store reports a newly finished upload. */
  onUploaded(): void {
    this.requestReload();
  }
}

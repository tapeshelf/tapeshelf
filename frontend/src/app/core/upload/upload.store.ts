import { cleanTitle } from '../../shared/titles/clean-title';
import { Injectable, computed, inject, signal } from '@angular/core';

import { Api } from '../../api/api';
import { myCollectionDuplicatesCheck } from '../../api/fn/collection/my-collection-duplicates-check';
import { uploadsAbort } from '../../api/fn/uploads/uploads-abort';
import { uploadsComplete } from '../../api/fn/uploads/uploads-complete';
import { uploadsCreate } from '../../api/fn/uploads/uploads-create';
import { uploadsGet } from '../../api/fn/uploads/uploads-get';
import { uploadsListActive } from '../../api/fn/uploads/uploads-list-active';
import { uploadsPresignParts } from '../../api/fn/uploads/uploads-presign-parts';
import { stacksAdd } from '../../api/fn/collection/stacks-add';
import { stacksCreate } from '../../api/fn/collection/stacks-create';
import type { VideoDto } from '../../api/models/video-dto';
import type { Visibility } from '../../api/models/visibility';
import { toApiError } from '../api/api-error';
import { VideosStore } from '../videos/videos.store';
import { STACK_NAME_MAX, titleOr } from '../../shared/forms/limits';
import { PART_UPLOADER, PartUploadError } from './part-uploader';

export type UploadItemStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'finishing'
  | 'done'
  | 'error'
  | 'cancelled'
  /** Restored after a reload: the browser cannot re-read the file, the user must pick it again. */
  | 'needsFile';

export interface UploadMeta {
  title: string;
  description: string;
  visibility: Visibility;
  /** Marked sensitive. */
  sensitive: boolean;
  /** One of the uploader's categories. */
  categoryId: string | null;
}

/** A subfolder of an imported folder: its videos become one stack named after it. */
export interface UploadGroup {
  /** The subfolder's path from the imported folder: unique per import. */
  key: string;
  name: string;
}

export interface UploadItem {
  /** Local id (stable across reloads). */
  id: string;
  /** The stack this file goes into, when it came in a subfolder. */
  group: UploadGroup | null;
  sessionId: string | null;
  file: File | null;
  filename: string;
  size: number;
  partSize: number;
  partCount: number;
  meta: UploadMeta;
  status: UploadItemStatus;
  /** Bytes confirmed by S3 plus bytes in flight. */
  uploadedBytes: number;
  /** Localized message when status = error. */
  error: string | null;
  errorCode: string | null;
  videoId: string | null;
  /** The video's title on the server once the upload is done; the field can still rename it. */
  savedTitle: string | null;
  /**
   * Waits before it starts: while the shelf is asked whether the file is there already,
   * and, when it is, until the owner says to upload it anyway or to skip it.
   */
  held?: boolean;
  /** The video on the shelf this file seems to be already. */
  duplicateOf?: { title: string; code: string } | null;
}

interface PersistedItem {
  id: string;
  sessionId: string;
  filename: string;
  size: number;
  meta: UploadMeta;
  group?: UploadGroup | null;
}

/** States an upload no longer leaves by itself (a retry may still bring one back). */
const SETTLED: readonly UploadItemStatus[] = ['done', 'error', 'cancelled', 'needsFile'];
/** Files one duplicate check takes (backend DuplicateCheckDto). */
const DUPLICATE_CHECK_MAX = 500;

const STORAGE_KEY = 'vs.uploads';
const PART_CONCURRENCY = 3;
const FILE_CONCURRENCY = 2;
const PRESIGN_BATCH = 8;
const PART_RETRIES = 3;

interface RunState {
  controller: AbortController;
  doneParts: Map<number, string>;
  inFlight: Map<number, number>;
  urls: Map<number, string>;
  /** When the bytes sent were last shown (performance.now()). */
  shownAt: number;
}

/**
 * The bytes in flight are shown at most this often: XHR reports progress many times a second for
 * each of the parts in parallel, and every report rebuilt the list and redrew the panel.
 */
const PROGRESS_SHOW_MS = 200;

/**
 * Resumable browser → S3 uploads: parts go straight to presigned URLs with a few in
 * parallel; pause aborts the in-flight parts only; after a reload the session is restored and
 * continues from ListParts once the user re-selects the same file.
 */
@Injectable({ providedIn: 'root' })
export class UploadStore {
  private readonly api = inject(Api);
  private readonly uploader = inject(PART_UPLOADER);
  private readonly videos = inject(VideosStore);
  private readonly runs = new Map<string, RunState>();
  /** Stacks already made for a subfolder: a video finished later (a retry) joins it. */
  private readonly groupStacks = new Map<string, string>();

  readonly items = signal<UploadItem[]>([]);
  readonly panelOpen = signal(false);
  readonly collapsed = signal(false);
  /** Bytes of uploads that have not reserved their room on the server yet (no session so far). */
  readonly pendingBytes = computed(() =>
    this.items()
      .filter((i) => !i.sessionId && (i.status === 'queued' || i.status === 'preparing'))
      .reduce((sum, i) => sum + i.size, 0),
  );
  readonly activeCount = computed(
    () =>
      this.items().filter((i) =>
        ['queued', 'preparing', 'uploading', 'finishing'].includes(i.status),
      ).length,
  );

  constructor() {
    // Renamed elsewhere (the edit dialog): the panel's field shows the new name too.
    this.videos.onEdited((video) => {
      const item = this.items().find((i) => i.videoId === video.id);
      if (item && item.savedTitle !== video.title)
        this.patch(item.id, {
          savedTitle: video.title,
          meta: { ...item.meta, title: video.title },
        });
    });
  }

  /**
   * Adds files with default metadata (title = file name without extension) and starts uploading.
   * `groupOf` puts a file of an imported folder into its subfolder's stack.
   */
  addFiles(
    files: File[],
    defaults: Partial<UploadMeta> = {},
    groupOf: (file: File) => UploadGroup | null = () => null,
  ): UploadItem[] {
    const added = files.map<UploadItem>((file) => ({
      id: crypto.randomUUID(),
      group: groupOf(file),
      sessionId: null,
      file,
      filename: file.name,
      size: file.size,
      partSize: 0,
      partCount: 0,
      meta: {
        // A tidy title from the file's name: what made it a file name goes.
        title: titleOr(cleanTitle(file.name.replace(/\.[^.]+$/, '')), file.name),
        description: '',
        visibility: 'PRIVATE',
        sensitive: false,
        categoryId: null,
        ...defaults,
      },
      status: 'queued',
      uploadedBytes: 0,
      error: null,
      errorCode: null,
      videoId: null,
      savedTitle: null,
      held: true,
      duplicateOf: null,
    }));
    this.items.update((list) => [...added, ...list]);
    this.panelOpen.set(true);
    this.collapsed.set(false);
    void this.checkDuplicates(added);
    return added;
  }

  /**
   * Is it on the shelf already? The files found there wait for the owner's word; the rest
   * start. If the shelf cannot be asked, everything starts.
   */
  private async checkDuplicates(added: UploadItem[]): Promise<void> {
    const found = new Map<number, { title: string; code: string }>();
    try {
      // In pieces the API takes: past 500 files at once the whole check was refused, and nothing was
      // held back. Names as long as it takes.
      for (let at = 0; at < added.length; at += DUPLICATE_CHECK_MAX) {
        const part = added.slice(at, at + DUPLICATE_CHECK_MAX);
        const { matches } = await this.api.invoke(myCollectionDuplicatesCheck, {
          body: { files: part.map((i) => ({ name: i.filename.slice(0, 255), size: i.size })) },
        });
        for (const m of matches) found.set(at + m.index, { title: m.title, code: m.code });
      }
    } catch {
      // no answer: nothing is held back
    }
    added.forEach((item, index) => {
      const dup = found.get(index) ?? null;
      this.patch(item.id, { held: !!dup, duplicateOf: dup });
    });
    this.schedule();
  }

  /** A file found on the shelf goes up all the same. */
  uploadAnyway(id: string): void {
    this.patch(id, { held: false });
    this.schedule();
  }

  /** A file found on the shelf is not uploaded. */
  skip(id: string): void {
    const item = this.get(id);
    if (!item?.held) return;
    this.patch(id, { status: 'cancelled', held: false });
    this.persist();
  }

  /** Every file found on the shelf is skipped. */
  skipDuplicates(): void {
    for (const item of this.items()) if (item.held && item.duplicateOf) this.skip(item.id);
  }

  /** Called once at startup: unfinished sessions come back as "needsFile" until the user re-selects the file. */
  async restore(): Promise<void> {
    const persisted = this.readPersisted();
    if (persisted.length === 0) return;
    let active: Set<string>;
    try {
      active = new Set((await this.api.invoke(uploadsListActive)).map((s) => s.id));
    } catch {
      return;
    }
    const restored = persisted
      .filter((p) => active.has(p.sessionId))
      .map<UploadItem>((p) => ({
        id: p.id,
        group: p.group ?? null,
        sessionId: p.sessionId,
        file: null,
        filename: p.filename,
        size: p.size,
        partSize: 0,
        partCount: 0,
        meta: p.meta,
        status: 'needsFile',
        uploadedBytes: 0,
        error: null,
        errorCode: null,
        videoId: null,
        savedTitle: null,
      }));
    this.items.update((list) => [
      ...list,
      ...restored.filter((r) => !list.some((i) => i.id === r.id)),
    ]);
    this.persist();
    if (restored.length) this.panelOpen.set(true);
  }

  /** The user picked a file for a restored session; it must be the same file (name and size). */
  attachFile(id: string, file: File): boolean {
    const item = this.get(id);
    if (!item || item.status !== 'needsFile') return false;
    if (file.name !== item.filename || file.size !== item.size) return false;
    this.patch(id, { file, status: 'queued', error: null, errorCode: null });
    this.schedule();
    return true;
  }

  updateMeta(id: string, patch: Partial<UploadMeta>): void {
    const item = this.get(id);
    if (!item) return;
    this.patch(id, { meta: { ...item.meta, ...patch } });
    this.persist();
  }

  /**
   * Renames the video of a finished upload to what its field says now (the field edits the metadata
   * sent with the upload until then). An empty field or a refusal puts the saved title back.
   */
  async saveTitle(id: string): Promise<void> {
    const item = this.get(id);
    if (!item?.videoId || item.status !== 'done' || item.savedTitle === null) return;
    const title = item.meta.title.trim();
    if (title === item.savedTitle) return;
    const putBack = () => this.updateMeta(id, { title: item.savedTitle! });
    if (!title) return putBack();
    try {
      const video = await this.videos.update(item.videoId, { title });
      this.patch(id, { savedTitle: video.title });
      if (this.get(id)?.meta.title.trim() === title) this.updateMeta(id, { title: video.title });
    } catch (e) {
      putBack();
      throw e;
    }
  }

  pause(id: string): void {
    const item = this.get(id);
    if (!item || !['queued', 'preparing', 'uploading'].includes(item.status)) return;
    this.runs.get(id)?.controller.abort();
    this.patch(id, { status: 'paused' });
  }

  resume(id: string): void {
    const item = this.get(id);
    if (!item || (item.status !== 'paused' && item.status !== 'error')) return;
    if (!item.file) {
      this.patch(id, { status: 'needsFile' });
      return;
    }
    this.patch(id, { status: 'queued', error: null, errorCode: null });
    this.schedule();
  }

  async cancel(id: string): Promise<void> {
    const item = this.get(id);
    if (!item || item.status === 'done') return;
    this.runs.get(id)?.controller.abort();
    this.patch(id, { status: 'cancelled' });
    this.persist();
    if (item.sessionId)
      await this.api.invoke(uploadsAbort, { id: item.sessionId }).catch(() => undefined);
    this.schedule();
  }

  remove(id: string): void {
    const item = this.get(id);
    if (!item || !['done', 'error', 'cancelled', 'needsFile'].includes(item.status)) return;
    this.items.update((list) => list.filter((i) => i.id !== id));
    this.persist();
    // Out of the list, out of the way: its session held room on the shelf for a day.
    if (item.sessionId && (item.status === 'error' || item.status === 'needsFile'))
      this.abortSession(item.sessionId);
  }

  private abortSession(sessionId: string): void {
    void this.api
      .invoke(uploadsAbort, { id: sessionId })
      .catch(() => undefined)
      .then(() => this.videos.reloadQuota());
  }

  clearFinished(): void {
    this.items.update((list) => list.filter((i) => !['done', 'cancelled'].includes(i.status)));
    this.persist();
  }

  // ---------------------------------------------------------------- internals

  private get(id: string): UploadItem | undefined {
    return this.items().find((i) => i.id === id);
  }

  private patch(id: string, partial: Partial<UploadItem>): void {
    this.items.update((list) => list.map((i) => (i.id === id ? { ...i, ...partial } : i)));
  }

  private schedule(): void {
    const running = this.items().filter((i) =>
      ['preparing', 'uploading', 'finishing'].includes(i.status),
    ).length;
    const slots = FILE_CONCURRENCY - running;
    if (slots <= 0) return;
    for (const item of this.items()
      .filter((i) => i.status === 'queued' && !i.held)
      .slice(0, slots))
      void this.run(item.id);
  }

  private async run(id: string): Promise<void> {
    const state: RunState = {
      controller: new AbortController(),
      doneParts: new Map(),
      inFlight: new Map(),
      urls: new Map(),
      shownAt: 0,
    };
    this.runs.set(id, state);
    try {
      await this.prepare(id, state);
      if (state.controller.signal.aborted) return;
      await this.uploadParts(id, state);
      if (state.controller.signal.aborted) return;
      await this.finish(id, state);
    } catch (e) {
      if (isAbort(e)) return; // paused or cancelled: status already set
      const err = toApiError(e);
      const code = err.code === 'unknown' && e instanceof PartUploadError ? 'partUpload' : err.code;
      this.patch(id, { status: 'error', error: err.message || null, errorCode: code });
      if (['uploadExpired', 'uploadNotFound', 'uploadNotActive'].includes(code))
        this.patch(id, { sessionId: null, uploadedBytes: 0 });
      this.persist();
    } finally {
      this.runs.delete(id);
      this.schedule();
    }
  }

  private async prepare(id: string, state: RunState): Promise<void> {
    const item = this.get(id)!;
    this.patch(id, { status: 'preparing' });
    if (item.sessionId) {
      const session = await this.api.invoke(uploadsGet, { id: item.sessionId });
      if (session.status !== 'ACTIVE') {
        this.patch(id, { sessionId: null });
        throw Object.assign(new Error('session gone'), { code: 'uploadNotActive' });
      }
      for (const p of session.uploadedParts) state.doneParts.set(p.partNumber, p.etag);
      this.patch(id, { partSize: session.partSize, partCount: session.partCount });
    } else {
      const session = await this.api.invoke(uploadsCreate, {
        body: { filename: item.filename, size: item.size, mimeType: item.file?.type || undefined },
      });
      // Cancelled while the session was being opened: close it at once, or it holds the room on the
      // shelf for a day. Paused, it is kept to resume.
      if (this.get(id)?.status === 'cancelled') {
        this.abortSession(session.id);
        throw new DOMException('cancelled', 'AbortError');
      }
      this.patch(id, {
        sessionId: session.id,
        partSize: session.partSize,
        partCount: session.partCount,
      });
      this.persist();
    }
    this.refreshProgress(id, state);
  }

  private async uploadParts(id: string, state: RunState): Promise<void> {
    this.patch(id, { status: 'uploading' });
    const item = this.get(id)!;
    const pending = Array.from({ length: item.partCount }, (_, i) => i + 1).filter(
      (n) => !state.doneParts.has(n),
    );
    const workers = Array.from({ length: Math.min(PART_CONCURRENCY, pending.length) }, async () => {
      for (let n = pending.shift(); n !== undefined; n = pending.shift()) {
        if (state.controller.signal.aborted) return;
        await this.uploadPart(id, state, n, pending);
      }
    });
    await Promise.all(workers);
  }

  private async uploadPart(
    id: string,
    state: RunState,
    n: number,
    pending: number[],
  ): Promise<void> {
    const item = this.get(id)!;
    const start = (n - 1) * item.partSize;
    const blob = item.file!.slice(start, Math.min(item.size, start + item.partSize));
    let lastError: unknown = null;
    for (let attempt = 0; attempt < PART_RETRIES; attempt++) {
      if (state.controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      const url = await this.urlFor(id, state, n, pending, attempt > 0);
      try {
        const etag = await this.uploader.upload(
          url,
          blob,
          (loaded) => {
            state.inFlight.set(n, loaded);
            const now = performance.now();
            if (now - state.shownAt < PROGRESS_SHOW_MS) return;
            state.shownAt = now;
            this.refreshProgress(id, state);
          },
          state.controller.signal,
        );
        state.inFlight.delete(n);
        state.doneParts.set(n, etag);
        this.refreshProgress(id, state);
        return;
      } catch (e) {
        state.inFlight.delete(n);
        if (isAbort(e)) throw e;
        lastError = e;
        await delay(500 * 2 ** attempt, state.controller.signal);
      }
    }
    throw lastError;
  }

  /** Presigns a batch of upcoming parts in one request; a retry after a failure gets a fresh URL. */
  private async urlFor(
    id: string,
    state: RunState,
    n: number,
    pending: number[],
    fresh: boolean,
  ): Promise<string> {
    if (!fresh) {
      const cached = state.urls.get(n);
      if (cached) {
        state.urls.delete(n);
        return cached;
      }
    }
    const item = this.get(id)!;
    const partNumbers = [
      n,
      ...pending.filter((p) => !state.urls.has(p)).slice(0, PRESIGN_BATCH - 1),
    ];
    const res = await this.api.invoke(uploadsPresignParts, {
      id: item.sessionId!,
      body: { partNumbers },
    });
    for (const p of res.parts) if (p.partNumber !== n) state.urls.set(p.partNumber, p.url);
    const url = res.parts.find((p) => p.partNumber === n)?.url;
    if (!url) throw new PartUploadError(0, `no presigned URL for part ${n}`);
    return url;
  }

  private async finish(id: string, state: RunState): Promise<void> {
    const item = this.get(id)!;
    this.patch(id, { status: 'finishing', uploadedBytes: item.size });
    const parts = [...state.doneParts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([partNumber, etag]) => ({ partNumber, etag }));
    const video: VideoDto = await this.api.invoke(uploadsComplete, {
      id: item.sessionId!,
      body: {
        parts,
        // A title blanked in the panel falls back to the file's name, cut to fit: a long
        // name no longer fails the upload at its very end.
        title: titleOr(item.meta.title, item.filename),
        description: item.meta.description.trim() || undefined,
        visibility: item.meta.visibility,
        sensitive: item.meta.sensitive,
        categoryId: item.meta.categoryId ?? undefined,
      },
    });
    // The last of a subfolder's videos makes its stack before it counts as done: the shelf then
    // reloads once with the stack in it.
    await this.stackGroup(id, video.id).catch(() => undefined);
    this.patch(id, { status: 'done', videoId: video.id, savedTitle: video.title });
    this.persist();
    this.videos.upsert(video);
    void this.videos.reloadQuota();
    // Renamed while the upload was being finished: the new name goes after it.
    void this.saveTitle(id).catch(() => undefined);
  }

  /**
   * A subfolder's videos become a stack named after it once none of them is still on its
   * way; one video alone stays as it is (a stack of one dissolves). A video of the subfolder
   * finished after that (a retry) joins the stack.
   */
  private async stackGroup(id: string, videoId: string): Promise<void> {
    const item = this.get(id);
    const group = item?.group;
    if (!item || !group) return;
    const made = this.groupStacks.get(group.key);
    if (made) {
      await this.api.invoke(stacksAdd, { id: made, body: { videoIds: [videoId] } });
      return;
    }
    const others = this.items().filter((i) => i.group?.key === group.key && i.id !== id);
    if (others.some((i) => !SETTLED.includes(i.status))) return;
    const members = [
      ...others.filter((i) => i.status === 'done' && i.videoId),
      { ...item, videoId },
    ].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    if (members.length < 2) return;
    const stack = await this.api.invoke(stacksCreate, {
      body: {
        videoIds: members.map((i) => i.videoId!),
        name: group.name.slice(0, STACK_NAME_MAX),
        // All of the import went to the same category; one changed in the panel is brought along.
        categoryId: item.meta.categoryId,
      },
    });
    this.groupStacks.set(group.key, stack.id);
  }

  private refreshProgress(id: string, state: RunState): void {
    const item = this.get(id);
    if (!item) return;
    let bytes = 0;
    for (const n of state.doneParts.keys()) bytes += this.partBytes(item, n);
    for (const [n, loaded] of state.inFlight) bytes += Math.min(loaded, this.partBytes(item, n));
    this.patch(id, { uploadedBytes: Math.min(item.size, bytes) });
  }

  private partBytes(item: UploadItem, n: number): number {
    return Math.max(0, Math.min(item.partSize, item.size - (n - 1) * item.partSize));
  }

  private persist(): void {
    const keep = this.items()
      .filter((i) => i.sessionId && !['done', 'cancelled'].includes(i.status))
      .map<PersistedItem>((i) => ({
        id: i.id,
        sessionId: i.sessionId!,
        filename: i.filename,
        size: i.size,
        meta: i.meta,
        group: i.group,
      }));
    try {
      if (keep.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode etc. */
    }
  }

  private readPersisted(): PersistedItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? (parsed as PersistedItem[]).filter((p) => p && p.sessionId)
        : [];
    } catch {
      return [];
    }
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

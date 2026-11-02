import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { uploadsQuota } from '../../api/fn/uploads/uploads-quota';
import { videosGetOwn } from '../../api/fn/videos/videos-get-own';
import { videosListMine } from '../../api/fn/videos/videos-list-mine';
import { videosRemove } from '../../api/fn/videos/videos-remove';
import { videosSetThumbnail } from '../../api/fn/videos/videos-set-thumbnail';
import { videosUpdate } from '../../api/fn/videos/videos-update';
import type { ProcessingStage } from '../../api/models/processing-stage';
import type { SetThumbnailDto } from '../../api/models/set-thumbnail-dto';
import type { StorageQuotaDto } from '../../api/models/storage-quota-dto';
import type { UpdateVideoDto } from '../../api/models/update-video-dto';
import type { VideoDetailDto } from '../../api/models/video-detail-dto';
import type { VideoDto } from '../../api/models/video-dto';
import type { VideoStatus } from '../../api/models/video-status';
import { errorText } from '../api/api-error';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';

/** Shape of the `video.progress` websocket event (backend VideoProgressEvent). */
export interface VideoProgressEvent {
  videoId: string;
  status: VideoStatus;
  stage: ProcessingStage | null;
  progress: number;
}

/** The signed-in user's own videos with live processing state. */
/** Video news comes in bursts (a folder uploaded, a migration): the quota is read once they settle. */
const QUOTA_RELOAD_MS = 2_000;

@Injectable({ providedIn: 'root' })
export class VideosStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly ws = inject(WsService);
  private readonly editListeners = new Set<(video: VideoDto) => void>();

  readonly videos = signal<VideoDto[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly nextCursor = signal<string | null>(null);
  readonly quota = signal<StorageQuotaDto | null>(null);
  readonly hasMore = computed(() => this.nextCursor() !== null);
  private quotaTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ws.on<VideoProgressEvent>('video.progress', (e) =>
      this.patch(e.videoId, { status: e.status, stage: e.stage, progress: e.progress }),
    );
    this.ws.on<{ videoId: string }>('video.removed', ({ videoId }) => this.forget([videoId]));
    this.ws.on<{ video: VideoDto }>('video.changed', ({ video }) => {
      this.upsert(video);
      // Once after a burst settles, not per video: many videos changing at once would otherwise
      // ask hundreds of times, in every tab.
      if (this.quotaTimer) clearTimeout(this.quotaTimer);
      this.quotaTimer = setTimeout(() => {
        this.quotaTimer = null;
        void this.reloadQuota();
      }, QUOTA_RELOAD_MS);
    });
    this.ws.onResync(() => void (this.auth.userId() && this.reloadQuota()));
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.videos.set([]);
        this.nextCursor.set(null);
        this.loaded.set(false);
        this.quota.set(null);
        if (user) void this.load();
      });
    });
    // Another tier, other limits: the quota is read again (the list stays as it is).
    let tier = this.auth.tier();
    effect(() => {
      const next = this.auth.tier();
      if (next === tier) return;
      tier = next;
      if (next && this.auth.userId()) untracked(() => void this.reloadQuota());
    });
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.invoke(videosListMine, { limit: 50 });
      this.videos.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
      void this.reloadQuota();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loading()) return;
    this.loading.set(true);
    try {
      const page = await this.api.invoke(videosListMine, { cursor, limit: 50 });
      this.videos.update((list) => [
        ...list,
        ...page.items.filter((v) => !list.some((x) => x.id === v.id)),
      ]);
      this.nextCursor.set(page.nextCursor);
    } finally {
      this.loading.set(false);
    }
  }

  async reloadQuota(): Promise<void> {
    try {
      this.quota.set(await this.api.invoke(uploadsQuota));
    } catch {
      /* the indicator is optional */
    }
  }

  upsert(video: VideoDto): void {
    this.videos.update((list) =>
      list.some((v) => v.id === video.id)
        ? list.map((v) => (v.id === video.id ? { ...v, ...video } : v))
        : [video, ...list],
    );
  }

  patch(id: string, partial: Partial<VideoDto>): void {
    this.videos.update((list) => list.map((v) => (v.id === id ? { ...v, ...partial } : v)));
  }

  detail(id: string): Promise<VideoDetailDto> {
    return this.api.invoke(videosGetOwn, { id });
  }

  async update(id: string, body: UpdateVideoDto): Promise<VideoDetailDto> {
    const video = await this.api.invoke(videosUpdate, { id, body });
    this.upsert(video);
    for (const listener of this.editListeners) listener(video);
    return video;
  }

  /**
   * Own videos edited in this tab (renamed in the upload panel, saved in the edit dialog): pages that
   * show their own copy (the shelf) patch it at once. Returns the unsubscribe function.
   */
  onEdited(listener: (video: VideoDto) => void): () => void {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  /** Soft delete on the server; the tile disappears immediately. */
  async remove(id: string): Promise<void> {
    await this.api.invoke(videosRemove, { id });
    this.forget([id]);
    void this.reloadQuota();
  }

  /** Drops videos deleted elsewhere (bulk actions) from the cache. */
  forget(ids: string[]): void {
    const set = new Set(ids);
    this.videos.update((list) => list.filter((v) => !set.has(v.id)));
  }

  async setThumbnail(id: string, body: SetThumbnailDto): Promise<VideoDetailDto> {
    const video = await this.api.invoke(videosSetThumbnail, { id, body });
    this.upsert(video);
    return video;
  }
}

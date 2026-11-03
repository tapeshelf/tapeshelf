import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type EditJobDto,
  type EditStateDto,
  editorCancel,
  editorSave,
  editorState,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { WsService } from '../../core/ws/ws.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  clamp,
  cloneSpec,
  editable,
  type EditSpec,
  isIdentity,
  MIN_RANGE_SEC,
  outputDuration,
  playableFrom,
} from './edit-model';

/** What is picked on the stage or the timeline. */
export type Selection =
  { kind: 'crop' } | { kind: 'cut' | 'blur' | 'timer' | 'caption'; index: number } | null;

interface EditEvent {
  videoId: string;
  edit: { status: 'queued' | 'rendering' | 'failed' | 'done'; progress: number };
  copyId?: string;
}

const POLL_MS = 2_000;
const HISTORY = 100;

/**
 * The same render's progress only goes forward: the poll reads a number the worker wrote a moment
 * ago, the websocket tells the newest one, and they come in any order.
 */
function forward(before: EditJobDto | null, next: EditJobDto | null): EditJobDto | null {
  if (!before || !next || before.mode !== next.mode) return next;
  if (before.status === 'failed' || next.status === 'failed') return next;
  return next.progress < before.progress ? { ...next, progress: before.progress } : next;
}

/** A video whose frame rate is not known is stepped as this. */
const DEFAULT_FPS = 30;
const DRAFT_PREFIX = 'vs.editDraft.';
const DRAFT_DELAY_MS = 400;
const DRAFT_KEEP_MS = 7 * 24 * 3_600_000;

function readDraft(key: string): { base?: unknown; spec?: EditSpec } | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as {
      base?: unknown;
      spec?: EditSpec;
    } | null;
  } catch {
    return null;
  }
}

/** Drafts nobody came back to go after a week: they hold captions, on what may be a shared computer. */
function dropOldDrafts(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(DRAFT_PREFIX)) continue;
      const at = (JSON.parse(localStorage.getItem(key) ?? '{}') as { at?: number }).at ?? 0;
      if (Date.now() - at > DRAFT_KEEP_MS) localStorage.removeItem(key);
    }
  } catch {
    // nothing to tidy where there is no storage
  }
}

/**
 * One editing session: the edit being made, its history, what is picked, the
 * playhead, and the render after a save (pushed over the websocket, polled as a fallback).
 */
@Injectable()
export class EditorStore {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(Api);
  private readonly ws = inject(WsService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly state = signal<EditStateDto | null>(null);
  readonly spec = signal<EditSpec | null>(null);
  readonly selected = signal<Selection>(null);
  readonly time = signal(0);
  readonly playing = signal(false);
  /** Playback skips what is cut, as the result will. */
  readonly previewCuts = signal(true);
  /** Width / height the crop keeps while dragged; null = free. */
  readonly cropRatio = signal<number | null>(null);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);
  /** The new video, when the last save was a copy and it is done. */
  readonly copyId = signal<string | null>(null);
  /** Counts the video's versions seen here: the stage plays the new one after a save. */
  readonly generation = signal(0);

  private savedJson = '';
  /** The edit last saved as a copy: in the copy, it is not lost by leaving. */
  private copiedJson = '';
  private past: string[] = [];
  private future: string[] = [];
  /**
   * Open drags (a pointer drag, a caption being typed), each one step of history. One begun while
   * another is open — a plate dragged while its caption is typed — makes what the first changed so
   * far its own step, and the first goes on from where the second leaves it.
   */
  private drags: { id: number; from: string }[] = [];
  private dragIds = 0;
  private readonly historySize = signal({ past: 0, future: 0 });
  private poll: ReturnType<typeof setInterval> | null = null;
  /** Loads are numbered: the answer for a video left meanwhile is dropped. */
  private loads = 0;
  /** Answers about the render are numbered: one that comes after a newer one is dropped. */
  private asked = 0;
  private shown = 0;
  private offWs: (() => void) | null = null;
  video: HTMLVideoElement | null = null;

  readonly source = computed(() => this.state()?.source ?? null);
  /** One frame of the video, seconds. */
  readonly frameStep = computed(() => 1 / (this.source()?.fps ?? DEFAULT_FPS));
  readonly duration = computed(() => this.source()?.durationSec ?? 0);
  readonly job = computed(() => this.state()?.job ?? null);
  readonly pending = computed(() => {
    const job = this.job();
    return !!job && job.status !== 'failed';
  });
  readonly canUndo = computed(() => this.historySize().past > 0);
  readonly canRedo = computed(() => this.historySize().future > 0);
  readonly dirty = computed(() => {
    const spec = this.spec();
    this.historySize();
    return !!spec && JSON.stringify(spec) !== this.savedJson;
  });
  /**
   * Leaving now loses changes: they differ from the video, no render of them is under way, and they
   * were not saved as a copy either.
   */
  leavingLoses(): boolean {
    const spec = this.spec();
    return this.dirty() && !this.pending() && JSON.stringify(spec) !== this.copiedJson;
  }

  readonly identity = computed(() => {
    const spec = this.spec();
    const source = this.source();
    return !!spec && !!source && isIdentity(spec, source);
  });
  readonly resultDuration = computed(() => {
    const spec = this.spec();
    return spec ? outputDuration(spec) : 0;
  });

  async load(videoId: string): Promise<void> {
    const seq = ++this.loads;
    // Another video in the same page (a notification's link to its editor): nothing of the last one
    // stays — its spec, its history, its player.
    if (this.state() && this.state()!.videoId !== videoId) this.forget();
    try {
      const state = await this.api.invoke(editorState, { id: videoId });
      // The editor was left while it loaded: no poll and no handler for a store nobody shows
      // (they stayed registered for good). Or another video was asked for since.
      if (this.disposed || seq !== this.loads) return;
      this.adopt(state, true);
      this.restoreDraft(state);
      this.offWs?.();
      this.offWs = this.ws.on<EditEvent>('video.edit', (e) => this.onEvent(e));
    } catch (e) {
      this.loadError.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  private forget(): void {
    this.stopPolling();
    this.state.set(null);
    this.spec.set(null);
    this.loadError.set(null);
    this.copyId.set(null);
    this.selected.set(null);
    this.playing.set(false);
    this.time.set(0);
    this.past = [];
    this.future = [];
    this.drags = [];
    this.copiedJson = '';
    this.syncHistory();
  }

  destroy(): void {
    this.disposed = true;
    this.stopPolling();
    this.offWs?.();
    // Left: what is there now decides, without waiting for the moment after the last change.
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.keepDraft();
  }

  private disposed = false;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.spec();
      this.pending();
      this.historySize();
      if (untracked(this.state)) untracked(() => this.keepDraftSoon());
    });
  }

  // ---------------------------------------------------------------- the draft

  /** Where this person's unsaved edit of this video is kept in the browser. */
  private draftKey(state: EditStateDto): string {
    return `${DRAFT_PREFIX}${this.auth.user()?.id ?? ''}.${state.videoId}`;
  }

  /** The video it was made on: a draft of an older version is not offered on a newer one. */
  private draftBase(state: EditStateDto): string {
    const { durationSec, width, height } = state.source;
    return JSON.stringify([durationSec, width, height, state.frameUrls[0] ?? '']);
  }

  /** Writes what leaving would lose, a moment after the last change; otherwise leaves no draft. */
  private keepDraftSoon(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.keepDraft(), DRAFT_DELAY_MS);
  }

  private keepDraft(): void {
    this.draftTimer = null;
    const state = this.state();
    if (!state) return;
    try {
      const key = this.draftKey(state);
      if (!this.leavingLoses()) localStorage.removeItem(key);
      else
        localStorage.setItem(
          key,
          JSON.stringify({ at: Date.now(), base: this.draftBase(state), spec: this.spec() }),
        );
    } catch {
      // private window, full storage: the editor works on without a draft
    }
  }

  /** Back after a reload or a crash: the changes come back, one undo from the video as it is. */
  private restoreDraft(state: EditStateDto): void {
    dropOldDrafts();
    if (state.job) return;
    const draft = readDraft(this.draftKey(state));
    if (!draft?.spec || draft.base !== this.draftBase(state)) return;
    const fresh = this.spec();
    let spec: EditSpec;
    try {
      spec = editable(draft.spec, state.source);
    } catch {
      return;
    }
    if (JSON.stringify(spec) === JSON.stringify(fresh)) return;
    this.remember(JSON.stringify(fresh));
    this.spec.set(spec);
    this.toast.withAction(this.t.translate('editor.draftRestored'), {
      label: this.t.translate('editor.draftDiscard'),
      run: () => this.undoAll(),
    });
  }

  /** Back to the video as it is: every change undone, the history cleared. */
  private undoAll(): void {
    const first = this.past[0];
    if (!first) return;
    this.spec.set(JSON.parse(first) as EditSpec);
    this.past = [];
    this.future = [];
    this.syncHistory();
    this.dropStaleSelection();
  }

  // ---------------------------------------------------------------- changes

  /** One change of the edit (a button, a field): it can be undone. */
  change(fn: (spec: EditSpec) => void): void {
    const spec = this.spec();
    if (!spec) return;
    this.remember(JSON.stringify(spec));
    const next = cloneSpec(spec);
    fn(next);
    this.spec.set(next);
  }

  /** A drag: many small changes, one step of history. Its handle ends it (`endDrag`). */
  beginDrag(): number {
    const id = ++this.dragIds;
    const spec = this.spec();
    if (!spec) return id;
    const now = JSON.stringify(spec);
    const open = this.drags.at(-1);
    if (open) {
      this.step(open.from, now);
      open.from = now;
    }
    this.drags.push({ id, from: now });
    return id;
  }

  drag(fn: (spec: EditSpec) => void): void {
    const spec = this.spec();
    if (!spec) return;
    const next = cloneSpec(spec);
    fn(next);
    this.spec.set(next);
  }

  endDrag(id: number): void {
    const i = this.drags.findIndex((d) => d.id === id);
    if (i < 0) return;
    const [drag] = this.drags.splice(i, 1);
    const spec = this.spec();
    if (!spec) return;
    const now = JSON.stringify(spec);
    this.step(drag!.from, now);
    const open = this.drags.at(-1);
    if (open) open.from = now;
  }

  /** What changed between two states, as one step of history. */
  private step(from: string, now: string): void {
    if (from !== now) this.remember(from);
  }

  /** The start or the end of what stays, at least a second apart. */
  trimTo(end: 'start' | 'end', t: number): void {
    const d = this.duration();
    this.change((s) => {
      if (end === 'start') s.trim.start = clamp(t, 0, s.trim.end - 1);
      else s.trim.end = clamp(t, s.trim.start + 1, d);
    });
  }

  /** I and O: the start or the end of what is picked moves to `t`; nothing picked, the trim's. */
  rangeTo(end: 'start' | 'end', t: number): void {
    const sel = this.selected();
    if (!sel || sel.kind === 'crop') return this.trimTo(end, t);
    const d = this.duration();
    this.change((s) => {
      const item = { cut: s.cuts, blur: s.blurs, timer: s.timers, caption: s.captions }[sel.kind][
        sel.index
      ];
      if (!item) return;
      if (end === 'start') item.start = clamp(t, 0, item.end - MIN_RANGE_SEC);
      else item.end = clamp(t, item.start + MIN_RANGE_SEC, d);
    });
  }

  undo(): void {
    const spec = this.spec();
    const prev = this.past.pop();
    if (!spec || !prev) return;
    this.future.push(JSON.stringify(spec));
    this.spec.set(JSON.parse(prev) as EditSpec);
    this.syncHistory();
    this.dropStaleSelection();
  }

  redo(): void {
    const spec = this.spec();
    const next = this.future.pop();
    if (!spec || !next) return;
    this.past.push(JSON.stringify(spec));
    this.spec.set(JSON.parse(next) as EditSpec);
    this.syncHistory();
    this.dropStaleSelection();
  }

  // ---------------------------------------------------------------- playback

  attachVideo(video: HTMLVideoElement | null): void {
    this.video = video;
  }

  seek(t: number): void {
    const time = Math.min(Math.max(0, t), this.duration());
    this.time.set(time);
    if (this.video) this.video.currentTime = time;
  }

  togglePlay(): void {
    const v = this.video;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    const spec = this.spec();
    if (spec && this.previewCuts()) {
      const from = playableFrom(spec, v.currentTime);
      if (from === null) this.seek(spec.trim.start);
      else if (from !== v.currentTime) this.seek(from);
    }
    void v.play().catch(() => undefined);
  }

  /** Called on every frame while playing: the cuts are skipped, the end stops it. */
  follow(t: number): void {
    this.time.set(t);
    const spec = this.spec();
    const v = this.video;
    if (!spec || !v || v.paused || !this.previewCuts()) return;
    const next = playableFrom(spec, t);
    if (next === null) {
      v.pause();
      this.seek(spec.trim.end);
    } else if (next - t > 0.05) this.seek(next);
  }

  // ---------------------------------------------------------------- saving

  async save(mode: 'replace' | 'copy'): Promise<void> {
    const state = this.state();
    let spec = this.spec();
    if (!state || !spec || this.busy()) return;
    // A caption left empty says nothing: it is dropped rather than refused.
    if (spec.captions.some((c) => !c.text.trim())) {
      spec = { ...spec, captions: spec.captions.filter((c) => c.text.trim()) };
      this.spec.set(spec);
      this.dropStaleSelection();
    }
    await this.run(
      () => this.api.invoke(editorSave, { id: state.videoId, body: { mode, spec } }),
      spec,
    );
  }

  async cancel(): Promise<void> {
    const state = this.state();
    if (!state || this.busy()) return;
    await this.run(() => this.api.invoke(editorCancel, { id: state.videoId }), undefined);
  }

  // ---------------------------------------------------------------- internals

  private async run(
    fn: () => Promise<EditStateDto>,
    savedSpec: EditSpec | undefined,
  ): Promise<void> {
    this.busy.set(true);
    try {
      const mine = ++this.asked;
      const state = await fn();
      this.shown = Math.max(this.shown, mine);
      this.state.set(state);
      // Into the same video: what was sent is what it is about to become. Otherwise (a copy, a
      // cancel) the video stays as it is, so the changes still differ from it.
      const job = state.job;
      this.savedJson = JSON.stringify(
        job?.mode === 'replace' && job.status !== 'failed'
          ? (savedSpec ?? this.spec())
          : editable(null, state.source),
      );
      if (savedSpec && job?.mode === 'copy' && job.status !== 'failed')
        this.copiedJson = JSON.stringify(savedSpec);
      this.syncHistory();
      this.copyId.set(null);
      this.watch();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  private adopt(state: EditStateDto, resetSpec: boolean): void {
    this.state.set(state);
    if (resetSpec) {
      // Every edit starts afresh on the video as it is now.
      const fresh = editable(null, state.source);
      const job = state.job;
      // A save that failed while nobody waited here: its changes are back for another try. One
      // still rendering into the video is shown as it was saved.
      const shown =
        job?.spec && (job.status === 'failed' || job.mode === 'replace') ? job.spec : null;
      const spec = shown ? editable(shown, state.source) : fresh;
      this.spec.set(spec);
      this.savedJson = JSON.stringify(job?.status === 'failed' ? fresh : spec);
      this.past = [];
      this.future = [];
      this.copiedJson = '';
      // A drag open across the swap would put the old version's spec into the new history.
      this.drags = [];
      this.selected.set(null);
      this.syncHistory();
    }
    this.watch();
  }

  /** While a render is pending: poll (the websocket usually says it first). */
  private watch(): void {
    if (this.disposed) return this.stopPolling();
    if (this.pending()) {
      if (!this.poll) this.poll = setInterval(() => void this.refresh(), POLL_MS);
    } else this.stopPolling();
  }

  private async refresh(): Promise<void> {
    const state = this.state();
    if (!state) return;
    const mine = ++this.asked;
    try {
      const fresh = await this.api.invoke(editorState, { id: state.videoId });
      if (mine < this.shown) return;
      this.shown = mine;
      // Compared with what is shown when the answer lands, not when it was asked: the websocket
      // and the poll may ask at once, and the end of a render is told once.
      const before = this.state()?.job ?? null;
      this.state.set({ ...fresh, job: forward(before, fresh.job) });
      if (before && before.status !== 'failed' && !fresh.job) {
        this.done(before.mode);
        // The video is its new version now: the editor starts again on it, with nothing of the
        // edit just made to change or undo.
        if (before.mode === 'replace') {
          this.adopt(fresh, true);
          this.generation.update((g) => g + 1);
        }
      } else if (fresh.job?.status === 'failed' && before?.status !== 'failed')
        this.toast.error(this.t.translate('editor.failed'));
      this.watch();
    } catch {
      /* next tick */
    }
  }

  private onEvent(e: EditEvent): void {
    const state = this.state();
    if (!state || e.videoId !== state.videoId) return;
    if (e.copyId) this.copyId.set(e.copyId);
    const job = state.job;
    if (job && (e.edit.status === 'rendering' || e.edit.status === 'queued'))
      this.state.set({
        ...state,
        job: forward(job, { ...job, status: e.edit.status, progress: e.edit.progress }),
      });
    if (e.edit.status === 'done' || e.edit.status === 'failed') void this.refresh();
  }

  private done(mode: 'replace' | 'copy'): void {
    // A copy whose id came with the event gets the toast with a way to it (the page shows it).
    if (mode === 'copy' && this.copyId()) return;
    this.toast.success(this.t.translate(mode === 'copy' ? 'editor.copyDone' : 'editor.done'));
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private remember(json: string): void {
    this.past.push(json);
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
    this.syncHistory();
  }

  private syncHistory(): void {
    this.historySize.set({ past: this.past.length, future: this.future.length });
  }

  private dropStaleSelection(): void {
    const sel = this.selected();
    const spec = this.spec();
    if (!sel || sel.kind === 'crop' || !spec) return;
    const list = { cut: spec.cuts, blur: spec.blurs, timer: spec.timers, caption: spec.captions }[
      sel.kind
    ];
    if (sel.index >= list.length) this.selected.set(null);
  }
}

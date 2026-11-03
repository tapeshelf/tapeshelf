import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Api, type EditStateDto, editorState } from '../../api';
import { WsService } from '../../core/ws/ws.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { EditorStore } from './editor.store';

const SOURCE = { width: 640, height: 360, durationSec: 4, hasAudio: true, fps: 25 };

function state(job: EditStateDto['job']): EditStateDto {
  return {
    videoId: 'v1',
    frameUrls: [],
    code: 'k3x9ab2',
    title: 'Trip',
    source: SOURCE,
    job,
    canCopy: true,
    foreign: false,
  };
}

const RENDERING: EditStateDto['job'] = {
  mode: 'replace',
  status: 'rendering',
  progress: 40,
  error: null,
  spec: null,
};

/** Each state request waits until the test answers it, in any order. */
class FakeApi {
  current = state(RENDERING);
  pending: ((s: EditStateDto) => void)[] = [];
  hold = false;

  invoke(fn: unknown): Promise<unknown> {
    if (fn !== editorState) return Promise.resolve({});
    if (!this.hold) return Promise.resolve(this.current);
    return new Promise((resolve) => this.pending.push(resolve));
  }
}

class FakeWs {
  handlers = new Map<string, (payload: unknown) => void>();
  on(event: string, handler: (payload: unknown) => void): () => void {
    this.handlers.set(event, handler);
    return () => this.handlers.delete(event);
  }
  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EditorStore', () => {
  let api: FakeApi;
  let ws: FakeWs;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    withAction: ReturnType<typeof vi.fn>;
  };
  let store: EditorStore;

  beforeEach(() => {
    api = new FakeApi();
    ws = new FakeWs();
    localStorage.clear();
    toast = { success: vi.fn(), error: vi.fn(), withAction: vi.fn() };
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideHttpClient(),
        { provide: Api, useValue: api },
        { provide: WsService, useValue: ws },
        { provide: ToastService, useValue: toast },
        EditorStore,
      ],
    });
    store = TestBed.inject(EditorStore);
  });

  describe('the draft', () => {
    const KEY = 'vs.editDraft..v1';
    const drafted = () =>
      JSON.parse(localStorage.getItem(KEY) ?? 'null') as { spec?: unknown } | null;

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    async function ready(): Promise<void> {
      api.current = state(null);
      const loaded = store.load('v1');
      await vi.advanceTimersByTimeAsync(0);
      await loaded;
      TestBed.tick();
    }

    it('keeps what leaving would lose and brings it back, one undo from the video', async () => {
      await ready();
      store.change((s) => void (s.volume = 0.5));
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(500);
      expect(drafted()?.spec).toMatchObject({ volume: 0.5 });

      const again = TestBed.runInInjectionContext(() => new EditorStore());
      api.current = state(null);
      const loaded = again.load('v1');
      await vi.advanceTimersByTimeAsync(0);
      await loaded;
      expect(again.spec()?.volume).toBe(0.5);
      expect(toast.withAction).toHaveBeenCalledTimes(1);
      again.undo();
      expect(again.spec()?.volume).toBe(1);
    });

    it('leaves none once there is nothing to lose', async () => {
      await ready();
      store.change((s) => void (s.volume = 0.5));
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(500);
      store.undo();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(500);
      expect(drafted()).toBeNull();
    });

    it('does not offer a draft of another version of the video', async () => {
      await ready();
      localStorage.setItem(
        KEY,
        JSON.stringify({ at: Date.now(), base: 'older', spec: { ...store.spec(), volume: 0.5 } }),
      );
      const again = TestBed.runInInjectionContext(() => new EditorStore());
      api.current = state(null);
      const loaded = again.load('v1');
      await vi.advanceTimersByTimeAsync(0);
      await loaded;
      expect(again.spec()?.volume).toBe(1);
      expect(toast.withAction).not.toHaveBeenCalled();
    });
  });

  it('tells the end of a render once, whatever order the answers come in', async () => {
    await store.load('v1');
    expect(store.pending()).toBe(true);
    api.hold = true;
    // The websocket says "done" while a poll is on its way: two questions at once.
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'done', progress: 100 } });
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'done', progress: 100 } });
    expect(api.pending).toHaveLength(2);
    const [older, newer] = api.pending;
    newer!(state(null));
    await flush();
    expect(store.job()).toBeNull();
    expect(toast.success).toHaveBeenCalledTimes(1);
    // The older answer, from before the render ended, lands last: it changes nothing.
    older!(state(RENDERING));
    await flush();
    expect(store.job()).toBeNull();
    expect(store.pending()).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(1);
    store.destroy();
  });

  it('progress over the websocket moves the bar without asking the server', async () => {
    await store.load('v1');
    api.hold = true;
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'rendering', progress: 75 } });
    expect(store.job()?.progress).toBe(75);
    expect(api.pending).toHaveLength(0);
    ws.emit('video.edit', { videoId: 'other', edit: { status: 'rendering', progress: 5 } });
    expect(store.job()?.progress).toBe(75);
    store.destroy();
  });

  it('the bar never goes back: a poll may read a number older than the websocket told', async () => {
    await store.load('v1');
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'rendering', progress: 75 } });
    api.current = state({ ...RENDERING!, progress: 60 });
    await (store as unknown as { refresh(): Promise<void> }).refresh();
    expect(store.job()?.progress).toBe(75);
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'rendering', progress: 70 } });
    expect(store.job()?.progress).toBe(75);
    ws.emit('video.edit', { videoId: 'v1', edit: { status: 'rendering', progress: 81 } });
    expect(store.job()?.progress).toBe(81);
    store.destroy();
  });

  it('a save that failed while nobody waited: its changes are back in the editor', async () => {
    const tried = { ...state(null).source, durationSec: 4 };
    api.current = state({
      mode: 'replace',
      status: 'failed',
      progress: 0,
      error: 'render',
      spec: {
        rotate: 90,
        flipH: false,
        flipV: false,
        crop: null,
        trim: { start: 0, end: tried.durationSec },
        cuts: [],
        blurs: [],
        timers: [],
        captions: [],
        volume: 1,
        normalize: false,
      },
    });
    await store.load('v1');
    expect(store.spec()?.rotate).toBe(90);
    // Not saved: the video still shows the original, so it can be tried again.
    expect(store.dirty()).toBe(true);
    store.destroy();
  });

  it('a plate dragged while its caption is typed: each change is undone on its own', async () => {
    api.current = state(null);
    await store.load('v1');
    const typing = store.beginDrag();
    store.drag((s) => void (s.volume = 0.5)); // typed
    const drag = store.beginDrag();
    store.drag((s) => void (s.normalize = true)); // the plate moved
    store.endDrag(drag);
    store.drag((s) => void (s.volume = 0.25)); // typed on
    store.endDrag(typing);
    store.undo();
    expect(store.spec()).toMatchObject({ volume: 0.5, normalize: true });
    store.undo();
    expect(store.spec()).toMatchObject({ volume: 0.5, normalize: false });
    store.undo();
    expect(store.spec()).toMatchObject({ volume: 1, normalize: false });
    store.destroy();
  });
});

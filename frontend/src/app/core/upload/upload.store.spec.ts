import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import {
  Api,
  type UploadSessionDto,
  type VideoDto,
  myCollectionDuplicatesCheck,
  uploadsAbort,
  uploadsComplete,
  uploadsCreate,
  uploadsGet,
  uploadsListActive,
  uploadsPresignParts,
  stacksAdd,
  stacksCreate,
  videosUpdate,
} from '../../api';
import { VideosStore } from '../videos/videos.store';
import { PART_UPLOADER, type PartUploader } from './part-uploader';
import { UploadStore } from './upload.store';

const MiB = 1024 * 1024;
const PART_SIZE = 16 * MiB;

function fakeFile(name: string, size: number): File {
  return {
    name,
    size,
    type: 'video/mp4',
    slice: () => new Blob([new Uint8Array(1)]),
  } as unknown as File;
}

/** Stands in for the generated client: answers by function identity and records every call. */
class FakeApi {
  calls: { fn: unknown; params: Record<string, unknown> | undefined }[] = [];
  session: UploadSessionDto | null = null;
  createError: unknown = null;
  updateError: unknown = null;
  /** Holds the answer to "complete" until resolved (to type while an upload is being finished). */
  completeGate: Promise<void> | null = null;
  /** Holds the answer to "create" until resolved (to cancel while a session is being opened). */
  createGate: Promise<void> | null = null;
  completeError: unknown = null;
  /** The shelf's answer to "are these on it already?"; none by default (nothing is held). */
  duplicates: ((files: { name: string; size: number }[]) => unknown[]) | null = null;
  private sessions = 0;

  async invoke(fn: unknown, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ fn, params });
    if (fn === uploadsCreate) {
      await this.createGate;
      if (this.createError) throw this.createError;
      const body = params!['body'] as { filename: string; size: number };
      this.session = {
        id: `sess-${++this.sessions}`,
        filename: body.filename,
        size: body.size,
        partSize: PART_SIZE,
        partCount: Math.ceil(body.size / PART_SIZE),
        status: 'ACTIVE',
        uploadedParts: [],
        videoId: null,
        createdAt: '',
        expiresAt: '',
      };
      return this.session;
    }
    if (fn === uploadsGet) return this.session;
    if (fn === uploadsListActive) return this.session ? [this.session] : [];
    if (fn === uploadsPresignParts) {
      const body = params!['body'] as { partNumbers: number[] };
      return {
        parts: body.partNumbers.map((n) => ({ partNumber: n, url: `https://s3.local/part/${n}` })),
        expiresAt: '',
      };
    }
    if (fn === uploadsComplete) {
      await this.completeGate;
      if (this.completeError) throw this.completeError;
      const body = params!['body'] as { title: string };
      return { id: params!['id'], title: body.title, status: 'QUEUED', progress: 0 } as VideoDto;
    }
    if (fn === uploadsAbort) return { ok: true };
    if (fn === myCollectionDuplicatesCheck && this.duplicates) {
      const { files } = params!['body'] as { files: { name: string; size: number }[] };
      return { matches: this.duplicates(files) };
    }
    if (fn === stacksCreate) return { id: 'stack-1' };
    if (fn === stacksAdd) return { id: params!['id'] };
    if (fn === videosUpdate) {
      if (this.updateError) throw this.updateError;
      const body = params!['body'] as { title: string };
      return { id: params!['id'], title: body.title, status: 'QUEUED', progress: 0 } as VideoDto;
    }
    throw new Error(`unexpected api call ${(fn as { PATH?: string }).PATH}`);
  }

  of(fn: unknown) {
    return this.calls.filter((c) => c.fn === fn);
  }
}

interface PendingPart {
  url: string;
  resolve: (etag: string) => void;
  reject: (e: unknown) => void;
}

class FakeUploader implements PartUploader {
  manual = false;
  pending: PendingPart[] = [];
  started: string[] = [];
  concurrent = 0;
  maxConcurrent = 0;

  upload(
    url: string,
    _body: Blob,
    onProgress: (n: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    this.started.push(url);
    this.concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    const part = url.split('/').pop();
    return new Promise<string>((resolve, reject) => {
      const done = (fn: () => void) => {
        this.concurrent--;
        fn();
      };
      signal.addEventListener(
        'abort',
        () => done(() => reject(new DOMException('aborted', 'AbortError'))),
        {
          once: true,
        },
      );
      if (this.manual) {
        this.pending.push({
          url,
          resolve: (e) => done(() => resolve(e)),
          reject: (e) => done(() => reject(e)),
        });
      } else {
        onProgress(1);
        setTimeout(() => done(() => resolve(`"etag-${part}"`)), 0);
      }
    });
  }
}

async function until(check: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('condition not met');
}

describe('UploadStore', () => {
  let store: UploadStore;
  let api: FakeApi;
  let uploader: FakeUploader;
  let videos: VideosStore;

  beforeEach(() => {
    localStorage.clear();
    api = new FakeApi();
    uploader = new FakeUploader();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: Api, useValue: api },
        { provide: PART_UPLOADER, useValue: uploader },
      ],
    });
    store = TestBed.inject(UploadStore);
    videos = TestBed.inject(VideosStore);
  });

  it('splits the file into parts, uploads a few at a time and completes with ordered ETags', async () => {
    const upsert = vi.spyOn(videos, 'upsert');
    const [item] = store.addFiles([fakeFile('My Clip.mp4', 40 * MiB)]);
    expect(item!.meta).toMatchObject({
      title: 'My Clip',
      visibility: 'PRIVATE',
    });
    await until(() => store.items()[0]!.status === 'done');

    expect(api.of(uploadsCreate)[0]!.params).toEqual({
      body: { filename: 'My Clip.mp4', size: 40 * MiB, mimeType: 'video/mp4' },
    });
    expect(uploader.started).toHaveLength(3);
    expect(uploader.maxConcurrent).toBeLessThanOrEqual(3);
    const complete = api.of(uploadsComplete)[0]!.params as {
      id: string;
      body: { parts: unknown[]; title: string };
    };
    expect(complete.id).toBe('sess-1');
    expect(complete.body.parts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    expect(complete.body.title).toBe('My Clip');
    expect(store.items()[0]).toMatchObject({
      status: 'done',
      videoId: 'sess-1',
      uploadedBytes: 40 * MiB,
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'sess-1' }));
    expect(localStorage.getItem('vs.uploads')).toBeNull();
  });

  it('the videos of an imported subfolder become one stack named after it once all are done', async () => {
    const group = { key: 'Trip/Day 1', name: 'Day 1' };
    const files = [fakeFile('b.mp4', MiB), fakeFile('a.mp4', MiB), fakeFile('loose.mp4', MiB)];
    store.addFiles(files, {}, (f) => (f.name === 'loose.mp4' ? null : group));
    await until(() => store.items().every((i) => i.status === 'done'));
    const calls = api.of(stacksCreate);
    expect(calls).toHaveLength(1);
    const ids = new Map(store.items().map((i) => [i.filename, i.videoId]));
    // In the folder's order (by name), named after the subfolder; the loose file stays out.
    expect(calls[0]!.params).toEqual({
      body: { videoIds: [ids.get('a.mp4'), ids.get('b.mp4')], name: 'Day 1', categoryId: null },
    });
    expect(api.of(stacksAdd)).toHaveLength(0);
  });

  it('more files than one duplicate check takes are checked in pieces, none left unchecked', async () => {
    api.duplicates = (files) =>
      files.length === 1 ? [{ index: 0, title: 'Already here', code: 'abc1234' }] : [];
    const items = store.addFiles(
      Array.from({ length: 501 }, (_, i) => fakeFile(`clip ${i}.mp4`, MiB)),
    );
    await until(() => api.of(myCollectionDuplicatesCheck).length === 2);
    const sizes = api
      .of(myCollectionDuplicatesCheck)
      .map((c) => (c.params!['body'] as { files: unknown[] }).files.length);
    expect(sizes).toEqual([500, 1]);
    await until(() => !!store.items().find((i) => i.id === items[500]!.id)!.held);
    expect(store.items().find((i) => i.id === items[500]!.id)!.duplicateOf).toEqual({
      title: 'Already here',
      code: 'abc1234',
    });
    expect(store.items().find((i) => i.id === items[0]!.id)!.held).toBe(false);
    for (const item of items) store.cancel(item.id);
  });

  it('a subfolder with a single video makes no stack', async () => {
    store.addFiles([fakeFile('only.mp4', MiB)], {}, () => ({ key: 'Trip/One', name: 'One' }));
    await until(() => store.items()[0]!.status === 'done');
    expect(api.of(stacksCreate)).toHaveLength(0);
  });

  it('after the upload the name still renames the video; empty or refused, the saved name comes back', async () => {
    const edited = vi.fn();
    videos.onEdited(edited);
    const [item] = store.addFiles([fakeFile('My Clip.mp4', 4 * MiB)]);
    await until(() => store.items()[0]!.status === 'done');
    expect(store.items()[0]!.savedTitle).toBe('My Clip');

    store.updateMeta(item!.id, { title: 'Morning surf' });
    await store.saveTitle(item!.id);
    expect(api.of(videosUpdate)[0]!.params).toEqual({
      id: 'sess-1',
      body: { title: 'Morning surf' },
    });
    expect(store.items()[0]).toMatchObject({
      savedTitle: 'Morning surf',
      meta: { title: 'Morning surf' },
    });
    expect(edited).toHaveBeenCalledWith(expect.objectContaining({ title: 'Morning surf' }));

    // Unchanged: no request. Empty: the saved name is back, no request either.
    await store.saveTitle(item!.id);
    store.updateMeta(item!.id, { title: '  ' });
    await store.saveTitle(item!.id);
    expect(api.of(videosUpdate)).toHaveLength(1);
    expect(store.items()[0]!.meta.title).toBe('Morning surf');

    api.updateError = new HttpErrorResponse({ status: 400 });
    store.updateMeta(item!.id, { title: 'Nope' });
    await expect(store.saveTitle(item!.id)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(store.items()[0]!.meta.title).toBe('Morning surf');
  });

  it('a name typed while the upload was being finished goes to the video right after', async () => {
    let finish!: () => void;
    api.completeGate = new Promise((resolve) => (finish = resolve));
    const [item] = store.addFiles([fakeFile('clip.mp4', 4 * MiB)]);
    store.updateMeta(item!.id, { title: 'Sent with the upload' });
    await until(() => api.of(uploadsComplete).length === 1);
    expect(store.items()[0]!.status).toBe('finishing');
    store.updateMeta(item!.id, { title: 'Typed while finishing' });
    finish();
    await until(() => api.of(videosUpdate).length === 1);
    expect((api.of(uploadsComplete)[0]!.params as { body: { title: string } }).body.title).toBe(
      'Sent with the upload',
    );
    expect(api.of(videosUpdate)[0]!.params).toEqual({
      id: 'sess-1',
      body: { title: 'Typed while finishing' },
    });
  });

  it('restores an unfinished session after a reload and resumes from the parts S3 already has', async () => {
    api.session = {
      id: 'sess-1',
      filename: 'big.mp4',
      size: 40 * MiB,
      partSize: PART_SIZE,
      partCount: 3,
      status: 'ACTIVE',
      uploadedParts: [{ partNumber: 1, etag: 'etag-1', size: PART_SIZE }],
      videoId: null,
      createdAt: '',
      expiresAt: '',
    };
    localStorage.setItem(
      'vs.uploads',
      JSON.stringify([
        {
          id: 'local-1',
          sessionId: 'sess-1',
          filename: 'big.mp4',
          size: 40 * MiB,
          meta: {
            title: 'Big',
            description: '',
            visibility: 'PUBLIC',
            sensitive: false,
          },
        },
      ]),
    );
    await store.restore();
    expect(store.items()[0]).toMatchObject({
      id: 'local-1',
      status: 'needsFile',
      meta: { title: 'Big' },
    });

    expect(store.attachFile('local-1', fakeFile('other.mp4', 40 * MiB))).toBe(false);
    expect(store.attachFile('local-1', fakeFile('big.mp4', 41 * MiB))).toBe(false);
    expect(store.attachFile('local-1', fakeFile('big.mp4', 40 * MiB))).toBe(true);
    await until(() => store.items()[0]!.status === 'done');

    expect(api.of(uploadsCreate)).toHaveLength(0);
    expect(uploader.started).toEqual(['https://s3.local/part/2', 'https://s3.local/part/3']);
    const complete = api.of(uploadsComplete)[0]!.params as {
      body: { parts: unknown[]; visibility: string };
    };
    expect(complete.body.parts).toEqual([
      { partNumber: 1, etag: 'etag-1' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    expect(complete.body.visibility).toBe('PUBLIC');
  });

  it('pauses by aborting in-flight parts and resumes from the server state', async () => {
    uploader.manual = true;
    const [item] = store.addFiles([fakeFile('a.mp4', 40 * MiB)]);
    await until(() => uploader.pending.length === 3);
    store.pause(item!.id);
    await until(() => store.items()[0]!.status === 'paused');
    expect(uploader.concurrent).toBe(0);

    uploader.manual = false;
    store.resume(item!.id);
    await until(() => store.items()[0]!.status === 'done');
    expect(api.of(uploadsGet)).toHaveLength(1); // re-synced with ListParts
    expect(uploader.started.length).toBe(6); // 3 aborted + 3 again
  });

  it('cancels: aborts the transfer and the session', async () => {
    uploader.manual = true;
    const [item] = store.addFiles([fakeFile('a.mp4', 20 * MiB)]);
    await until(() => uploader.pending.length === 2);
    await store.cancel(item!.id);
    expect(store.items()[0]!.status).toBe('cancelled');
    expect(api.of(uploadsAbort)[0]!.params).toEqual({ id: 'sess-1' });
    expect(localStorage.getItem('vs.uploads')).toBeNull();
  });

  it('cancelled while its session is being opened, the session is closed once it exists', async () => {
    let open!: () => void;
    api.createGate = new Promise<void>((r) => (open = r));
    const [item] = store.addFiles([fakeFile('a.mp4', 20 * MiB)]);
    await until(() => store.items()[0]!.status === 'preparing');
    await store.cancel(item!.id);
    expect(api.of(uploadsAbort)).toHaveLength(0); // no session yet
    open();
    await until(() => api.of(uploadsAbort).length === 1);
    expect(api.of(uploadsAbort)[0]!.params).toEqual({ id: 'sess-1' });
    expect(store.items()[0]!.status).toBe('cancelled');
    expect(uploader.started).toHaveLength(0);
  });

  it('removing a failed upload from the list closes its session', async () => {
    api.completeError = new HttpErrorResponse({
      status: 400,
      error: { statusCode: 400, code: 'sizeMismatch', message: 'The file changed' },
    });
    const [item] = store.addFiles([fakeFile('a.mp4', 20 * MiB)]);
    await until(() => store.items()[0]!.status === 'error');
    expect(api.of(uploadsAbort)).toHaveLength(0);
    store.remove(item!.id);
    await until(() => api.of(uploadsAbort).length === 1);
    expect(api.of(uploadsAbort)[0]!.params).toEqual({ id: 'sess-1' });
    expect(store.items()).toHaveLength(0);
  });

  it('shows the localized API error when the session cannot be created', async () => {
    api.createError = new HttpErrorResponse({
      status: 400,
      error: { statusCode: 400, code: 'quotaExceeded', message: 'Not enough storage space' },
    });
    const [item] = store.addFiles([fakeFile('a.mp4', MiB)]);
    await until(() => store.items()[0]!.status === 'error');
    expect(store.items()[0]).toMatchObject({
      errorCode: 'quotaExceeded',
      error: 'Not enough storage space',
    });
    expect(uploader.started).toHaveLength(0);
    api.createError = null;
    store.resume(item!.id);
    await until(() => store.items()[0]!.status === 'done');
  });
});

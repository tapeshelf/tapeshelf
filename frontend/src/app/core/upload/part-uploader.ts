import { InjectionToken } from '@angular/core';

export class PartUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Sends one part to a presigned S3 URL and returns its ETag. Abstracted so the store can be unit-tested. */
export interface PartUploader {
  upload(
    url: string,
    body: Blob,
    onProgress: (loadedBytes: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
}

/** XMLHttpRequest is the only browser API with upload progress events. */
export class XhrPartUploader implements PartUploader {
  upload(
    url: string,
    body: Blob,
    onProgress: (loadedBytes: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      xhr.open('PUT', url, true);
      xhr.upload.onprogress = (e) => onProgress(e.loaded);
      xhr.onload = () => {
        signal.removeEventListener('abort', onAbort);
        const etag = xhr.getResponseHeader('ETag');
        if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
        else
          reject(
            new PartUploadError(
              xhr.status,
              etag
                ? `part upload failed with status ${xhr.status}`
                : 'no ETag in response (CORS ExposeHeaders?)',
            ),
          );
      };
      xhr.onerror = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new PartUploadError(0, 'network error'));
      };
      xhr.onabort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new DOMException('aborted', 'AbortError'));
      };
      xhr.send(body);
    });
  }
}

export const PART_UPLOADER = new InjectionToken<PartUploader>('PART_UPLOADER', {
  providedIn: 'root',
  factory: () => new XhrPartUploader(),
});

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { STORAGE_CONFIG, type StorageConfig } from './storage.config.js';

export type BucketKind = 'private' | 'public';

export interface UploadedPart {
  partNumber: number;
  /** Without surrounding quotes. */
  etag: string;
  size: number;
}

export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface PutItem {
  key: string;
  body?: Buffer | string;
  /** Streamed from disk when set (large HLS segments). */
  path?: string;
  contentType: string;
  cacheControl?: string;
  /** Share of a big file stored so far, 0–1, after each of its parts. */
  onProgress?: (fraction: number) => void;
}

/** Thin wrapper over two S3 clients: one for operations, one whose endpoint browsers can reach (presigning). */
@Injectable()
export class StorageService implements OnApplicationShutdown {
  private readonly logger = new Logger(StorageService.name);
  private readonly internal: S3Client;
  private readonly external: S3Client;
  /**
   * Long transfers relayed through the API (downloads, link archives, hashing) have connections of
   * their own: fifty archives at once took every socket of `internal`, and the short calls behind
   * them (playlists, heads, presigns) timed out.
   */
  private readonly streams: S3Client;

  constructor(@Inject(STORAGE_CONFIG) private readonly cfg: StorageConfig) {
    const base = {
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      forcePathStyle: cfg.forcePathStyle,
      // SDK ≥ 3.729 adds CRC32 checksums by default. For presigned UploadPart that checksum is computed
      // over an EMPTY body and hoisted into the URL, so backends that verify it (AWS S3, RustFS) reject
      // the browser's real part with BadDigest; Others merely ignore it. Only when required.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      // No timeouts by default: a stalled connection to the storage held a worker's slot (and an
      // API request) forever. The request timeout is the socket's idle time, not a cap on long
      // transfers.
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    };
    this.internal = new S3Client({ ...base, endpoint: cfg.endpoint });
    this.external = new S3Client({ ...base, endpoint: cfg.publicEndpoint });
    this.streams = new S3Client({ ...base, endpoint: cfg.endpoint });
  }

  bucket(kind: BucketKind): string {
    return kind === 'private' ? this.cfg.privateBucket : this.cfg.publicBucket;
  }

  /** Browser-facing URL of a public-bucket object. */
  publicUrl(key: string): string {
    return `${this.cfg.publicBucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  // ---- multipart uploads (browser → S3) ----

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const res = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket('private'),
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!res.UploadId) throw new Error('S3 returned no UploadId');
    return res.UploadId;
  }

  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSec: number,
  ): Promise<string> {
    return getSignedUrl(
      this.external,
      new UploadPartCommand({
        Bucket: this.bucket('private'),
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: expiresInSec },
    );
  }

  /** All parts uploaded so far; throws NoSuchUpload when the multipart upload is gone. */
  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: number | undefined;
    do {
      const res = await this.internal.send(
        new ListPartsCommand({
          Bucket: this.bucket('private'),
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker?.toString(),
          MaxParts: 1000,
        }),
      );
      for (const p of res.Parts ?? []) {
        if (p.PartNumber && p.ETag)
          parts.push({
            partNumber: p.PartNumber,
            etag: stripQuotes(p.ETag),
            size: p.Size ?? 0,
          });
      }
      marker = res.IsTruncated
        ? Number(res.NextPartNumberMarker ?? 0) || undefined
        : undefined;
    } while (marker !== undefined);
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket('private'),
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({
              PartNumber: p.partNumber,
              ETag: `"${stripQuotes(p.etag)}"`,
            })),
        },
      }),
    );
  }

  /** Idempotent: an already aborted/completed upload is not an error. */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.internal.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket('private'),
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      if (isS3Error(err, 'NoSuchUpload')) return;
      throw err;
    }
  }

  // ---- objects ----

  async head(kind: BucketKind, key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket(kind), Key: key }),
      );
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(kind: BucketKind, item: PutItem): Promise<void> {
    const size = item.path ? statSync(item.path).size : null;
    if (item.path && size !== null && size > MULTIPART_ABOVE)
      return this.putInParts(kind, item as PutItem & { path: string }, size);
    // A file is opened again for each try: the SDK cannot retry a stream it has already read.
    await retrying(() =>
      this.internal.send(
        new PutObjectCommand({
          Bucket: this.bucket(kind),
          Key: item.key,
          Body: item.path ? createReadStream(item.path) : item.body,
          ContentLength:
            size ??
            (typeof item.body === 'string'
              ? Buffer.byteLength(item.body)
              : item.body?.length),
          ContentType: item.contentType,
          CacheControl: item.cacheControl,
        }),
      ),
    );
  }

  /**
   * A big file in parts, a few at a time, each tried again on its own: some S3 providers refuse
   * single uploads of tens of megabytes now and then, and a refused part costs one part, not the whole file. Gone on failure.
   */
  private async putInParts(
    kind: BucketKind,
    item: PutItem & { path: string },
    size: number,
  ): Promise<void> {
    const Bucket = this.bucket(kind);
    const { UploadId } = await retrying(() =>
      this.internal.send(
        new CreateMultipartUploadCommand({
          Bucket,
          Key: item.key,
          ContentType: item.contentType,
          CacheControl: item.cacheControl,
        }),
      ),
    );
    const count = Math.ceil(size / PART_SIZE);
    const parts: { PartNumber: number; ETag: string }[] = [];
    let next = 0;
    try {
      await Promise.all(
        Array.from({ length: Math.min(PART_CONCURRENCY, count) }, async () => {
          for (let i = next++; i < count; i = next++) {
            const start = i * PART_SIZE;
            const end = Math.min(size, start + PART_SIZE) - 1;
            const res = await retrying(() =>
              this.internal.send(
                new UploadPartCommand({
                  Bucket,
                  Key: item.key,
                  UploadId,
                  PartNumber: i + 1,
                  Body: createReadStream(item.path, { start, end }),
                  ContentLength: end - start + 1,
                }),
              ),
            );
            parts[i] = { PartNumber: i + 1, ETag: res.ETag! };
            item.onProgress?.(parts.filter(Boolean).length / count);
          }
        }),
      );
      await retrying(() =>
        this.internal.send(
          new CompleteMultipartUploadCommand({
            Bucket,
            Key: item.key,
            UploadId,
            MultipartUpload: { Parts: parts },
          }),
        ),
      );
    } catch (err) {
      await this.internal
        .send(
          new AbortMultipartUploadCommand({ Bucket, Key: item.key, UploadId }),
        )
        .catch(() => undefined);
      throw err;
    }
  }

  /** Uploads many objects with bounded parallelism. */
  async putMany(
    kind: BucketKind,
    items: PutItem[],
    concurrency = 6,
    onItemDone?: () => void | Promise<void>,
  ): Promise<void> {
    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          await this.put(kind, item);
          await onItemDone?.();
        }
      },
    );
    await Promise.all(workers);
  }

  async getText(kind: BucketKind, key: string): Promise<string> {
    const res = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket(kind), Key: key }),
    );
    return res.Body!.transformToString();
  }

  async getBuffer(kind: BucketKind, key: string): Promise<Buffer> {
    const res = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket(kind), Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  /**
   * An object as a stream, whole or from a `Range` header as browsers send it ("bytes=100-"); the
   * download endpoint relays it. S3 answers 416 itself for a range past the end.
   */
  async getStream(
    kind: BucketKind,
    key: string,
    range?: string,
  ): Promise<{
    body: Readable;
    contentLength: number | undefined;
    contentRange: string | undefined;
  }> {
    const res = await this.streams.send(
      new GetObjectCommand({
        Bucket: this.bucket(kind),
        Key: key,
        Range: range,
      }),
    );
    return {
      body: res.Body as Readable,
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    };
  }

  /** Streams an object to disk; returns its size in bytes. */
  async downloadToFile(
    kind: BucketKind,
    key: string,
    destination: string,
  ): Promise<number> {
    const res = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket(kind), Key: key }),
    );
    await pipeline(res.Body as Readable, createWriteStream(destination));
    return res.ContentLength ?? statSync(destination).size;
  }

  async deleteObjects(kind: BucketKind, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const res = await this.internal.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket(kind),
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      // The answer is 200 even when some keys failed; they are listed in Errors.
      const failed = res.Errors ?? [];
      if (failed.length)
        throw new Error(
          `${failed.length} of ${chunk.length} objects not deleted, e.g. ${failed[0]?.Key}: ${failed[0]?.Code ?? ''} ${failed[0]?.Message ?? ''}`.trim(),
        );
    }
  }

  async listKeys(kind: BucketKind, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.internal.send(
        new ListObjectsV2Command({
          Bucket: this.bucket(kind),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /** Total size of the objects under a prefix (the admin trash shows what a purge frees). */
  async prefixSize(kind: BucketKind, prefix: string): Promise<number> {
    let bytes = 0;
    let token: string | undefined;
    do {
      const res = await this.internal.send(
        new ListObjectsV2Command({
          Bucket: this.bucket(kind),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) bytes += o.Size ?? 0;
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return bytes;
  }

  async deletePrefix(kind: BucketKind, prefix: string): Promise<number> {
    const keys = await this.listKeys(kind, prefix);
    if (keys.length) await this.deleteObjects(kind, keys);
    return keys.length;
  }

  /** Presigned GET for browsers (segments, downloads). */
  presignGet(
    kind: BucketKind,
    key: string,
    expiresInSec: number,
    opts: { contentDisposition?: string } = {},
  ): Promise<string> {
    return getSignedUrl(
      this.external,
      new GetObjectCommand({
        Bucket: this.bucket(kind),
        Key: key,
        ResponseContentDisposition: opts.contentDisposition,
      }),
      { expiresIn: expiresInSec },
    );
  }

  /** Presigned GET on the internal endpoint (ffmpeg reading straight from S3 inside the worker). */
  presignGetInternal(
    kind: BucketKind,
    key: string,
    expiresInSec: number,
  ): Promise<string> {
    return getSignedUrl(
      this.internal,
      new GetObjectCommand({ Bucket: this.bucket(kind), Key: key }),
      { expiresIn: expiresInSec },
    );
  }

  // ---- provisioning (storage:init script, test setup) ----

  async ensureBucket(kind: BucketKind): Promise<boolean> {
    const Bucket = this.bucket(kind);
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket }));
      return false;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await this.internal.send(new CreateBucketCommand({ Bucket }));
    return true;
  }

  /**
   * Anonymous GetObject only, no listing. Best-effort: some backends have no
   * bucket-policy API (Cloudflare R2 makes a bucket public in its dashboard instead); the caller is told
   * so it can say what to do by hand.
   */
  async applyPublicReadPolicy(): Promise<boolean> {
    const Bucket = this.bucket('public');
    try {
      await this.internal.send(
        new PutBucketPolicyCommand({
          Bucket,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${Bucket}/*`],
              },
            ],
          }),
        }),
      );
      return true;
    } catch (err) {
      if (isS3Error(err, 'NotImplemented')) {
        this.logger.warn(
          `Bucket ${Bucket}: bucket policies are not supported here; allow anonymous reads of this bucket in the provider's console`,
        );
        return false;
      }
      throw err;
    }
  }

  /**
   * Abandoned multipart uploads are dropped by the bucket itself after a day (belt and braces with
   * the API sweep, which is the primary mechanism). Best-effort: some backends reject or do not
   * implement lifecycle rules; the caller is told so it can warn.
   */
  async applyLifecycle(kind: BucketKind): Promise<boolean> {
    try {
      await this.internal.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucket(kind),
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'abort-incomplete-multipart',
                Status: 'Enabled',
                Filter: { Prefix: '' },
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
              },
            ],
          },
        }),
      );
      return true;
    } catch (err) {
      if (
        isS3Error(err, 'NotImplemented') ||
        isS3Error(err, 'InvalidArgument') ||
        isS3Error(err, 'MalformedXML')
      ) {
        this.logger.warn(
          `Bucket ${this.bucket(kind)}: lifecycle rule not accepted by this backend (${(err as Error).name}); relying on the upload sweep`,
        );
        return false;
      }
      throw err;
    }
  }

  /**
   * Browser → bucket CORS (presigned PUT/GET). RustFS, R2, S3 and most others take it through the API;
   * MinIO configured CORS through its environment and answered NotImplemented here.
   */
  async applyCors(kind: BucketKind, origins: string[]): Promise<boolean> {
    try {
      await this.internal.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket(kind),
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: origins,
                AllowedMethods: ['GET', 'HEAD', 'PUT'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
      return true;
    } catch (err) {
      if (isS3Error(err, 'NotImplemented')) {
        this.logger.warn(
          `Bucket ${this.bucket(kind)}: CORS via API not supported (MinIO: set MINIO_API_CORS_ALLOW_ORIGIN)`,
        );
        return false;
      }
      throw err;
    }
  }

  /** In the last phase of a shutdown: queue workers finish their uploads before it. */
  onApplicationShutdown(): void {
    this.internal.destroy();
    this.external.destroy();
    this.streams.destroy();
  }
}

function stripQuotes(etag: string): string {
  return etag.replace(/^"+|"+$/g, '');
}

/** Files above this go up in parts of PART_SIZE, PART_CONCURRENCY at a time. */
export const MULTIPART_ABOVE = 32 * 1024 * 1024;
const PART_SIZE = 16 * 1024 * 1024;
const PART_CONCURRENCY = 4;
const ATTEMPTS = 4;

/** The storage being busy or the connection dropping, not a refusal of the request itself. */
function transient(err: unknown): boolean {
  if (err instanceof S3ServiceException)
    return (
      (err.$metadata.httpStatusCode ?? 0) >= 500 ||
      err.name === 'SlowDown' ||
      err.name === 'RequestTimeout'
    );
  const code = (err as { code?: string }).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'ECONNREFUSED'
  );
}

/** Tries a storage call again after 1, 2 and 4 seconds when the storage was only busy. */
async function retrying<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= ATTEMPTS || !transient(err)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

export function isS3Error(err: unknown, name: string): boolean {
  return err instanceof S3ServiceException && err.name === name;
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof S3ServiceException &&
    (err.name === 'NotFound' ||
      err.name === 'NoSuchKey' ||
      err.name === 'NoSuchBucket' ||
      err.$metadata.httpStatusCode === 404)
  );
}

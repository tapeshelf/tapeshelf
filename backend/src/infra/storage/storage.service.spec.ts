import { S3ServiceException } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service.js';
import type { StorageConfig } from './storage.config.js';

const cfg: StorageConfig = {
  endpoint: 'http://localhost:9100',
  publicEndpoint: 'http://localhost:9100',
  region: 'us-east-1',
  accessKey: 'test-access',
  secretKey: 'test-secret',
  forcePathStyle: true,
  privateBucket: 'private-bucket',
  publicBucket: 'public-bucket',
  publicBucketUrl: 'http://localhost:9100/public-bucket',
};

describe('StorageService presigning', () => {
  it('signs part uploads without a checksum of the (empty) request body', async () => {
    const storage = new StorageService(cfg);
    try {
      const url = new URL(
        await storage.presignUploadPart(
          'videos/v1/original.mp4',
          'upload-1',
          3,
          600,
        ),
      );
      // The browser PUTs the real bytes later; a checksum hoisted into the URL at signing time is the
      // CRC32 of nothing, and backends that verify it (AWS S3, RustFS) answer 400 BadDigest.
      const checksumParams = [...url.searchParams.keys()].filter((k) =>
        k.toLowerCase().includes('checksum'),
      );
      expect(checksumParams).toEqual([]);
      expect(url.searchParams.get('partNumber')).toBe('3');
      expect(url.searchParams.get('uploadId')).toBe('upload-1');
      expect(url.pathname).toBe('/private-bucket/videos/v1/original.mp4');
    } finally {
      storage.onApplicationShutdown();
    }
  });
});

describe('StorageService bucket provisioning', () => {
  const s3Error = (name: string, status: number) =>
    new S3ServiceException({
      name,
      message: name,
      $fault: status >= 500 ? 'server' : 'client',
      $metadata: { httpStatusCode: status },
    });

  function withSend(impl: () => Promise<unknown>): StorageService {
    const storage = new StorageService(cfg);
    (
      storage as unknown as { internal: { send: () => Promise<unknown> } }
    ).internal.send = impl;
    return storage;
  }

  it('applies the public-read policy and reports it', async () => {
    const storage = withSend(() => Promise.resolve({}));
    await expect(storage.applyPublicReadPolicy()).resolves.toBe(true);
    storage.onApplicationShutdown();
  });

  it('skips the policy on backends without a bucket-policy API instead of failing', async () => {
    const storage = withSend(() =>
      Promise.reject(s3Error('NotImplemented', 501)),
    );
    await expect(storage.applyPublicReadPolicy()).resolves.toBe(false);
    storage.onApplicationShutdown();
  });

  it('still fails on real errors (wrong keys, missing bucket)', async () => {
    const storage = withSend(() =>
      Promise.reject(s3Error('AccessDenied', 403)),
    );
    await expect(storage.applyPublicReadPolicy()).rejects.toThrow(
      'AccessDenied',
    );
    storage.onApplicationShutdown();
  });
});

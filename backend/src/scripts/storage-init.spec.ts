import { S3ServiceException } from '@aws-sdk/client-s3';
import { whenBucketVisible } from './storage-init.js';

describe('storage-init on a backend that is slow to show a new bucket', () => {
  const s3Error = (name: string) =>
    new S3ServiceException({
      name,
      message: name,
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    });

  it('retries NoSuchBucket until the bucket is visible', async () => {
    let calls = 0;
    const result = await whenBucketVisible(() => {
      calls++;
      return calls < 3
        ? Promise.reject(s3Error('NoSuchBucket'))
        : Promise.resolve('applied');
    }, [1, 1, 1]);
    expect(result).toBe('applied');
    expect(calls).toBe(3);
  });

  it('gives up after the last delay, and never retries another error', async () => {
    let calls = 0;
    await expect(
      whenBucketVisible(() => {
        calls++;
        return Promise.reject(s3Error('NoSuchBucket'));
      }, [1, 1]),
    ).rejects.toThrow('NoSuchBucket');
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      whenBucketVisible(() => {
        calls++;
        return Promise.reject(s3Error('AccessDenied'));
      }, [1, 1]),
    ).rejects.toThrow('AccessDenied');
    expect(calls).toBe(1);
  });
});

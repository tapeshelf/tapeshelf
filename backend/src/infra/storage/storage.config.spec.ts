import {
  defaultPublicBucketUrl,
  storageConfigFromEnv,
} from './storage.config.js';

const base = {
  S3_ENDPOINT: 'https://s3.example.com/',
  S3_PUBLIC_ENDPOINT: undefined,
  S3_REGION: 'eu-1',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  S3_BUCKET_PRIVATE: 'bucket-private',
  S3_BUCKET_PUBLIC: 'bucket-public',
  S3_PUBLIC_BUCKET_URL: undefined,
};

describe('storage config', () => {
  it('defaults the public endpoint to the operations endpoint', () => {
    const cfg = storageConfigFromEnv({ ...base, S3_FORCE_PATH_STYLE: false });
    expect(cfg.endpoint).toBe('https://s3.example.com');
    expect(cfg.publicEndpoint).toBe('https://s3.example.com');
  });

  it('builds the public bucket URL per addressing style unless overridden', () => {
    expect(
      defaultPublicBucketUrl('http://localhost:9100', 'bucket-public', true),
    ).toBe('http://localhost:9100/bucket-public');
    expect(
      defaultPublicBucketUrl('https://s3.example.com', 'bucket-public', false),
    ).toBe('https://bucket-public.s3.example.com');
    expect(
      storageConfigFromEnv({ ...base, S3_FORCE_PATH_STYLE: false })
        .publicBucketUrl,
    ).toBe('https://bucket-public.s3.example.com');
    expect(
      storageConfigFromEnv({
        ...base,
        S3_FORCE_PATH_STYLE: false,
        S3_PUBLIC_BUCKET_URL: 'https://cdn.example.com/',
      }).publicBucketUrl,
    ).toBe('https://cdn.example.com');
  });
});

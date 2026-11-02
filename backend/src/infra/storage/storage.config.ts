import type { Env } from '../../config/env.js';

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

export interface StorageConfig {
  /** Endpoint the API/worker talk to (e.g. http://s3:9000 inside Docker). */
  endpoint: string;
  /** Endpoint embedded in presigned URLs that browsers open; signatures include the host. */
  publicEndpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  privateBucket: string;
  publicBucket: string;
  /** Base URL of public objects (no trailing slash). */
  publicBucketUrl: string;
}

type StorageEnv = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_PUBLIC_ENDPOINT'
  | 'S3_REGION'
  | 'S3_ACCESS_KEY'
  | 'S3_SECRET_KEY'
  | 'S3_FORCE_PATH_STYLE'
  | 'S3_BUCKET_PRIVATE'
  | 'S3_BUCKET_PUBLIC'
  | 'S3_PUBLIC_BUCKET_URL'
>;

export function storageConfigFromEnv(env: StorageEnv): StorageConfig {
  const endpoint = env.S3_ENDPOINT.replace(/\/$/, '');
  const publicEndpoint = (env.S3_PUBLIC_ENDPOINT ?? endpoint).replace(
    /\/$/,
    '',
  );
  return {
    endpoint,
    publicEndpoint,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    privateBucket: env.S3_BUCKET_PRIVATE,
    publicBucket: env.S3_BUCKET_PUBLIC,
    publicBucketUrl: (
      env.S3_PUBLIC_BUCKET_URL ??
      defaultPublicBucketUrl(
        publicEndpoint,
        env.S3_BUCKET_PUBLIC,
        env.S3_FORCE_PATH_STYLE,
      )
    ).replace(/\/$/, ''),
  };
}

/** Path-style (RustFS, MinIO): https://host/bucket; virtual-hosted (AWS, R2 and others): https://bucket.host. */
export function defaultPublicBucketUrl(
  publicEndpoint: string,
  bucket: string,
  forcePathStyle: boolean,
): string {
  if (forcePathStyle) return `${publicEndpoint}/${bucket}`;
  const u = new URL(publicEndpoint);
  u.hostname = `${bucket}.${u.hostname}`;
  return u.toString().replace(/\/$/, '');
}

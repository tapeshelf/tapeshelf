import { type Env, validateEnv } from '../config/env.js';
import { storageConfigFromEnv } from '../infra/storage/storage.config.js';
import { StorageService, isS3Error } from '../infra/storage/storage.service.js';

/**
 * Some S3 providers answer NoSuchBucket for a moment after CreateBucket succeeded: a bucket's
 * settings are retried until it is visible, ~30 s at most.
 */
export async function whenBucketVisible<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[] = [250, 500, 1000, 2000, 4000, 8000, 15000],
): Promise<T> {
  for (const delay of delaysMs) {
    try {
      return await fn();
    } catch (err) {
      if (!isS3Error(err, 'NoSuchBucket')) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return fn();
}

/**
 * Provisions the buckets the app needs: creates them, makes the public one anonymously readable
 * (GetObject only), adds the abort-incomplete-multipart lifecycle rule and, where the backend
 * supports it (R2/S3), browser CORS. Idempotent; works for RustFS, MinIO, R2, S3 and others.
 */
export async function initStorage(
  env: Env,
  log: (line: string) => void = console.log,
): Promise<void> {
  const storage = new StorageService(storageConfigFromEnv(env));
  const origins = [new URL(env.PUBLIC_URL).origin];
  // Local origins: ng serve (4200), the API itself (3000) and the Playwright stack (4300).
  if (env.NODE_ENV !== 'production')
    origins.push(
      'http://localhost:4200',
      'http://localhost:3000',
      'http://localhost:4300',
    );
  try {
    for (const kind of ['private', 'public'] as const) {
      const created = await storage.ensureBucket(kind);
      log(`${storage.bucket(kind)}: ${created ? 'created' : 'exists'}`);
      const lifecycle = await whenBucketVisible(() =>
        storage.applyLifecycle(kind),
      );
      const cors = await whenBucketVisible(() =>
        storage.applyCors(kind, origins),
      );
      log(
        `${storage.bucket(kind)}: lifecycle ${lifecycle ? 'applied' : 'skipped (not accepted by this backend)'}, CORS ${cors ? 'applied' : 'skipped (not supported by this backend)'}`,
      );
    }
    const policy = await whenBucketVisible(() =>
      storage.applyPublicReadPolicy(),
    );
    log(
      `${storage.bucket('public')}: ${policy ? 'anonymous GetObject policy applied' : 'policy skipped (not supported by this backend) — allow public reads in its console'}`,
    );
  } finally {
    storage.onApplicationShutdown();
  }
}

/** How long a deploy waits for the object storage before going on without this step. */
const INIT_TIMEOUT_MS = 60_000;

if (process.argv[1] && /storage-init\.(ts|js)$/.test(process.argv[1])) {
  // Bucket policy, lifecycle and CORS are a convenience, not a condition for serving the site:
  // when the object storage is degraded the API, the worker and
  // the web must still come up, so a failure here is reported and the step exits cleanly.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      initStorage(validateEnv(process.env)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`no answer within ${INIT_TIMEOUT_MS / 1000} s`)),
          INIT_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    console.error(
      `storage-init failed; the site starts without it: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  process.exit(0);
}

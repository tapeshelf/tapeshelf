import { execa } from 'execa';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Env, validateEnv } from '../config/env.js';
import {
  type StorageConfig,
  storageConfigFromEnv,
} from '../infra/storage/storage.config.js';
import { StorageService } from '../infra/storage/storage.service.js';

export const BACKUP_PREFIX = 'backups/';
const DEFAULT_KEEP = 14;
/** One dump a day: BACKUP_KEEP dumps are that many days back. */
export const BACKUP_EVERY_MS = 24 * 3600_000;

/** libpq does not accept Prisma's extra URL parameters (`?schema=`...). */
export function libpqUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.search = '';
  return url.toString();
}

/** `backups/db-2026-10-13T03-00-00Z.dump`: sorts by time. */
export function backupKey(now: Date): string {
  return `${BACKUP_PREFIX}db-${now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-')}.dump`;
}

/** When a dump key was made (`backupKey` in reverse); null for anything else. */
export function backupTime(key: string): Date | null {
  const m =
    /^backups\/db-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump$/.exec(
      key,
    );
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : null;
}

/**
 * How long until the next dump is due: a day after the newest one, at once when there is none. The
 * service starts the script on every deploy, and every start used to dump: fourteen dumps covered
 * a day and a half instead of two weeks.
 */
export function backupDueIn(
  keys: string[],
  now: Date,
  everyMs = BACKUP_EVERY_MS,
): number {
  const times = keys.map(backupTime).filter((t): t is Date => t !== null);
  if (times.length === 0) return 0;
  const newest = Math.max(...times.map((t) => t.getTime()));
  return Math.max(0, newest + everyMs - now.getTime());
}

/** The second storage the dumps go to; null when it is not set up. */
export function mirrorConfig(env: Env): StorageConfig | null {
  const endpoint = env.BACKUP_MIRROR_ENDPOINT?.replace(/\/$/, '');
  const bucket = env.BACKUP_MIRROR_BUCKET;
  if (
    !endpoint ||
    !bucket ||
    !env.BACKUP_MIRROR_ACCESS_KEY ||
    !env.BACKUP_MIRROR_SECRET_KEY
  )
    return null;
  return {
    endpoint,
    publicEndpoint: endpoint,
    region: env.BACKUP_MIRROR_REGION,
    accessKey: env.BACKUP_MIRROR_ACCESS_KEY,
    secretKey: env.BACKUP_MIRROR_SECRET_KEY,
    forcePathStyle: env.BACKUP_MIRROR_FORCE_PATH_STYLE,
    privateBucket: bucket,
    publicBucket: bucket,
    publicBucketUrl: `${endpoint}/${bucket}`,
  };
}

/** The keys to delete so that only the newest `keep` dumps stay. */
export function backupsToPrune(keys: string[], keep: number): string[] {
  const dumps = keys
    .filter((k) => k.startsWith(`${BACKUP_PREFIX}db-`) && k.endsWith('.dump'))
    .sort();
  return dumps.slice(0, Math.max(0, dumps.length - keep));
}

/**
 * Database backup: `pg_dump` in custom format, uploaded to the private
 * bucket under backups/ (off the server, next to the videos), keeping the newest BACKUP_KEEP dumps.
 * Run by the `backup` service of the production compose file, which waits until a dump is due
 * (`waitUntilDue`); by hand, at once: `node dist/scripts/db-backup.js --now`.
 */
export async function backupDatabase(
  env: Env,
  options: {
    keep?: number;
    pgDump?: string;
    log?: (line: string) => void;
  } = {},
): Promise<{ key: string; bytes: number; pruned: string[] }> {
  const log = options.log ?? console.log;
  const storage = new StorageService(storageConfigFromEnv(env));
  const dir = await mkdtemp(join(tmpdir(), 'tapeshelf-backup-'));
  try {
    const file = join(dir, 'db.dump');
    await execa(options.pgDump ?? process.env['PG_DUMP_PATH'] ?? 'pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${file}`,
      `--dbname=${libpqUrl(env.DATABASE_URL)}`,
    ]);
    const key = backupKey(new Date());
    await storage.put('private', {
      key,
      path: file,
      contentType: 'application/octet-stream',
    });
    const bytes = (await storage.head('private', key))?.size ?? 0;
    log(`backup ${key}: ${bytes} bytes`);
    const pruned = backupsToPrune(
      await storage.listKeys('private', BACKUP_PREFIX),
      options.keep ?? DEFAULT_KEEP,
    );
    if (pruned.length) {
      await storage.deleteObjects('private', pruned);
      log(`pruned ${pruned.length} old backup(s)`);
    }
    await mirror(env, file, key, options.keep ?? DEFAULT_KEEP, log);
    return { key, bytes, pruned };
  } finally {
    storage.onApplicationShutdown();
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The same dump into the second storage, its old ones pruned there too. A failure there is said and
 * left for the next day: the dump in the main bucket stands, and a retry would wait a day anyway.
 */
async function mirror(
  env: Env,
  file: string,
  key: string,
  keep: number,
  log: (line: string) => void,
): Promise<void> {
  const config = mirrorConfig(env);
  if (!config) return;
  const storage = new StorageService(config);
  try {
    await storage.put('private', {
      key,
      path: file,
      contentType: 'application/octet-stream',
    });
    const pruned = backupsToPrune(
      await storage.listKeys('private', BACKUP_PREFIX),
      keep,
    );
    if (pruned.length) await storage.deleteObjects('private', pruned);
    log(`backup mirror ${config.endpoint}/${config.privateBucket}/${key}`);
  } catch (err) {
    log(`backup mirror failed: ${(err as Error).message}`);
  } finally {
    storage.onApplicationShutdown();
  }
}

/** Waits until the newest dump in the bucket is a day old (no wait when listing it fails). */
export async function waitUntilDue(
  env: Env,
  log: (line: string) => void = console.log,
): Promise<void> {
  const storage = new StorageService(storageConfigFromEnv(env));
  let wait = 0;
  try {
    wait = backupDueIn(
      await storage.listKeys('private', BACKUP_PREFIX),
      new Date(),
    );
  } catch (err) {
    log(`backup list failed (${String(err)}): dumping now`);
  } finally {
    storage.onApplicationShutdown();
  }
  if (wait === 0) return;
  log(
    `backup not due yet: next at ${new Date(Date.now() + wait).toISOString()}`,
  );
  await new Promise((resolve) => setTimeout(resolve, wait));
}

if (process.argv[1] && /db-backup\.(ts|js)$/.test(process.argv[1])) {
  const env = validateEnv(process.env);
  const keep = Number(process.env['BACKUP_KEEP'] ?? DEFAULT_KEEP);
  if (!process.argv.includes('--now')) await waitUntilDue(env);
  await backupDatabase(env, { keep });
}

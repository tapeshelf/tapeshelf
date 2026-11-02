import { execa } from 'execa';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { validateEnv } from '../config/env.js';
import { storageConfigFromEnv } from '../infra/storage/storage.config.js';
import { StorageService } from '../infra/storage/storage.service.js';
import { BACKUP_PREFIX, libpqUrl } from './db-backup.js';

const USAGE = `Restore a database backup made by db-backup.

  node dist/scripts/db-restore.js --list
  node dist/scripts/db-restore.js [--key backups/db-….dump | --file ./db.dump] [--target <postgres url>] --yes

Without --key/--file the newest backup in the bucket is used. Without --target it restores into
DATABASE_URL, replacing what is there (stop the api and worker first). --yes is required.`;

/**
 * Restore drill and disaster recovery: downloads a dump from the private bucket and runs
 * pg_restore --clean into the target database. Restoring into a scratch database (--target) is
 * how the backup is checked without touching the live data.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      key: { type: 'string' },
      file: { type: 'string' },
      target: { type: 'string' },
      list: { type: 'boolean' },
      yes: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return console.log(USAGE);
  const env = validateEnv(process.env);
  const storage = new StorageService(storageConfigFromEnv(env));
  const dir = await mkdtemp(join(tmpdir(), 'tapeshelf-restore-'));
  try {
    const keys = (await storage.listKeys('private', BACKUP_PREFIX))
      .filter((k) => k.endsWith('.dump'))
      .sort();
    if (values.list) {
      for (const k of keys) console.log(k);
      return;
    }
    if (!values.yes)
      throw new Error(`Refusing to restore without --yes.\n\n${USAGE}`);
    let file = values.file;
    if (!file) {
      const key = values.key ?? keys.at(-1);
      if (!key) throw new Error('No backups found in the bucket.');
      file = join(dir, 'db.dump');
      await storage.downloadToFile('private', key, file);
      console.log(`downloaded ${key}`);
    }
    const target = libpqUrl(values.target ?? env.DATABASE_URL);
    await execa(
      process.env['PG_RESTORE_PATH'] ?? 'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        `--dbname=${target}`,
        file,
      ],
      { stdio: 'inherit' },
    );
    console.log(`restored into ${new URL(target).pathname.slice(1)}`);
  } finally {
    storage.onApplicationShutdown();
    await rm(dir, { recursive: true, force: true });
  }
}

await main();

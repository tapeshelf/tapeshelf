import {
  BACKUP_EVERY_MS,
  backupDueIn,
  backupKey,
  backupTime,
  backupsToPrune,
  libpqUrl,
  mirrorConfig,
} from './db-backup.js';
import type { Env } from '../config/env.js';

describe('db backup helpers', () => {
  it('names dumps so that they sort by time', () => {
    expect(backupKey(new Date('2026-10-13T03:04:05.678Z'))).toBe(
      'backups/db-2026-10-13T03-04-05Z.dump',
    );
  });

  it('prunes all but the newest dumps and ignores other objects', () => {
    const keys = [
      'backups/db-2026-10-12T03-00-00Z.dump',
      'backups/readme.txt',
      'backups/db-2026-10-10T03-00-00Z.dump',
      'backups/db-2026-10-11T03-00-00Z.dump',
    ];
    expect(backupsToPrune(keys, 2)).toEqual([
      'backups/db-2026-10-10T03-00-00Z.dump',
    ]);
    expect(backupsToPrune(keys, 5)).toEqual([]);
  });

  it('drops Prisma-only URL parameters for libpq', () => {
    expect(libpqUrl('postgresql://u:p@db:5432/app?schema=public')).toBe(
      'postgresql://u:p@db:5432/app',
    );
  });

  it('reads the time back from a dump key and nothing else', () => {
    expect(
      backupTime('backups/db-2026-10-13T03-04-05Z.dump')?.toISOString(),
    ).toBe('2026-10-13T03:04:05.000Z');
    expect(
      backupTime('backups/repo/repo-20261016T180023Z.tar.zst.gpg'),
    ).toBeNull();
    expect(backupTime('backups/readme.txt')).toBeNull();
  });

  it('one dump a day, however often the service restarts', () => {
    const now = new Date('2026-10-16T18:00:00Z');
    expect(backupDueIn([], now)).toBe(0);
    const keys = [
      'backups/db-2026-10-15T09-00-00Z.dump',
      'backups/db-2026-10-16T07-30-00Z.dump',
      'backups/repo/repo-20261016T180023Z.tar.zst.gpg',
    ];
    // The newest is from 07:30: the next is due at 07:30 tomorrow.
    expect(backupDueIn(keys, now)).toBe(13.5 * 3600_000);
    expect(backupDueIn(keys, new Date('2026-10-17T08:00:00Z'))).toBe(0);
    expect(BACKUP_EVERY_MS).toBe(24 * 3600_000);
  });

  it('copies dumps to a second storage only when it is set up whole', () => {
    const env = {
      BACKUP_MIRROR_REGION: 'eu-central',
      BACKUP_MIRROR_FORCE_PATH_STYLE: true,
    } as Env;
    expect(mirrorConfig(env)).toBeNull();
    expect(
      mirrorConfig({
        ...env,
        BACKUP_MIRROR_ENDPOINT: 'https://s3.other.example/',
        BACKUP_MIRROR_ACCESS_KEY: 'key',
        BACKUP_MIRROR_SECRET_KEY: 'secret',
      }),
    ).toBeNull();
    expect(
      mirrorConfig({
        ...env,
        BACKUP_MIRROR_ENDPOINT: 'https://s3.other.example/',
        BACKUP_MIRROR_ACCESS_KEY: 'key',
        BACKUP_MIRROR_SECRET_KEY: 'secret',
        BACKUP_MIRROR_BUCKET: 'dumps',
      }),
    ).toMatchObject({
      endpoint: 'https://s3.other.example',
      region: 'eu-central',
      privateBucket: 'dumps',
      forcePathStyle: true,
    });
  });
});

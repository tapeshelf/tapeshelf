import { Redis } from 'ioredis';
import { execSync } from 'node:child_process';
import pg from 'pg';

import { validateEnv } from '../src/config/env.js';
import { initStorage } from '../src/scripts/storage-init.js';
import { ensureFixtures } from './utils/fixtures.js';

// Runs once before the e2e suite: migrations on the test database, test buckets, ffmpeg fixtures.
export default async function setup(): Promise<() => Promise<void>> {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  await initStorage(validateEnv(process.env), () => undefined);
  ensureFixtures();
  await teardown(); // a run that crashed may have left them too
  return teardown;
}

/**
 * After the suite: drop the site settings tests changed (limits, speeds) and their cached copies.
 * The Playwright stack runs on the same test database and would otherwise inherit them.
 */
async function teardown(): Promise<void> {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query('DELETE FROM "SiteSetting"');
  await db.end();
  const redis = new Redis(process.env.REDIS_URL!);
  const keys = await redis.keys('settings:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
}

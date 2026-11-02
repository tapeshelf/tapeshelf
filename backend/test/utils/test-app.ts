import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import request from 'supertest';

import { createApp } from '../../src/app.factory.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.module.js';

/** Boots the real application (same wiring as production) against the test database. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const app = await createApp();
  await app.init();
  return app;
}

export const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const;

/** A cookie-keeping client that always sends the CSRF header (like the real frontend). */
export function client(app: NestExpressApplication) {
  const agent = request.agent(app.getHttpServer());
  const withCsrf = (req: request.Test) => req.set(CSRF_HEADER);
  return {
    agent,
    get: (path: string) => agent.get(path),
    post: (path: string) => withCsrf(agent.post(path)),
    patch: (path: string) => withCsrf(agent.patch(path)),
    put: (path: string) => withCsrf(agent.put(path)),
    delete: (path: string) => withCsrf(agent.delete(path)),
  };
}

/** Empties every table except migrations (and the test Redis db) so tests start from a clean slate. */
export async function resetDatabase(
  app: NestExpressApplication,
): Promise<void> {
  await app.get<Redis>(REDIS_CLIENT).flushdb();
  const prisma = app.get(PrismaService);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

import type { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';

import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { client, createTestApp, resetDatabase } from './utils/test-app.js';
import { signUp } from './utils/users.js';

/**
 * Memory and latency check, not a test: runs only with VS_PERF_DIR set. Thousands of requests to the
 * hot read paths against a seeded shelf; heap after a forced GC between rounds, p50/p95 per route.
 */
const DIR = process.env['VS_PERF_DIR'];
v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc') as () => void;

(DIR ? describe : describe.skip)('perf soak (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it(
    'heap stays flat over rounds of requests',
    { timeout: 1_800_000 },
    async () => {
      const owner = client(app);
      const viewer = client(app);
      const guest = client(app);
      const ownerId = await signUp(app, owner, {
        email: 'own@example.com',
        username: 'own',
        password: 'secret123',
      });
      const viewerId = await signUp(app, viewer, {
        email: 'vw@example.com',
        username: 'viewer',
        password: 'secret123',
      });
      // 2000 videos on the owner's shelf, 300 of them also on the viewer's; 200 followers.
      await prisma.$executeRawUnsafe(`
      WITH v AS (
        INSERT INTO "Video" (id, "authorId", title, visibility, status, progress, "originalKey",
          "originalFilename", "sizeBytes", "durationSec", width, height, "createdAt", "updatedAt", "readyAt")
        SELECT gen_random_uuid(), '${ownerId}', 'clip ' || g, CASE WHEN g % 3 = 0 THEN 'PRIVATE' ELSE 'PUBLIC' END::"Visibility",
          'READY', 100, 'seeded/none', 'seeded.mp4', 1000, 10, 640, 360,
          now() - (g || ' minutes')::interval, now(), now() - (g || ' minutes')::interval
        FROM generate_series(1, 2000) g RETURNING id, "createdAt")
      INSERT INTO "VideoAccess" (id, "videoId", "holderId", source, "createdAt")
      SELECT gen_random_uuid(), v.id, '${ownerId}', 'AUTHOR', v."createdAt" FROM v`);
      await prisma.$executeRawUnsafe(`
      INSERT INTO "VideoAccess" (id, "videoId", "holderId", source, "createdAt")
      SELECT gen_random_uuid(), id, '${viewerId}', 'EXCHANGE', now() FROM "Video" WHERE "authorId" = '${ownerId}' ORDER BY "createdAt" LIMIT 300`);
      await prisma.$executeRawUnsafe(`
      WITH u AS (
        INSERT INTO "User" (id, email, username, "displayName", "passwordHash", "emailVerifiedAt", "createdAt", "updatedAt")
        SELECT gen_random_uuid(), 'f' || g || '@example.com', 'fan' || g, 'Fan ' || g, 'x', now(), now(), now()
        FROM generate_series(1, 200) g RETURNING id)
      INSERT INTO "Follow" ("followerId", "followeeId", "createdAt") SELECT id, '${ownerId}', now() FROM u`);
      await viewer.post('/api/users/own/follow');
      const vids = await prisma.video.findMany({
        where: { authorId: ownerId, visibility: 'PUBLIC' },
        take: 50,
        select: { id: true, code: true },
      });

      type Call = { name: string; run: () => Promise<{ status: number }> };
      const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
      const calls: Call[] = [
        { name: 'guest profile', run: () => guest.get('/api/users/own') },
        {
          name: 'guest collection',
          run: () => guest.get('/api/users/own/collection?limit=60'),
        },
        {
          name: 'guest summary',
          run: () => guest.get('/api/users/own/collection/summary'),
        },
        {
          name: 'guest video page',
          run: () => guest.get(`/api/users/own/videos/${pick(vids).id}`),
        },
        {
          name: 'guest code',
          run: () => guest.get(`/api/videos/code/${pick(vids).code}`),
        },
        {
          name: 'guest playback',
          run: () => guest.post(`/api/videos/${pick(vids).id}/playback`),
        },
        { name: 'owner me', run: () => owner.get('/api/auth/me') },
        {
          name: 'owner collection',
          run: () => owner.get('/api/users/own/collection?limit=60'),
        },
        {
          name: 'owner collection p5',
          run: () => owner.get('/api/users/own/collection?limit=60&offset=300'),
        },
        {
          name: 'viewer collection',
          run: () => viewer.get('/api/users/viewer/collection?limit=60'),
        },
        {
          name: 'viewer whats-new',
          run: () => viewer.get('/api/me/whats-new'),
        },
        {
          name: 'viewer whats-new state',
          run: () => viewer.get('/api/me/whats-new/state'),
        },
        {
          name: 'viewer notifications',
          run: () => viewer.get('/api/notifications'),
        },
        {
          name: 'viewer unread',
          run: () => viewer.get('/api/notifications/unread-count'),
        },
        {
          name: 'viewer exchange summary',
          run: () => viewer.get('/api/exchange/summary'),
        },
        {
          name: 'viewer conversations',
          run: () => viewer.get('/api/conversations'),
        },
        {
          name: 'followers list',
          run: () => viewer.get('/api/users/own/social?list=followers'),
        },
      ];
      const times: Record<string, number[]> = {};
      const errors: Record<string, number> = {};
      const round = async (n: number) => {
        for (let i = 0; i < n; i++) {
          const c = calls[i % calls.length];
          const t = performance.now();
          const res = await c.run();
          (times[c.name] ??= []).push(performance.now() - t);
          if (res.status >= 500) errors[c.name] = (errors[c.name] ?? 0) + 1;
        }
      };
      const heap = () => {
        gc();
        gc();
        const m = process.memoryUsage();
        return {
          heapMB: +(m.heapUsed / 1048576).toFixed(1),
          rssMB: +(m.rss / 1048576).toFixed(1),
          extMB: +(m.external / 1048576).toFixed(1),
        };
      };
      await round(500); // warm-up
      for (const k of Object.keys(times)) times[k] = [];
      const rows = [{ round: 0, ...heap() }];
      for (let r = 1; r <= 6; r++) {
        await round(2000);
        rows.push({ round: r, ...heap() });
      }
      const q = (xs: number[], p: number) => {
        const s = [...xs].sort((a, b) => a - b);
        return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
      };
      const lat = Object.entries(times).map(([name, xs]) => ({
        name,
        n: xs.length,
        p50: q(xs, 0.5),
        p95: q(xs, 0.95),
        max: q(xs, 1),
      }));
      console.table(rows);
      console.table(lat);
      writeFileSync(
        join(DIR!, 'soak.json'),
        JSON.stringify({ rows, lat, errors }, null, 2),
      );
      expect(errors).toEqual({});
    },
  );
});

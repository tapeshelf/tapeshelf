import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import type { Redis } from 'ioredis';
import sharp from 'sharp';

import { setSiteName } from './common/i18n/i18n.js';
import { logUnhandledRejections } from './common/process-guards.js';
import { cpuBudget } from './modules/processing/cpu-budget.js';
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_SEC,
} from './modules/health/health.service.js';
import { REDIS_CLIENT } from './infra/redis/redis.module.js';
import type { Env } from './config/env.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const tmp = process.env['WORKER_TMP_DIR'];
  if (tmp) await mkdir(tmp, { recursive: true });
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  setSiteName(
    app.get(ConfigService<Env, true>).get('SITE_NAME', { infer: true }),
  );
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  logUnhandledRejections((message, reason) => logger.error(message, reason));
  // libvips sizes its threads by the host's cores and keeps a cache; in the worker's container
  // that is memory for nothing.
  sharp.concurrency(cpuBudget());
  sharp.cache(false);

  // Optional liveness endpoint for container health checks and the Playwright web server.
  const healthPort = Number(process.env['WORKER_HEALTH_PORT'] ?? 0);
  if (healthPort > 0) {
    createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            uptimeSec: Math.round(process.uptime()),
          }),
        );
      } else {
        res.writeHead(404).end();
      }
    }).listen(healthPort, () =>
      logger.log(`Worker health endpoint on :${healthPort}/health`),
    );
  }
  // A heartbeat in Redis: /api/health/ops tells an uptime monitor when no worker is alive.
  const redis = app.get<Redis>(REDIS_CLIENT);
  const beat = () =>
    redis
      .set(
        WORKER_HEARTBEAT_KEY,
        String(Date.now()),
        'EX',
        WORKER_HEARTBEAT_SEC * 4,
      )
      .catch(() => undefined);
  void beat();
  setInterval(beat, WORKER_HEARTBEAT_SEC * 1000).unref();
  logger.log('Worker ready');
}

await bootstrap();

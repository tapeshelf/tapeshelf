import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { createApp, setupSwaggerUi } from './app.factory.js';
import { logUnhandledRejections } from './common/process-guards.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService<Env, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production')
    setupSwaggerUi(app);

  const port = config.get('PORT', { infer: true });
  const logger = app.get(Logger);
  logUnhandledRejections((message, reason) => logger.error(message, reason));
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api (docs: /api/docs)`);
}

await bootstrap();

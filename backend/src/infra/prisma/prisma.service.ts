import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // Waiting for a free connection ends with an error after 10 s instead of never, and the
        // server drops a session left idle inside a transaction.
        connectionTimeoutMillis: 10_000,
        idle_in_transaction_session_timeout: 300_000,
      }),
      log:
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** In the last phase of a shutdown: queue workers finish their jobs before it. */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}

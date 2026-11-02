import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { type Env, validateEnv } from './config/env.js';
import { OutboxModule } from './infra/outbox/outbox.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { NotificationWorkers } from './modules/notifications/notification.workers.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { BlocklistModule } from './modules/blocklist/blocklist.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
import { RetentionModule } from './modules/retention/retention.module.js';
import { TrashModule } from './modules/trash/trash.module.js';
import { PipelineModule } from './modules/processing/pipeline.module.js';
import { ProcessingWorkers } from './modules/processing/processing.workers.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { GuestEscrowModule } from './modules/deals/guest-escrow.module.js';
import { SupportModule } from './modules/support/support.module.js';

/** Background worker: video processing, thumbnails, housekeeping (tiers too), outbox relay and notification emails. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
      // Only validated values: an empty variable (compose passes `${VAR:-}`) is "not set", not ''.
      skipProcessEnv: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          customProps: () => ({ context: 'worker' }),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    OutboxModule,
    SettingsModule,
    PlansModule,
    BillingModule,
    DemoModule,
    AuditModule,
    BlocklistModule,
    TrashModule,
    RetentionModule,
    SupportModule,
    GuestEscrowModule,
    PipelineModule,
    NotificationsModule,
  ],
  providers: [ProcessingWorkers, NotificationWorkers],
})
export class WorkerModule {}

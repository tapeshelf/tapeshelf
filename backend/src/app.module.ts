import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CsrfGuard } from './common/guards/csrf.guard.js';
import { isUnloggedRoute } from './common/http/unlogged-routes.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PlanThrottlerGuard } from './common/guards/plan-throttler.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { VerifiedEmailGuard } from './common/guards/verified-email.guard.js';
import { type Env, validateEnv } from './config/env.js';
import { MailModule } from './infra/mail/mail.module.js';
import { OutboxModule } from './infra/outbox/outbox.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { RedisThrottlerStorage } from './infra/redis/redis-throttler.storage.js';
import { RATE_LIMITS } from './common/rate-limits.js';
import { REDIS_CLIENT, RedisModule } from './infra/redis/redis.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { WsModule } from './infra/ws/ws.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CollectionModule } from './modules/collection/collection.module.js';
import { ExchangeModule } from './modules/exchange/exchange.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SiteModule } from './modules/site/site.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CaptchaModule } from './modules/captcha/captcha.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { StreamingModule } from './modules/streaming/streaming.module.js';
import { DownloadsModule } from './modules/downloads/downloads.module.js';
import { DealsModule } from './modules/deals/deals.module.js';
import { LinksModule } from './modules/links/links.module.js';
import { AnonymousLinksModule } from './modules/anonymous-links/anonymous-links.module.js';
import { AppTokensModule } from './modules/app-tokens/app-tokens.module.js';
import { BlocklistModule } from './modules/blocklist/blocklist.module.js';
import { RetentionModule } from './modules/retention/retention.module.js';
import { TrashModule } from './modules/trash/trash.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { VideoEventsModule } from './modules/videos/video-events.module.js';
import { VideosModule } from './modules/videos/videos.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { SocialModule } from './modules/social/social.module.js';
import { WhatsNewModule } from './modules/whats-new/whats-new.module.js';
import { EditorModule } from './modules/editor/editor.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SupportModule } from './modules/support/support.module.js';

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
      useFactory: (config: ConfigService<Env, true>) => {
        const env = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            transport:
              env === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: true },
                  }
                : undefined,
            genReqId: (req) =>
              (req.headers['x-request-id'] as string | undefined) ??
              randomUUID(),
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            autoLogging: { ignore: (req) => isUnloggedRoute(req.url) },
            customProps: () => ({ context: 'HTTP' }),
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (redis: Redis, config: ConfigService<Env, true>) => ({
        // Routes pick their own entry with @RateLimit(); off only in test suites (they share one IP).
        throttlers: [{ name: 'default', ...RATE_LIMITS.default }],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => !config.get('RATE_LIMITS', { infer: true }),
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    OutboxModule,
    WsModule,
    MailModule,
    SettingsModule,
    PlansModule,
    BillingModule,
    DemoModule,
    CaptchaModule,
    HealthModule,
    SiteModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    VideosModule,
    VideoEventsModule,
    UploadsModule,
    StreamingModule,
    DownloadsModule,
    LinksModule,
    AnonymousLinksModule,
    AppTokensModule,
    DealsModule,
    BlocklistModule,
    TrashModule,
    RetentionModule,
    CollectionModule,
    ExchangeModule,
    NotificationsModule,
    SocialModule,
    WhatsNewModule,
    EditorModule,
    ChatModule,
    AuditModule,
    AccountsModule,
    ReportsModule,
    AdminModule,
    SupportModule,
  ],
  providers: [
    // Guard order matters: identify user → rate limit (per user) → CSRF → role → verified email.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PlanThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: VerifiedEmailGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

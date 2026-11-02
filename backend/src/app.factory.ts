import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { setSiteName } from './common/i18n/i18n.js';
import { guestIdMiddleware } from './common/middleware/guest-id.js';
import { APP_VERSION } from './common/version.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api';

/** Builds the fully configured app. Shared by main.ts, the OpenAPI export script and e2e tests. */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Paddle signs the exact bytes of its webhooks (/api/billing/webhook).
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
  setSiteName(config.get('SITE_NAME', { infer: true }));

  // Trust every hop on a private network (Caddy, and any reverse proxy in front of it): req.ip is the
  // right-most public address of X-Forwarded-For. A public client cannot spoof it — Caddy does not
  // trust public peers, so their own X-Forwarded-For is replaced. With `1` the second hop's container
  // address became every visitor's IP, collapsing per-IP rate limits into one.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.setGlobalPrefix(API_PREFIX);
  app.use(
    helmet({
      // Swagger UI (dev only) needs inline scripts; the SPA is served by nginx with its own CSP.
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  // Which build answered: visible on every API response in the browser's network tab.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Tapeshelf-Api', APP_VERSION);
    next();
  });
  app.use(cookieParser(config.get('COOKIE_SECRET', { infer: true })));
  app.use(guestIdMiddleware(isProd));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  if (!isProd) {
    // Same-origin through the Angular dev proxy in practice; direct access is handy for tooling.
    app.enableCors({ origin: ['http://localhost:4200'], credentials: true });
  }
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('tapeshelf API')
    .setDescription('Private video sharing and exchange platform')
    .setVersion('0.1.0')
    .addCookieAuth('vs_access')
    // The browser extension's token (connected apps): `Authorization: Bearer tsa_…`.
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwaggerUi(app: INestApplication): void {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { STORAGE_CONFIG, storageConfigFromEnv } from './storage.config.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        storageConfigFromEnv({
          S3_ENDPOINT: config.get('S3_ENDPOINT', { infer: true }),
          S3_PUBLIC_ENDPOINT: config.get('S3_PUBLIC_ENDPOINT', { infer: true }),
          S3_REGION: config.get('S3_REGION', { infer: true }),
          S3_ACCESS_KEY: config.get('S3_ACCESS_KEY', { infer: true }),
          S3_SECRET_KEY: config.get('S3_SECRET_KEY', { infer: true }),
          S3_FORCE_PATH_STYLE: config.get('S3_FORCE_PATH_STYLE', {
            infer: true,
          }),
          S3_BUCKET_PRIVATE: config.get('S3_BUCKET_PRIVATE', { infer: true }),
          S3_BUCKET_PUBLIC: config.get('S3_BUCKET_PUBLIC', { infer: true }),
          S3_PUBLIC_BUCKET_URL: config.get('S3_PUBLIC_BUCKET_URL', {
            infer: true,
          }),
        }),
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}

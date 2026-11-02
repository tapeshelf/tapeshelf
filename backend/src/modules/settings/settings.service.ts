import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import {
  type SettingKey,
  type Settings,
  withDefaults,
} from './settings.defaults.js';

const CACHE_TTL_SEC = 60;

/** Admin-editable site settings: DB row wins over the compiled default; cached in Redis for a minute. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    const cacheKey = `settings:${key}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    // Merged on the way out too: a value cached by an older build may lack newer keys.
    if (cached) return withDefaults(key, JSON.parse(cached));
    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    const value = withDefaults(key, row?.value);
    await this.redis
      .set(cacheKey, JSON.stringify(value), 'EX', CACHE_TTL_SEC)
      .catch(() => undefined);
    return value;
  }

  async set<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
    await this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
    await this.redis.del(`settings:${key}`).catch(() => undefined);
  }
}

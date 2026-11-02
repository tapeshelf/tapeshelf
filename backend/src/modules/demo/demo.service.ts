import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

import { hashPassword } from '../../common/crypto/password.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { SettingsService } from '../settings/settings.service.js';

const run = promisify(execFile);
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** The demo account shown in the banner. */
export const DEMO_ACCOUNT = {
  email: 'demo@tapeshelf.com',
  username: 'demo',
  password: 'demo',
} as const;

/** Small limits: the demo is for trying, not for keeping. */
const DEMO_LIMITS = {
  maxFileBytes: 200 * MiB,
  storageQuotaBytes: 1 * GiB,
  requestsPerDay: 30,
  trashRetentionDays: 1,
  extensionPerDay: 3,
};

/** Clips ffmpeg draws when no DEMO_SEED_DIR is given: generated, so free of any licence. */
const GENERATED = [
  {
    title: 'Game of Life',
    source:
      'life=s=1280x720:mold=10:r=25:ratio=0.1:death_color=#fc753e:life_color=#d1e4db',
    visibility: 'PUBLIC',
  },
  {
    title: 'Mandelbrot',
    source: 'mandelbrot=s=1280x720:rate=25',
    visibility: 'PUBLIC',
  },
  {
    title: 'Test card',
    source: 'testsrc2=s=1280x720:rate=25',
    visibility: 'PRIVATE',
  },
] as const;
const SECONDS = 8;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

/**
 * The public demo (DEMO_MODE): every day it is erased — database, the private bucket's
 * videos, the public bucket, cached settings — and seeded again with the admin, the demo account
 * with a few videos on its shelf, and small limits. Refuses to run outside DEMO_MODE or on the
 * cloud (also refused at start-up, env.ts demoProblems).
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly queues: QueueService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.enabled =
      config.get('DEMO_MODE', { infer: true }) &&
      config.get('EDITION', { infer: true }) !== 'cloud';
  }

  /** On the worker's start: an empty demo (first deploy) gets its seed now, not at 04:00. */
  async ensureSeeded(): Promise<void> {
    if (!this.enabled) return;
    const seeded = await this.prisma.user.count({
      where: { email: DEMO_ACCOUNT.email },
    });
    if (!seeded) await this.reset();
  }

  /** Daily: erase everything and seed again. */
  async reset(): Promise<{ videos: number }> {
    if (!this.enabled)
      throw new Error('Demo reset outside DEMO_MODE (or on the cloud)');
    this.logger.warn('Demo reset: erasing the database and the buckets');
    const adminSteps = await this.adminTwoFactor();
    await this.storage.deletePrefix('private', 'videos/');
    await this.storage.deletePrefix('public', '');
    const tables = await this.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (tables.length)
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    const keys = await this.redis.keys('settings:*');
    const signups = await this.redis.keys('signup:ip:*');
    if (keys.length + signups.length) await this.redis.del(...keys, ...signups);
    const videos = await this.seed(adminSteps);
    this.logger.log(`Demo seeded: ${videos} video(s)`);
    return { videos };
  }

  /**
   * The admin's two-step sign-in outlives the daily erase: the app and the passkeys set up
   * once keep working, not set up anew every morning.
   */
  private async adminTwoFactor() {
    return this.prisma.user.findUnique({
      where: {
        email: this.config.get('ADMIN_EMAIL', { infer: true }).toLowerCase(),
      },
      select: {
        twoFactorAt: true,
        totpSecret: true,
        totpLastStep: true,
        passkeys: {
          select: {
            credentialId: true,
            publicKey: true,
            counter: true,
            transports: true,
            name: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
        recoveryCodes: {
          select: { codeHash: true, usedAt: true, createdAt: true },
        },
      },
    });
  }

  private async seed(
    adminSteps: Awaited<ReturnType<DemoService['adminTwoFactor']>> = null,
  ): Promise<number> {
    const env = (key: 'ADMIN_EMAIL' | 'ADMIN_USERNAME' | 'ADMIN_PASSWORD') =>
      this.config.get(key, { infer: true });
    await this.prisma.user.create({
      data: {
        email: env('ADMIN_EMAIL').toLowerCase(),
        username: env('ADMIN_USERNAME').toLowerCase(),
        displayName: 'Admin',
        passwordHash: await hashPassword(env('ADMIN_PASSWORD')),
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
        ...(adminSteps?.twoFactorAt
          ? {
              twoFactorAt: adminSteps.twoFactorAt,
              totpSecret: adminSteps.totpSecret,
              totpLastStep: adminSteps.totpLastStep,
              passkeys: { create: adminSteps.passkeys },
              recoveryCodes: { create: adminSteps.recoveryCodes },
            }
          : {}),
      },
    });
    const demo = await this.prisma.user.create({
      data: {
        email: DEMO_ACCOUNT.email,
        username: DEMO_ACCOUNT.username,
        displayName: 'Demo',
        passwordHash: await hashPassword(DEMO_ACCOUNT.password),
        emailVerifiedAt: new Date(),
        bio: 'A shelf to try tapeshelf on. Everything here is erased every day.',
      },
    });
    await this.settings.set('limits', DEMO_LIMITS);
    const clips = await this.clips();
    for (const clip of clips) await this.addVideo(demo.id, clip);
    return clips.length;
  }

  /** The seed's files: DEMO_SEED_DIR's videos, else ffmpeg's generated clips (in the worker's tmp). */
  private async clips(): Promise<
    { path: string; title: string; visibility: 'PUBLIC' | 'PRIVATE' }[]
  > {
    const dir = this.config.get('DEMO_SEED_DIR', { infer: true });
    if (dir) {
      const names = (await readdir(dir))
        .filter((n) => VIDEO_EXT.has(extname(n).toLowerCase()))
        .sort();
      return names.map((name, i) => ({
        path: join(dir, name),
        title: name.slice(0, -extname(name).length).replace(/[-_]+/g, ' '),
        visibility:
          i === names.length - 1 && names.length > 1 ? 'PRIVATE' : 'PUBLIC',
      }));
    }
    const out = join(
      this.config.get('WORKER_TMP_DIR', { infer: true }),
      'demo-seed',
    );
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const ffmpeg = this.config.get('FFMPEG_PATH', { infer: true });
    const made = [];
    for (const [i, clip] of GENERATED.entries()) {
      const path = join(out, `clip-${i + 1}.mp4`);
      await run(ffmpeg, [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        clip.source,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${330 + i * 110}:sample_rate=48000`,
        '-t',
        String(SECONDS),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '50',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        path,
      ]);
      made.push({ path, title: clip.title, visibility: clip.visibility });
    }
    return made;
  }

  /** As a finished upload: the original in the private bucket, the video queued for processing. */
  private async addVideo(
    authorId: string,
    clip: { path: string; title: string; visibility: 'PUBLIC' | 'PRIVATE' },
  ): Promise<void> {
    const size = (await stat(clip.path)).size;
    const ext = extname(clip.path).toLowerCase();
    const video = await this.prisma.video.create({
      data: {
        authorId,
        title: clip.title,
        visibility: clip.visibility,
        status: 'QUEUED',
        originalKey: 'pending',
        originalFilename: `${clip.title}${ext}`,
        mimeType: 'video/mp4',
        sizeBytes: BigInt(size),
        holdings: { create: { holderId: authorId, source: 'AUTHOR' } },
      },
    });
    const originalKey = `videos/${video.id}/original${ext}`;
    await this.storage.put('private', {
      key: originalKey,
      path: clip.path,
      contentType: 'video/mp4',
    });
    await this.prisma.$transaction([
      this.prisma.video.update({
        where: { id: video.id },
        data: { originalKey },
      }),
      this.prisma.user.update({
        where: { id: authorId },
        data: { storageUsedBytes: { increment: BigInt(size) } },
      }),
    ]);
    await this.queues.enqueueProcessing({
      videoId: video.id,
      userId: authorId,
      seed: true,
    });
  }
}

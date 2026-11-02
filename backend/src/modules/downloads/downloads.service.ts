import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { normalizeVideoCode } from '../../common/validation/video-code.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.module.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { canDownload } from '../access/access-policy.js';
import { PlansService } from '../plans/plans.service.js';
import type { TierLimits } from '../settings/settings.defaults.js';
import { POLICY_SELECT, toViewer } from '../streaming/streaming.service.js';
import {
  REPEAT_WINDOW_MS,
  WAIT_SEC,
  attachmentHeader,
  downloadMode,
  monthWindow,
} from './download-rules.js';
import {
  DownloadTicketService,
  TICKET_TTL_SEC,
} from './download-ticket.service.js';
import type { DownloadInfoDto, DownloadTicketDto } from './downloads.dto.js';
import { dateLocale } from '../../common/i18n/i18n.js';

/** Presigned links of direct downloads live as long as before. */
const DIRECT_URL_TTL_SEC = 120;
/** A running download refreshes its slot this often; a slot not refreshed for a minute is stale. */
export const SLOT_HEARTBEAT_MS = 20_000;
const SLOT_STALE_MS = 60_000;
const RANGE = /^bytes=\d*-\d*$/;

const VIDEO_SELECT = {
  ...POLICY_SELECT,
  code: true,
  title: true,
  sizeBytes: true,
  thumbnailKey: true,
  thumbnailSmallKey: true,
  sensitive: true,
  originalKey: true,
  originalFilename: true,
  mimeType: true,
  renderKey: true,
  renderBytes: true,
} as const;
type DownloadVideo = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;

/** The file a download gives: what people watch, so an edited video's render. */
export function fileOf(
  video: Pick<
    DownloadVideo,
    | 'renderKey'
    | 'renderBytes'
    | 'originalKey'
    | 'originalFilename'
    | 'mimeType'
    | 'sizeBytes'
  >,
): {
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
} {
  if (video.renderKey)
    return {
      key: video.renderKey,
      filename: `${video.originalFilename.replace(/\.[^.]+$/, '') || 'video'}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: Number(video.renderBytes ?? 0),
    };
  return {
    key: video.originalKey,
    filename: video.originalFilename,
    mimeType: video.mimeType ?? 'application/octet-stream',
    sizeBytes: Number(video.sizeBytes),
  };
}

/** A file on its way to the browser: what to answer, and the slot to give back when it ends. */
export interface OpenedDownload {
  status: number;
  headers: Record<string, string>;
  body: Readable;
  /** Bytes per second through the API; 0 = as fast as it goes. */
  speed: number;
  touch(): Promise<void>;
  release(): Promise<void>;
}

/** Counted downloads this month and when the count starts over (MeDto.plan.usage). */
export async function downloadUsage(
  prisma: Pick<PrismaService, 'downloadEvent'>,
  userId: string,
  now = new Date(),
): Promise<{ used: number; resetAt: Date }> {
  const { start, resetAt } = monthWindow(now);
  const used = await prisma.downloadEvent.count({
    where: { userId, counted: true, startedAt: { gte: start } },
  });
  return { used, resetAt };
}

/**
 * Downloads of originals. Every signed-in viewer who
 * may watch a video may download it. Pro and admins get a presigned link straight to storage; Free
 * goes through the wait page, gets a one-time ticket and the file streams through the API at the
 * tier's speed, one at a time, ten a month (the same video again within an hour is free).
 */
@Injectable()
export class DownloadsService {
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
    private readonly tickets: DownloadTicketService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
  }

  /** `GET /downloads/:code`: everything the wait page shows. */
  async info(
    user: RequestUser,
    rawCode: string,
    now = new Date(),
  ): Promise<DownloadInfoDto> {
    const code = normalizeVideoCode(rawCode);
    if (!code) throw notFound();
    // A code seen through an anonymous link stays the page's: back leads where it came from.
    const seen = await this.prisma.anonymousCode.findUnique({
      where: { code },
      select: { videoId: true },
    });
    const video = await this.load(user, seen ? { id: seen.videoId } : { code });
    const limits = await this.limits(user);
    const direct = downloadMode(user.role, limits) === 'direct';
    const { resetAt } = monthWindow(now);
    const [{ used }, repeat, active] = direct
      ? [{ used: 0 }, false, 0]
      : await Promise.all([
          downloadUsage(this.prisma, user.id, now),
          this.isRepeat(user.id, video.id, now),
          this.activeCount(user.id, now),
        ]);
    const limit = direct ? 0 : limits.downloadsPerMonth;
    const concurrency = direct ? 0 : limits.downloadConcurrency;
    return {
      videoId: video.id,
      code: seen ? code : video.code,
      title: video.title,
      sizeBytes: fileOf(video).sizeBytes,
      thumbnailUrl: video.thumbnailKey
        ? this.storage.publicUrl(video.thumbnailKey)
        : null,
      sensitive: video.sensitive,
      direct,
      limit,
      used,
      resetAt: resetAt.toISOString(),
      speedBytesPerSec: direct ? 0 : limits.downloadSpeedBytesPerSec,
      concurrency,
      repeat,
      own: video.authorId === user.id,
      busy: concurrency > 0 && active >= concurrency,
      limitReached:
        limit > 0 && used >= limit && !repeat && video.authorId !== user.id,
      waitSec: direct ? 0 : WAIT_SEC,
    };
  }

  /** `POST /videos/:id/download`: after the wait, where the browser fetches the file. */
  async ticket(
    user: RequestUser,
    videoId: string,
    now = new Date(),
  ): Promise<DownloadTicketDto> {
    const video = await this.load(user, { id: videoId });
    const limits = await this.limits(user);
    if (downloadMode(user.role, limits) === 'direct')
      return { url: await this.direct(user, video), direct: true };
    if (
      limits.downloadConcurrency > 0 &&
      (await this.activeCount(user.id, now)) >= limits.downloadConcurrency
    )
      throw busy();
    await this.counts(user, video, limits, now);
    const t = this.tickets.sign(video.id, user.id, now.getTime());
    return {
      url: `/api/videos/${video.id}/download/file?t=${encodeURIComponent(t)}`,
      direct: false,
    };
  }

  /** `GET /videos/:id/download`: a direct download at once, a limited one via the wait page. */
  async redirect(user: RequestUser, videoId: string): Promise<string> {
    const video = await this.load(user, { id: videoId });
    const limits = await this.limits(user);
    return downloadMode(user.role, limits) === 'direct'
      ? this.direct(user, video)
      : `${this.publicUrl}/download/${video.code}`;
  }

  /**
   * `GET /videos/:id/download/file?t=`: the first request with a ticket counts and starts the
   * stream; while the ticket is valid it may be repeated with a Range header to resume.
   */
  async open(
    user: RequestUser,
    videoId: string,
    token: string | undefined,
    rawRange: string | undefined,
    now = new Date(),
  ): Promise<OpenedDownload> {
    const ticket = this.tickets.verify(token, now.getTime());
    if (!ticket || ticket.v !== videoId || ticket.u !== user.id)
      throw ticketInvalid();
    const video = await this.load(user, { id: videoId });
    const limits = await this.limits(user);
    const range = rawRange && RANGE.test(rawRange) ? rawRange : undefined;
    const first =
      (await this.redis.set(
        `dl:ticket:${ticket.j}`,
        '1',
        'EX',
        TICKET_TTL_SEC * 2,
        'NX',
      )) === 'OK';
    if (!first && !range) throw ticketUsed();

    const slot = await this.acquire(
      user.id,
      downloadMode(user.role, limits) === 'direct'
        ? 0
        : limits.downloadConcurrency,
      now,
    );
    if (!slot) throw busy();
    try {
      if (first) {
        const counted = await this.counts(user, video, limits, now);
        await this.record(user, video.id, counted);
      }
      const file = fileOf(video);
      const object = await this.storage
        .getStream('private', file.key, range)
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === 'InvalidRange')
            throw new AppException(
              HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
              'rangeNotSatisfiable',
              'errors.downloads.range',
            );
          throw err;
        });
      const headers: Record<string, string> = {
        'Content-Type': file.mimeType,
        'Content-Disposition': attachmentHeader(file.filename),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
      };
      if (object.contentLength !== undefined)
        headers['Content-Length'] = String(object.contentLength);
      if (range && object.contentRange)
        headers['Content-Range'] = object.contentRange;
      return {
        status: range && object.contentRange ? 206 : 200,
        headers,
        body: object.body,
        speed:
          downloadMode(user.role, limits) === 'direct'
            ? 0
            : limits.downloadSpeedBytesPerSec,
        touch: () => this.touch(user.id, slot),
        release: () => this.release(user.id, slot),
      };
    } catch (err) {
      await this.release(user.id, slot);
      throw err;
    }
  }

  // ------------------------------------------------------------------ internals

  private async load(
    user: RequestUser,
    where: { id: string } | { code: string },
  ): Promise<DownloadVideo> {
    const video = await this.prisma.video.findFirst({
      where: { ...where, deletedAt: null },
      select: VIDEO_SELECT,
    });
    if (!video) throw notFound();
    const holding = await this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId: video.id, holderId: user.id } },
      select: { holderId: true, source: true, hidden: true },
    });
    if (!canDownload(toViewer(user), video, holding))
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'downloadNotAllowed',
        'errors.videos.downloadNotAllowed',
      );
    return video;
  }

  private limits(user: RequestUser): Promise<TierLimits> {
    return this.plans.limitsFor(user.tier);
  }

  /** Presigned link to the original; logged, never counted. */
  private async direct(
    user: RequestUser,
    video: DownloadVideo,
  ): Promise<string> {
    await this.record(user, video.id, false);
    const file = fileOf(video);
    return this.storage.presignGet('private', file.key, DIRECT_URL_TTL_SEC, {
      contentDisposition: attachmentHeader(file.filename),
    });
  }

  /**
   * Whether this download counts; refuses one over the monthly limit. A repeat always passes, and
   * so does the author's own upload: only videos received from others are counted.
   */
  private async counts(
    user: RequestUser,
    video: { id: string; authorId: string },
    limits: TierLimits,
    now: Date,
  ): Promise<boolean> {
    if (limits.downloadsPerMonth === 0) return false;
    if (video.authorId === user.id) return false;
    if (await this.isRepeat(user.id, video.id, now)) return false;
    const { used, resetAt } = await downloadUsage(this.prisma, user.id, now);
    if (used >= limits.downloadsPerMonth)
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'downloadLimitReached',
        'errors.downloads.limitReached',
        {
          params: {
            limit: limits.downloadsPerMonth,
            date: new Intl.DateTimeFormat(dateLocale(user.locale), {
              dateStyle: 'long',
              timeZone: 'UTC',
            }).format(resetAt),
          },
          details: {
            limit: limits.downloadsPerMonth,
            used,
            resetAt: resetAt.toISOString(),
          },
        },
      );
    return true;
  }

  private async isRepeat(
    userId: string,
    videoId: string,
    now: Date,
  ): Promise<boolean> {
    const recent = await this.prisma.downloadEvent.count({
      where: {
        userId,
        videoId,
        startedAt: { gt: new Date(now.getTime() - REPEAT_WINDOW_MS) },
      },
    });
    return recent > 0;
  }

  private async record(
    user: RequestUser,
    videoId: string,
    counted: boolean,
  ): Promise<void> {
    await this.prisma.downloadEvent.create({
      data: { userId: user.id, videoId, tier: user.tier, counted },
    });
  }

  // Running downloads per user: a sorted set of slots scored by their last heartbeat, so a slot
  // of a process that died frees itself after a minute.

  private static readonly ACQUIRE = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    local limit = tonumber(ARGV[3])
    if limit > 0 and redis.call('ZCARD', KEYS[1]) >= limit then return 0 end
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
    redis.call('PEXPIRE', KEYS[1], ARGV[5])
    return 1
  `;

  private async acquire(
    userId: string,
    limit: number,
    now: Date,
  ): Promise<string | null> {
    const slot = randomUUID();
    const ok = await this.redis.eval(
      DownloadsService.ACQUIRE,
      1,
      slotsKey(userId),
      String(now.getTime() - SLOT_STALE_MS),
      String(now.getTime()),
      String(limit),
      slot,
      String(SLOT_STALE_MS * 2),
    );
    return ok === 1 ? slot : null;
  }

  private async activeCount(userId: string, now: Date): Promise<number> {
    await this.redis.zremrangebyscore(
      slotsKey(userId),
      '-inf',
      now.getTime() - SLOT_STALE_MS,
    );
    return this.redis.zcard(slotsKey(userId));
  }

  // The heartbeat keeps the set itself alive too: with the expiry set only when a slot was taken,
  // the set vanished two minutes into a long download and "one at a time" stopped.
  private static readonly TOUCH = `
    if redis.call('ZSCORE', KEYS[1], ARGV[2]) then
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
      redis.call('PEXPIRE', KEYS[1], ARGV[3])
    end
    return 1
  `;

  private async touch(userId: string, slot: string): Promise<void> {
    await this.redis
      .eval(
        DownloadsService.TOUCH,
        1,
        slotsKey(userId),
        String(Date.now()),
        slot,
        String(SLOT_STALE_MS * 2),
      )
      .catch(() => undefined);
  }

  private async release(userId: string, slot: string): Promise<void> {
    await this.redis.zrem(slotsKey(userId), slot).catch(() => undefined);
  }
}

const slotsKey = (userId: string) => `dl:active:${userId}`;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );
const busy = () =>
  new AppException(
    HttpStatus.TOO_MANY_REQUESTS,
    'downloadBusy',
    'errors.downloads.busy',
  );
const ticketInvalid = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'downloadTicketInvalid',
    'errors.downloads.ticketInvalid',
  );
const ticketUsed = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'downloadTicketUsed',
    'errors.downloads.ticketInvalid',
  );

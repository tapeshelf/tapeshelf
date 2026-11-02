import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { extname } from 'node:path';
import { v7 as uuidv7 } from 'uuid';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { UploadSession } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import {
  StorageService,
  isS3Error,
} from '../../infra/storage/storage.service.js';
import { startOfUtcDay } from '../app-tokens/app-token-rules.js';
import { overLimit } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { formatBytes } from '../processing/contact-sheet.js';
import type { VideoDto } from '../videos/videos.dto.js';
import { VideosService } from '../videos/videos.service.js';
import type {
  CompleteUploadDto,
  CreateUploadDto,
  PresignedPartsDto,
  StorageQuotaDto,
  UploadSessionDto,
  UploadTrack,
} from './uploads.dto.js';

/** 16 MiB parts; S3 allows at most 10 000 parts per upload. */
export const PART_SIZE = 16 * 1024 * 1024;
export const SESSION_TTL_MS = 24 * 3600 * 1000;
/**
 * However active, a session ends this long after it began. Within that, each use pushes its end a
 * day further: a slow or paused-and-resumed upload no longer dies a day after it started with all its
 * parts lost; an abandoned one still ends a day after its last use.
 */
export const SESSION_MAX_MS = 7 * 24 * 3600 * 1000;
const PART_URL_TTL_SEC = 3600;
const MAX_PARTS = 10_000;

/** Resumable browser → S3 multipart uploads with quota reservation. */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
    private readonly queues: QueueService,
    private readonly videos: VideosService,
  ) {}

  async quota(user: RequestUser): Promise<StorageQuotaDto> {
    const [limits, me, reserved] = await Promise.all([
      this.limits(user),
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { storageUsedBytes: true },
      }),
      this.reservedBytes(user.id),
    ]);
    return {
      usedBytes: Number(me.storageUsedBytes),
      reservedBytes: reserved,
      quotaBytes: limits.storageQuotaBytes,
      maxFileBytes: limits.maxFileBytes,
    };
  }

  async create(
    user: RequestUser,
    dto: CreateUploadDto,
  ): Promise<UploadSessionDto> {
    const limits = await this.limits(user);
    // A two-track upload is one video: its two files count together.
    const total = dto.size + (dto.audio?.size ?? 0);
    if (overLimit(total, limits.maxFileBytes))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'fileTooLarge',
        'errors.uploads.fileTooLarge',
        {
          params: { max: formatBytes(limits.maxFileBytes) },
        },
      );
    // Beyond what a multipart upload can carry, whatever the limit (none, self-hosted:).
    if (
      Math.ceil(dto.size / PART_SIZE) > MAX_PARTS ||
      Math.ceil((dto.audio?.size ?? 0) / PART_SIZE) > MAX_PARTS
    )
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'fileTooLarge',
        'errors.uploads.fileTooLarge',
        {
          params: { max: formatBytes(PART_SIZE * MAX_PARTS) },
        },
      );

    const id = uuidv7();
    const key = `videos/${id}/original${safeExt(dto.filename)}`;
    const contentType = dto.mimeType?.startsWith('video/')
      ? dto.mimeType
      : 'application/octet-stream';
    const s3UploadId = await this.storage.createMultipartUpload(
      key,
      contentType,
    );
    const audio = dto.audio
      ? {
          key: `videos/${id}/audio${safeExt(dto.audio.filename)}`,
          filename: dto.audio.filename,
          size: dto.audio.size,
          contentType: dto.audio.mimeType?.startsWith('audio/')
            ? dto.audio.mimeType
            : 'application/octet-stream',
        }
      : null;
    const audioUploadId = audio
      ? await this.storage
          .createMultipartUpload(audio.key, audio.contentType)
          .catch(async (err) => {
            await this.storage
              .abortMultipartUpload(key, s3UploadId)
              .catch(() => undefined);
            throw err;
          })
      : null;
    try {
      const session = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const me = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { storageUsedBytes: true },
        });
        // The browser extension's daily limit, counted under the same lock.
        if (user.appTokenId && limits.extensionPerDay > 0) {
          const today = await this.extensionUploadsToday(user.id, tx);
          if (today >= limits.extensionPerDay)
            throw new AppException(
              HttpStatus.TOO_MANY_REQUESTS,
              'extensionDailyLimit',
              'errors.uploads.extensionDailyLimit',
              {
                params: {
                  limit: limits.extensionPerDay,
                  resetAt: new Date(
                    startOfUtcDay().getTime() + 24 * 3600 * 1000,
                  ).toISOString(),
                },
              },
            );
        }
        const reserved = await this.reservedBytes(user.id, tx);
        const used = Number(me.storageUsedBytes);
        if (overLimit(used + reserved + total, limits.storageQuotaBytes))
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'quotaExceeded',
            'errors.uploads.quotaExceeded',
            {
              params: {
                used: formatBytes(used + reserved),
                quota: formatBytes(limits.storageQuotaBytes),
              },
            },
          );
        return tx.uploadSession.create({
          data: {
            id,
            userId: user.id,
            key,
            s3UploadId,
            filename: dto.filename,
            mimeType: contentType,
            declaredSize: BigInt(dto.size),
            sizeIsMax: dto.sizeIsMax ?? false,
            partSize: PART_SIZE,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            appTokenId: user.appTokenId ?? null,
            ...(audio && audioUploadId
              ? {
                  audioKey: audio.key,
                  audioS3UploadId: audioUploadId,
                  audioFilename: audio.filename,
                  audioDeclaredSize: BigInt(audio.size),
                }
              : {}),
          },
        });
      });
      return this.toDto(session, [], audio ? [] : undefined);
    } catch (err) {
      await this.storage
        .abortMultipartUpload(key, s3UploadId)
        .catch(() => undefined);
      if (audio && audioUploadId)
        await this.storage
          .abortMultipartUpload(audio.key, audioUploadId)
          .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Uploads started through the browser extension today (UTC) that have not failed or been given
   * up: what its daily limit counts.
   */
  async extensionUploadsToday(
    userId: string,
    db: Pick<PrismaService, 'uploadSession'> = this.prisma,
  ): Promise<number> {
    return db.uploadSession.count({
      where: {
        userId,
        appTokenId: { not: null },
        createdAt: { gte: startOfUtcDay() },
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
    });
  }

  async presignParts(
    user: RequestUser,
    id: string,
    partNumbers: number[],
    track: UploadTrack = 'video',
  ): Promise<PresignedPartsDto> {
    const session = await this.activeSession(user, id);
    const file = this.trackOf(session, track);
    const partCount = Math.ceil(file.size / session.partSize);
    const unique = [...new Set(partNumbers)].filter(
      (n) => n >= 1 && n <= partCount,
    );
    const parts = await Promise.all(
      unique.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          file.key,
          file.uploadId,
          partNumber,
          PART_URL_TTL_SEC,
        ),
      })),
    );
    return {
      parts,
      expiresAt: new Date(Date.now() + PART_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  /** Session with the parts S3 already holds — the client resumes from here. */
  async get(user: RequestUser, id: string): Promise<UploadSessionDto> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id, userId: user.id },
    });
    if (!session) throw notFound();
    if (session.status !== 'ACTIVE') return this.toDto(session, []);
    if (session.expiresAt < new Date()) {
      await this.expire(session);
      throw expired();
    }
    try {
      const parts = await this.storage.listParts(
        session.key,
        session.s3UploadId,
      );
      const audioParts =
        session.audioKey && session.audioS3UploadId
          ? await this.storage.listParts(
              session.audioKey,
              session.audioS3UploadId,
            )
          : undefined;
      return this.toDto(session, parts, audioParts);
    } catch (err) {
      if (!isS3Error(err, 'NoSuchUpload')) throw err;
      await this.expire(session);
      throw expired();
    }
  }

  async listActive(user: RequestUser): Promise<UploadSessionDto[]> {
    const sessions = await this.prisma.uploadSession.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return Promise.all(
      sessions.map(async (s) => {
        const parts = await this.storage
          .listParts(s.key, s.s3UploadId)
          .catch(() => []);
        const audioParts =
          s.audioKey && s.audioS3UploadId
            ? await this.storage
                .listParts(s.audioKey, s.audioS3UploadId)
                .catch(() => [])
            : undefined;
        return this.toDto(s, parts, audioParts);
      }),
    );
  }

  /** Finishes the S3 upload, verifies the size, creates the video and queues processing — in that order. */
  async complete(
    user: RequestUser,
    id: string,
    dto: CompleteUploadDto,
  ): Promise<VideoDto> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id, userId: user.id },
    });
    if (!session) throw notFound();
    if (session.status === 'COMPLETED' && session.videoId) {
      // Idempotent: a retried completion returns the existing video.
      return this.videos.getOwnDto(user.id, session.videoId);
    }
    if (session.status !== 'ACTIVE') throw notActive();
    if (session.expiresAt < new Date()) {
      await this.expire(session);
      throw expired();
    }
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, ownerId: user.id },
        select: { id: true },
      });
      if (!category)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'categoryNotFound',
          'errors.videos.categoryNotFound',
        );
    }

    // A two-track upload finishes both files, or neither.
    if (!!session.audioKey !== !!dto.audioParts?.length)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'uploadIncomplete',
        'errors.uploads.incomplete',
      );

    try {
      await this.storage.completeMultipartUpload(
        session.key,
        session.s3UploadId,
        dto.parts,
      );
      if (session.audioKey && session.audioS3UploadId && dto.audioParts)
        await this.storage.completeMultipartUpload(
          session.audioKey,
          session.audioS3UploadId,
          dto.audioParts,
        );
    } catch (err) {
      if (
        isS3Error(err, 'InvalidPart') ||
        isS3Error(err, 'InvalidPartOrder') ||
        isS3Error(err, 'EntityTooSmall') ||
        isS3Error(err, 'NoSuchUpload')
      )
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'uploadIncomplete',
          'errors.uploads.incomplete',
        );
      throw err;
    }
    const head = await this.storage.head('private', session.key);
    const size = head?.size ?? 0;
    const audioSize = session.audioKey
      ? ((await this.storage.head('private', session.audioKey))?.size ?? 0)
      : 0;
    const total = size + audioSize;
    const limits = await this.limits(user);
    const abort = async () => {
      await this.storage
        .deleteObjects(
          'private',
          [session.key, session.audioKey].filter((k): k is string => !!k),
        )
        .catch(() => undefined);
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'ABORTED' },
      });
    };
    if (
      !sizeMatches(size, session.declaredSize, session.sizeIsMax) ||
      !sizeMatches(audioSize, session.audioDeclaredSize, session.sizeIsMax)
    ) {
      await abort();
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'uploadSizeMismatch',
        'errors.uploads.sizeMismatch',
      );
    }
    if (overLimit(total, limits.maxFileBytes)) {
      await abort();
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'fileTooLarge',
        'errors.uploads.fileTooLarge',
        {
          params: { max: formatBytes(limits.maxFileBytes) },
        },
      );
    }

    const video = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const me = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { storageUsedBytes: true },
        });
        const reservedByOthers = await this.reservedBytes(user.id, tx, id);
        const used = Number(me.storageUsedBytes);
        if (
          overLimit(used + reservedByOthers + total, limits.storageQuotaBytes)
        )
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'quotaExceeded',
            'errors.uploads.quotaExceeded',
            {
              params: {
                used: formatBytes(used + reservedByOthers),
                quota: formatBytes(limits.storageQuotaBytes),
              },
            },
          );
        const created = await tx.video.create({
          data: {
            id: session.id,
            authorId: user.id,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            visibility: dto.visibility,
            sensitive: dto.sensitive ?? false,
            status: 'QUEUED',
            originalKey: session.key,
            originalFilename: session.filename,
            mimeType: session.mimeType,
            sizeBytes: BigInt(size),
            uploadedSize: BigInt(size),
            // Muxed into the original by the worker before anything else.
            audioKey: session.audioKey,
            audioSizeBytes: session.audioKey ? BigInt(audioSize) : null,
            sourceUrl: dto.sourceUrl ?? null,
            holdings: {
              create: {
                holderId: user.id,
                source: 'AUTHOR',
                categoryId: dto.categoryId ?? null,
                // Unsorted, it waits in the Inbox.
                inbox: !dto.categoryId,
              },
            },
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { storageUsedBytes: { increment: BigInt(total) } },
        });
        await tx.uploadSession.update({
          where: { id },
          data: { status: 'COMPLETED', videoId: created.id },
        });
        return created;
      })
      .catch(async (err) => {
        if (err instanceof AppException) await abort();
        throw err;
      });

    await this.queues.enqueueProcessing({ videoId: video.id, userId: user.id });
    return this.videos.getOwnDto(user.id, video.id);
  }

  async abort(user: RequestUser, id: string): Promise<void> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id, userId: user.id },
    });
    if (!session) throw notFound();
    if (session.status !== 'ACTIVE') return;
    await this.storage.abortMultipartUpload(session.key, session.s3UploadId);
    if (session.audioKey && session.audioS3UploadId)
      await this.storage
        .abortMultipartUpload(session.audioKey, session.audioS3UploadId)
        .catch(() => undefined);
    await this.prisma.uploadSession.update({
      where: { id },
      data: { status: 'ABORTED' },
    });
  }

  /** Abandoned sessions: abort in S3 and release the reservation. */
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.uploadSession.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
      take: 200,
    });
    for (const session of stale) await this.expire(session);
    return stale.length;
  }

  private async expire(session: UploadSession): Promise<void> {
    await this.storage
      .abortMultipartUpload(session.key, session.s3UploadId)
      .catch((err) =>
        this.logger.warn(
          `Abort of upload ${session.id} failed: ${String(err)}`,
        ),
      );
    if (session.audioKey && session.audioS3UploadId)
      await this.storage
        .abortMultipartUpload(session.audioKey, session.audioS3UploadId)
        .catch(() => undefined);
    await this.prisma.uploadSession.updateMany({
      where: { id: session.id, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
  }

  private async activeSession(
    user: RequestUser,
    id: string,
  ): Promise<UploadSession> {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id, userId: user.id },
    });
    if (!session) throw notFound();
    if (session.status !== 'ACTIVE') throw notActive();
    if (session.expiresAt < new Date()) {
      await this.expire(session);
      throw expired();
    }
    const until = new Date(
      Math.min(
        Date.now() + SESSION_TTL_MS,
        session.createdAt.getTime() + SESSION_MAX_MS,
      ),
    );
    // Written at most once an hour per session: parts are presigned in batches, often.
    if (until.getTime() - session.expiresAt.getTime() > 3600 * 1000) {
      await this.prisma.uploadSession.update({
        where: { id: session.id },
        data: { expiresAt: until },
      });
      session.expiresAt = until;
    }
    return session;
  }

  private limits(user: RequestUser) {
    return this.plans.limitsForUser(user);
  }

  private async reservedBytes(
    userId: string,
    db: Pick<PrismaService, 'uploadSession'> = this.prisma,
    excludeId?: string,
  ): Promise<number> {
    const agg = await db.uploadSession.aggregate({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        id: excludeId ? { not: excludeId } : undefined,
      },
      _sum: { declaredSize: true, audioDeclaredSize: true },
    });
    return (
      Number(agg._sum.declaredSize ?? 0) +
      Number(agg._sum.audioDeclaredSize ?? 0)
    );
  }

  /** The file of one track of a session: the video (always), or the audio of a two-track upload. */
  private trackOf(
    s: UploadSession,
    track: UploadTrack,
  ): { key: string; uploadId: string; size: number } {
    if (track === 'video')
      return {
        key: s.key,
        uploadId: s.s3UploadId,
        size: Number(s.declaredSize),
      };
    if (!s.audioKey || !s.audioS3UploadId || s.audioDeclaredSize === null)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'validation',
        'errors.validation',
      );
    return {
      key: s.audioKey,
      uploadId: s.audioS3UploadId,
      size: Number(s.audioDeclaredSize),
    };
  }

  private toDto(
    s: UploadSession,
    uploadedParts: { partNumber: number; etag: string; size: number }[],
    audioParts?: { partNumber: number; etag: string; size: number }[],
  ): UploadSessionDto {
    const size = Number(s.declaredSize);
    const audioSize = Number(s.audioDeclaredSize ?? 0);
    return {
      ...(s.audioKey && s.audioFilename
        ? {
            audio: {
              filename: s.audioFilename,
              size: audioSize,
              partCount: Math.ceil(audioSize / s.partSize),
              uploadedParts: audioParts ?? [],
            },
          }
        : {}),
      id: s.id,
      filename: s.filename,
      size,
      partSize: s.partSize,
      partCount: Math.ceil(size / s.partSize),
      status: s.status,
      uploadedParts,
      videoId: s.videoId,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    };
  }
}

/**
 * A finished file against its declared size: exactly that, or, for a stream whose length was known
 * only at its end, anything up to it.
 */
function sizeMatches(
  actual: number,
  declared: bigint | null,
  isMax: boolean,
): boolean {
  const expected = Number(declared ?? 0);
  if (!isMax) return actual === expected;
  return expected === 0 ? actual === 0 : actual > 0 && actual <= expected;
}

function safeExt(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'uploadNotFound',
    'errors.uploads.notFound',
  );
const notActive = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'uploadNotActive',
    'errors.uploads.notActive',
  );
const expired = () =>
  new AppException(HttpStatus.GONE, 'uploadExpired', 'errors.uploads.expired');

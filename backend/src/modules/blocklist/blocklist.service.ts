import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { Prisma } from '../../generated/prisma/client.js';
import type { ReportReason } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';

/** Hex SHA-256 of a stream (an original on disk or in storage). */
export async function sha256Of(stream: Readable): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Files removed for breaking the rules may not come back: originals are
 * hashed by the worker, an admin removal can put the hash on the blocklist, and processing of an
 * upload with a blocked hash fails with the reason `blocked`. Videos processed before hashes
 * existed are hashed by a backfill pass; a block placed on such a video waits for its hash.
 */
@Injectable()
export class BlocklistService {
  private readonly logger = new Logger(BlocklistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async isBlocked(sha256: string): Promise<boolean> {
    return (await this.prisma.blockedFile.count({ where: { sha256 } })) > 0;
  }

  /** Stores the hash of a video's original and completes a block that was waiting for it. */
  async recordHash(videoId: string, sha256: string): Promise<void> {
    await this.prisma.video.update({
      where: { id: videoId },
      data: { originalSha256: sha256 },
    });
    const pending = await this.prisma.blockedFile.findUnique({
      where: { videoId },
    });
    if (!pending || pending.sha256) return;
    if (await this.isBlocked(sha256))
      await this.prisma.blockedFile.delete({ where: { id: pending.id } });
    else
      await this.prisma.blockedFile.update({
        where: { id: pending.id },
        data: { sha256 },
      });
  }

  /** Puts a video's file on the blocklist (by hash now, or once the backfill has hashed it). */
  async block(
    db: Db,
    video: { id: string; originalSha256: string | null },
    rule: ReportReason,
    actorId: string,
  ): Promise<void> {
    if (
      video.originalSha256 &&
      (await db.blockedFile.count({
        where: { sha256: video.originalSha256 },
      }))
    )
      return;
    await db.blockedFile.upsert({
      where: { videoId: video.id },
      create: {
        videoId: video.id,
        sha256: video.originalSha256,
        rule,
        createdById: actorId,
      },
      update: { rule },
    });
  }

  /** An admin brought the video back: its file is allowed again. */
  async unblock(db: Db, videoId: string): Promise<void> {
    await db.blockedFile.deleteMany({ where: { videoId } });
  }

  /** Hashes one original straight from storage (videos processed before hashes existed). */
  async hashFromStorage(video: {
    id: string;
    originalKey: string;
  }): Promise<string> {
    const { body } = await this.storage.getStream('private', video.originalKey);
    const sha256 = await sha256Of(body);
    await this.recordHash(video.id, sha256);
    return sha256;
  }

  /**
   * Backfill: every original still in storage gets its hash, blocks waiting for one first. A video
   * that fails is logged and skipped until the next pass.
   */
  async backfill(): Promise<number> {
    let done = 0;
    const failed: string[] = [];
    for (;;) {
      const videos = await this.prisma.video.findMany({
        where: {
          originalSha256: null,
          purgedAt: null,
          status: { in: ['READY', 'FAILED'] },
          id: { notIn: failed },
        },
        select: {
          id: true,
          originalKey: true,
          blocks: { select: { id: true } },
        },
        orderBy: { id: 'asc' },
        take: 20,
      });
      if (!videos.length) break;
      videos.sort((a, b) => b.blocks.length - a.blocks.length);
      for (const v of videos)
        try {
          await this.hashFromStorage(v);
          done++;
        } catch (err) {
          failed.push(v.id);
          this.logger.warn(
            `Cannot hash video ${v.id}: ${(err as Error).message}`,
          );
        }
    }
    if (done) this.logger.log(`Hashed ${done} original(s)`);
    return done;
  }
}

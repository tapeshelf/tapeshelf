import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import {
  StorageService,
  isS3Error,
} from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BlocklistService } from '../blocklist/blocklist.service.js';
import { IN_TRASH } from './trash-state.js';

export function videoPrefixes(id: string): { private: string; public: string } {
  return { private: `videos/${id}/`, public: `v/${id}/` };
}

export interface PurgeResult {
  done: number;
  bytes: number;
  skipped: string[];
}

/**
 * Erase from S3 for good: original, HLS, frames, contact sheet. The row stays with
 * `purgedAt` so the history (holders, reports, audit) still makes sense. Only the admin erases,
 * from the admin trash: nothing leaves storage on its own or by a user's action; a file
 * waiting for a blocklist hash is hashed before it goes.
 */
@Injectable()
export class VideoPurgeService {
  private readonly logger = new Logger(VideoPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly blocklist: BlocklistService,
    private readonly queues: QueueService,
  ) {}

  async purge(actorId: string, ids: string[]): Promise<PurgeResult> {
    const rows = await this.prisma.video.findMany({
      where: { id: { in: ids }, ...IN_TRASH },
      select: {
        id: true,
        title: true,
        storedBytes: true,
        originalKey: true,
        originalSha256: true,
        blocks: { select: { id: true } },
        author: { select: { username: true } },
      },
    });
    let bytes = 0;
    const done = new Set<string>();
    // One video that cannot be erased now is logged and skipped; the others still go.
    for (const v of rows) {
      try {
        const size = await this.purgeOne(actorId, v);
        if (size === null) continue;
        bytes += size;
        done.add(v.id);
      } catch (err) {
        this.logger.warn(
          `Video ${v.id} not erased: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return {
      done: done.size,
      bytes,
      skipped: ids.filter((id) => !done.has(id)),
    };
  }

  /**
   * Erases one video; null when it left the trash meanwhile. The video is claimed first (`purgedAt`
   * set while still in the trash): a restore from then on finds it erased instead of bringing back a
   * video whose files are being deleted. A failure puts it back in the trash.
   */
  private async purgeOne(
    actorId: string,
    v: {
      id: string;
      title: string;
      storedBytes: bigint | null;
      originalKey: string;
      originalSha256: string | null;
      blocks: { id: string }[];
      author: { username: string };
    },
  ): Promise<number | null> {
    const claimed = await this.prisma.video.updateMany({
      where: { id: v.id, ...IN_TRASH },
      data: { purgedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    try {
      if (!v.originalSha256 && v.blocks.length) await this.hashBeforeErasure(v);
      // A job not started yet would bring files back after the erasure.
      await this.queues.dropVideoJobs(v.id);
      const p = videoPrefixes(v.id);
      const size =
        v.storedBytes !== null
          ? Number(v.storedBytes)
          : (await this.storage.prefixSize('private', p.private)) +
            (await this.storage.prefixSize('public', p.public));
      await this.storage.deletePrefix('private', p.private);
      await this.storage.deletePrefix('public', p.public);
      await this.prisma.$transaction(async (tx) => {
        await tx.video.update({
          where: { id: v.id },
          data: { storedBytes: size },
        });
        await this.audit.log(
          {
            actorId,
            action: 'video.purge',
            targetType: 'video',
            targetId: v.id,
            meta: {
              title: v.title,
              author: v.author.username,
              bytes: size,
            },
          },
          tx,
        );
      });
      return size;
    } catch (err) {
      await this.prisma.video
        .update({ where: { id: v.id }, data: { purgedAt: null } })
        .catch(() => undefined);
      throw err;
    }
  }

  /** A file waiting for its blocklist hash is hashed before it goes; without an original there is nothing to keep out. */
  private async hashBeforeErasure(v: {
    id: string;
    originalKey: string;
  }): Promise<void> {
    try {
      await this.blocklist.hashFromStorage(v);
    } catch (err) {
      if (!isS3Error(err, 'NoSuchKey')) throw err;
      this.logger.warn(
        `Video ${v.id}: no original left to hash, erased anyway`,
      );
    }
  }
}

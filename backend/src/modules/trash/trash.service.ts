import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TrashExit } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { videoCard } from '../collection/video-card.js';
import { effectiveTier, overLimit } from '../plans/plan.js';
import { PlansService } from '../plans/plans.service.js';
import { formatBytes } from '../processing/contact-sheet.js';
import type { TrashListDto } from './trash.dto.js';
import { processUnfinished } from './process-unfinished.js';
import { IN_USER_TRASH } from './trash-state.js';

const DAY_MS = 24 * 3600 * 1000;
const SWEEP_BATCH = 200;

/**
 * The trash: what the author deleted stays restorable for the
 * plan's `trashRetentionDays` (Free 30, Pro 90; self-hosted one period for all, 90 by default),
 * unless the author deletes it from here or empties the trash sooner. Then it leaves the
 * author's trash for good, its holders lose it, and it waits in the admin trash: nothing is erased
 * from storage here. Videos removed by an admin or with the account were never here.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlansService,
    private readonly queues: QueueService,
  ) {}

  /** `GET /me/trash`: the owner's own deletions, newest first. */
  async list(user: RequestUser): Promise<TrashListDto> {
    const days = (await this.plans.limitsFor(user.tier)).trashRetentionDays;
    const videos = await this.prisma.video.findMany({
      where: { authorId: user.id, ...IN_USER_TRASH },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    return {
      retentionDays: days,
      items: videos.map((v) => ({
        video: videoCard(this.storage, v, v.author),
        deletedAt: v.deletedAt!.toISOString(),
        purgeAt: new Date(v.deletedAt!.getTime() + days * DAY_MS).toISOString(),
      })),
    };
  }

  /**
   * `POST /me/trash/:id/restore`: back everywhere it was held (as the admin restore), if the
   * shelf has room for it again.
   */
  async restore(user: RequestUser, id: string): Promise<void> {
    const video = await this.prisma.video.findFirst({
      where: { id, authorId: user.id, ...IN_USER_TRASH },
      select: { id: true, sizeBytes: true, renderBytes: true },
    });
    if (!video)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'videoNotFound',
        'errors.videos.notFound',
      );
    const quota = (await this.plans.limitsForUser(user)).storageQuotaBytes;
    await this.prisma.$transaction(async (tx) => {
      // The same lock as an upload's: two restores (or a restore and an upload) at once each saw
      // the room the other was about to take.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const me = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { storageUsedBytes: true },
      });
      const reserved = await tx.uploadSession.aggregate({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        _sum: { declaredSize: true },
      });
      const used =
        Number(me.storageUsedBytes) + Number(reserved._sum.declaredSize ?? 0);
      // The original and its edited file, if any.
      const bytes = video.sizeBytes + (video.renderBytes ?? 0n);
      if (overLimit(used + Number(bytes), quota))
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'quotaExceeded',
          'errors.uploads.quotaExceeded',
          { params: { used: formatBytes(used), quota: formatBytes(quota) } },
        );
      const { count } = await tx.video.updateMany({
        where: { id: video.id, ...IN_USER_TRASH },
        data: {
          deletedAt: null,
          deletedById: null,
          deleteReason: null,
          storedBytes: null,
        },
      });
      if (count)
        await tx.user.update({
          where: { id: user.id },
          data: { storageUsedBytes: { increment: bytes } },
        });
    });
    await processUnfinished(this.prisma, this.queues, [video.id]);
  }

  /** `POST /me/trash/remove`: these leave the trash now, as if their time were over. */
  remove(user: RequestUser, ids: string[]): Promise<number> {
    return this.leave({ authorId: user.id, id: { in: ids } }, 'REMOVED');
  }

  /** `POST /me/trash/empty`: everything in it leaves at once. */
  empty(user: RequestUser): Promise<number> {
    return this.leave({ authorId: user.id }, 'EMPTIED');
  }

  /**
   * Out of the author's trash for good: they can no longer restore it, and the copies of the people
   * who held it are lost to them (the admin trash drops them if it ever brings the video back).
   * The files stay until the admin erases them.
   */
  async leave(
    where: Prisma.VideoWhereInput,
    why: TrashExit,
    db: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<number> {
    const { count } = await db.video.updateMany({
      where: { ...where, ...IN_USER_TRASH },
      data: { trashExit: why, trashExitAt: now },
    });
    return count;
  }

  /** Hourly: what has been in its author's trash longer than their plan keeps it leaves it. */
  async sweep(now = new Date()): Promise<number> {
    const retention = {
      BASIC: (await this.plans.limitsFor('BASIC')).trashRetentionDays,
      PREMIUM: (await this.plans.limitsFor('PREMIUM')).trashRetentionDays,
    };
    const shortest = Math.min(retention.BASIC, retention.PREMIUM);
    let expired = 0;
    let after: string | undefined;
    for (;;) {
      const batch = await this.prisma.video.findMany({
        where: {
          ...IN_USER_TRASH,
          deletedAt: { lte: new Date(now.getTime() - shortest * DAY_MS) },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: {
          id: true,
          deletedAt: true,
          author: { select: { tier: true, tierUntil: true } },
        },
        orderBy: { id: 'asc' },
        take: SWEEP_BATCH,
      });
      if (!batch.length) break;
      after = batch[batch.length - 1]!.id;
      // The author's plan at the time of the check: a Pro that ended shortens what is left.
      const due = batch.filter(
        (v) =>
          v.deletedAt!.getTime() +
            retention[effectiveTier(v.author, now)] * DAY_MS <=
          now.getTime(),
      );
      if (due.length)
        expired += await this.leave(
          { id: { in: due.map((v) => v.id) } },
          'EXPIRED',
          this.prisma,
          now,
        );
    }
    if (expired)
      this.logger.log(`${expired} video(s) left the trash, time over`);
    return expired;
  }
}

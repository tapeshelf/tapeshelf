import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { QueueService } from '../../infra/queue/queue.service.js';

/**
 * Videos back from the trash that were deleted before their processing ended: the run that
 * met the deletion stopped and left them queued or "processing", with no job. They go to
 * processing again; one under an edit is the editor's (its render lets the edit go).
 */
export async function processUnfinished(
  prisma: PrismaService,
  queues: QueueService,
  ids: string[],
): Promise<number> {
  const videos = await prisma.video.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: { in: ['QUEUED', 'PROCESSING'] },
      OR: [{ stage: null }, { stage: { not: 'EDIT' } }],
    },
    select: { id: true, authorId: true },
  });
  let done = 0;
  for (const v of videos) {
    if (await queues.hasProcessingJob(v.id)) continue;
    await prisma.video.update({
      where: { id: v.id },
      data: { status: 'QUEUED', stage: null, progress: 0 },
    });
    await queues.enqueueProcessing({
      videoId: v.id,
      userId: v.authorId,
    });
    done++;
  }
  return done;
}

import type { Prisma } from '../../generated/prisma/client.js';
import type { StacksService } from '../collection/stacks.service.js';

/**
 * A video that left its author's trash for good was lost to the people who held it: when
 * the admin brings it back, their copies go.
 */
export async function dropLostCopies(
  tx: Prisma.TransactionClient,
  stacks: StacksService,
  videoId: string,
): Promise<string[]> {
  const gone = await tx.videoAccess.findMany({
    where: {
      videoId,
      source: { not: 'AUTHOR' },
    },
    select: { id: true, holderId: true, stackId: true },
  });
  if (!gone.length) return [];
  await tx.videoAccess.deleteMany({
    where: { id: { in: gone.map((h) => h.id) } },
  });
  await stacks.afterLeaving(
    tx,
    gone.map((h) => h.stackId).filter((id): id is string => !!id),
  );
  return gone.map((h) => h.holderId);
}

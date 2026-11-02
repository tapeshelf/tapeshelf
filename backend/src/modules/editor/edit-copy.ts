import { v7 as uuidv7 } from 'uuid';

import type { Prisma } from '../../generated/prisma/client.js';
import {
  currentOrder,
  lockOrder,
  writeOrder,
} from '../collection/positions.js';
import { UNDER_EDIT } from './edit-job.js';

type Tx = Prisma.TransactionClient;

/**
 * A copy saved in the editor is on its author's shelf from that moment: a video being made
 * ("Editing", with its progress), in the original's category and stack — hidden if that is — and
 * right after it, both in the order by hand and by date. Its file and pictures come with the render.
 */
export async function createCopyPlaceholder(
  tx: Tx,
  source: {
    id: string;
    authorId: string;
    description: string | null;
    visibility: 'PUBLIC' | 'PRIVATE';
    sensitive: boolean;
    originalFilename: string;
  },
  title: string,
): Promise<string> {
  const id = uuidv7();
  const holding = await tx.videoAccess.findUnique({
    where: {
      videoId_holderId: { videoId: source.id, holderId: source.authorId },
    },
    select: { categoryId: true, stackId: true, hidden: true, createdAt: true },
  });
  await lockOrder(tx, source.authorId);
  await tx.video.create({
    data: {
      id,
      authorId: source.authorId,
      title,
      description: source.description,
      visibility: source.visibility,
      sensitive: source.sensitive,
      ...UNDER_EDIT,
      originalKey: `videos/${id}/original.mp4`,
      originalFilename: `${baseName(source.originalFilename)}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: 0n,
      holdings: {
        create: {
          holderId: source.authorId,
          source: 'AUTHOR',
          categoryId: holding?.categoryId ?? null,
          stackId: holding?.stackId ?? null,
          hidden: holding?.hidden ?? false,
          // By date (newest first) it comes right after the original.
          ...(holding
            ? { createdAt: new Date(holding.createdAt.getTime() - 1) }
            : {}),
        },
      },
    },
  });
  if (holding) {
    const order = (await currentOrder(tx, source.authorId))
      .map((r) => r.videoId)
      .filter((v) => v !== id);
    order.splice(order.indexOf(source.id) + 1, 0, id);
    await writeOrder(tx, source.authorId, order);
  }
  return id;
}

/**
 * Takes a copy that never came to be off the shelf (a cancel, a failure, its original gone).
 * Only while it is still being made: a finished copy is a video of its own. True when it was there.
 */
export async function dropCopyPlaceholder(
  db: Pick<Tx, 'video'>,
  copyId: string,
): Promise<boolean> {
  const { count } = await db.video.deleteMany({
    where: { id: copyId, status: { not: 'READY' }, stage: 'EDIT' },
  });
  return count > 0;
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'video';
}

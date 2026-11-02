import type { DeleteReason, TrashExit } from '../../generated/prisma/enums.js';

/** Deleted and its files still in storage: everything the admin trash holds. */
export const IN_TRASH = { deletedAt: { not: null }, purgedAt: null } as const;

/**
 * Still in its author's trash: the author can bring it back. Once it leaves — emptied,
 * deleted from there, time over, account blocked or gone — only the admin decides on it.
 */
export const IN_USER_TRASH = {
  ...IN_TRASH,
  deleteReason: 'USER',
  trashExitAt: null,
} as const;

/** Out of the author's reach from the start: removed by an admin or with the account. */
export function exitOf(reason: DeleteReason): TrashExit | null {
  return reason === 'USER' ? null : reason;
}

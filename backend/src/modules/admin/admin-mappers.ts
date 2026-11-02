import type {
  AccessSource,
  DeleteReason,
  ReportReason,
  TrashExit,
  UserStatus,
} from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StorageService } from '../../infra/storage/storage.service.js';
import type { AdminUserRefDto, AdminVideoRowDto } from './admin.dto.js';

export interface UserRefRow {
  id: string;
  username: string;
  displayName: string;
  status: UserStatus;
}

export const USER_REF_SELECT = {
  id: true,
  username: true,
  displayName: true,
  status: true,
} as const;

export function userRef(u: UserRefRow): AdminUserRefDto {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    status: u.status,
  };
}

/** Video row with what the admin tables show (author, deleter, hidden by the author). */
export const VIDEO_ROW_INCLUDE = {
  author: { select: USER_REF_SELECT },
  holdings: {
    where: { source: 'AUTHOR' },
    select: { source: true, hidden: true },
  },
} as const;

export interface RowCounts {
  holders: number;
  blocked: boolean;
}

/**
 * Holders (other than the author) and the blocklist mark of these videos, by their ids only. A
 * `_count` in the include made Prisma group every holding there is on each admin page (330 ms at a
 * million holdings).
 */
export async function rowCounts(
  prisma: PrismaService,
  ids: string[],
): Promise<Map<string, RowCounts>> {
  if (ids.length === 0) return new Map();
  const [holders, blocks] = await Promise.all([
    prisma.videoAccess.groupBy({
      by: ['videoId'],
      where: { videoId: { in: ids }, source: { not: 'AUTHOR' } },
      _count: { _all: true },
    }),
    prisma.blockedFile.findMany({
      where: { videoId: { in: ids } },
      select: { videoId: true },
    }),
  ]);
  const held = new Map(holders.map((h) => [h.videoId, h._count._all]));
  const blocked = new Set(blocks.map((b) => b.videoId));
  return new Map(
    ids.map((id) => [
      id,
      { holders: held.get(id) ?? 0, blocked: blocked.has(id) },
    ]),
  );
}

export interface VideoRow {
  id: string;
  title: string;
  status: AdminVideoRowDto['status'];
  visibility: AdminVideoRowDto['visibility'];
  sensitive: boolean;
  sizeBytes: bigint;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  thumbnailKey: string | null;
  failReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  deleteReason: DeleteReason | null;
  trashExit: TrashExit | null;
  trashExitAt: Date | null;
  storedBytes: bigint | null;
  purgedAt: Date | null;
  takedownRule: ReportReason | null;
  takedownNote: string | null;
  author: UserRefRow;
  /** At least the author's own holding. */
  holdings: { source: AccessSource; hidden: boolean }[];
}

export function videoRow(
  storage: StorageService,
  v: VideoRow,
  counts: RowCounts,
  deletedBy: UserRefRow | null = null,
): AdminVideoRowDto {
  return {
    id: v.id,
    title: v.title,
    author: userRef(v.author),
    status: v.status,
    visibility: v.visibility,
    sensitive: v.sensitive,
    sizeBytes: Number(v.sizeBytes),
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    thumbnailUrl:
      v.thumbnailKey && !v.purgedAt ? storage.publicUrl(v.thumbnailKey) : null,
    failReason: v.failReason,
    holders: counts.holders,
    createdAt: v.createdAt.toISOString(),
    deletedAt: v.deletedAt?.toISOString() ?? null,
    deleteReason: v.deleteReason,
    deletedBy: deletedBy ? userRef(deletedBy) : null,
    trashExit: v.trashExit,
    trashExitAt: v.trashExitAt?.toISOString() ?? null,
    restorableUntil: null,
    storedBytes: v.storedBytes === null ? null : Number(v.storedBytes),
    purgedAt: v.purgedAt?.toISOString() ?? null,
    takedownRule: v.takedownRule,
    takedownNote: v.takedownNote,
    blocked: counts.blocked,
    hiddenByAuthor: v.holdings.some((h) => h.source === 'AUTHOR' && h.hidden),
  };
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

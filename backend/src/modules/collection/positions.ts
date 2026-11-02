import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ListSort, SortDirection } from './collection.dto.js';

export type Db = Prisma.TransactionClient | PrismaService;

/**
 * One change of a holder's order at a time, until the transaction ends: two quick drags (or a drag
 * and a stack) read the same order and the second one's write undid the first.
 */
export async function lockOrder(db: Db, holderId: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('collection-order'), hashtext(${holderId}::text))`;
}

/** Each order's own first way: the newest, the longest, the largest, the best first; names A to Z. */
const FIRST_WAY: Record<ListSort, SortDirection> = {
  added: 'desc',
  title: 'asc',
  manual: 'asc',
  duration: 'desc',
  size: 'desc',
  quality: 'desc',
  category: 'asc',
  visibility: 'asc',
};

function way(sort: ListSort, dir?: SortDirection): Prisma.Sql {
  return Prisma.raw((dir ?? FIRST_WAY[sort]) === 'asc' ? 'ASC' : 'DESC');
}

/**
 * What an owner's table column sorts by (aliases `va` = holding, `v` = video): selected as
 * "sortKey" for the page's second pass. Nothing for the page's own three orders.
 */
export function sortKey(sort: ListSort): Prisma.Sql {
  switch (sort) {
    case 'duration':
      return Prisma.sql`v."durationSec"`;
    case 'size':
      return Prisma.sql`v."sizeBytes"`;
    case 'quality':
      return Prisma.sql`v.height`;
    case 'category':
      return Prisma.sql`(SELECT lower(c.name) FROM "Category" c WHERE c.id = va."categoryId")`;
    case 'visibility':
      // Public own, private own, from others: as the visitor's sections go.
      return Prisma.sql`(CASE WHEN va.source <> 'AUTHOR'::"AccessSource" THEN 2 WHEN v.visibility = 'PUBLIC'::"Visibility" THEN 0 ELSE 1 END)`;
    default:
      return Prisma.sql`NULL::int`;
  }
}

/** The shelf's order under a sort, as the listing shows it (aliases `va` = holding, `v` = video). */
export function orderBy(sort: ListSort, dir?: SortDirection): Prisma.Sql {
  const d = way(sort, dir);
  switch (sort) {
    case 'title':
      // The holder's own name where they gave one: the shelf shows that.
      return Prisma.sql`lower(COALESCE(va."customTitle", v.title)) ${d}, va.id DESC`;
    case 'manual':
      return Prisma.sql`va.position ASC, va."createdAt" DESC, va.id DESC`;
    case 'added':
      return Prisma.sql`va."createdAt" ${d}, va.id ${d}`;
    default:
      return Prisma.sql`${sortKey(sort)} ${d} NULLS LAST, va."createdAt" DESC, va.id DESC`;
  }
}

/**
 * The same order on a page's selected columns (alias `p`: "sortTitle", "sortKey", position,
 * "addedAt", "holdingId"), for a query that pages first and adds to the page's rows afterwards.
 */
export function pageOrderBy(sort: ListSort, dir?: SortDirection): Prisma.Sql {
  const d = way(sort, dir);
  switch (sort) {
    case 'title':
      return Prisma.sql`p."sortTitle" ${d}, p."holdingId" DESC`;
    case 'manual':
      return Prisma.sql`p.position ASC, p."addedAt" DESC, p."holdingId" DESC`;
    case 'added':
      return Prisma.sql`p."addedAt" ${d}, p."holdingId" ${d}`;
    default:
      return Prisma.sql`p."sortKey" ${d} NULLS LAST, p."addedAt" DESC, p."holdingId" DESC`;
  }
}

/** The holder's live holdings in the order of `sort`. */
export function orderUnder(
  db: Db,
  holderId: string,
  sort: ListSort,
  dir?: SortDirection,
): Promise<{ videoId: string; stackId: string | null; position: number }[]> {
  return db.$queryRaw(Prisma.sql`
    SELECT va."videoId", va."stackId", va.position
    FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
    WHERE va."holderId" = ${holderId}::uuid AND v."deletedAt" IS NULL
    ORDER BY ${orderBy(sort, dir)}`);
}

/** The holder's live holdings in their manual order. */
export async function currentOrder(
  db: Db,
  holderId: string,
): Promise<{ videoId: string; stackId: string | null }[]> {
  return db.videoAccess.findMany({
    where: { holderId, video: { deletedAt: null } },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { videoId: true, stackId: true },
  });
}

/** Room between neighbours in the manual order, so a move can write only what moved. */
export const POSITION_GAP = 1024;
/** Within a 4-byte integer, with room to spare; past it the order is renumbered. */
const POSITION_LIMIT = 2_000_000_000;

/**
 * Renumbers the holder's positions in this order, POSITION_GAP apart, in one statement. The ids go
 * as one array parameter: a pair of parameters per row hit Postgres' limit of 65535 at 32768
 * holdings, and only rows whose position changes are written.
 */
export async function writeOrder(
  db: Db,
  holderId: string,
  videoIds: readonly string[],
): Promise<void> {
  if (videoIds.length === 0) return;
  await db.$executeRaw(Prisma.sql`
    UPDATE "VideoAccess" AS va SET position = ((v.ord - 1) * ${POSITION_GAP})::int
    FROM unnest(${[...videoIds]}::uuid[]) WITH ORDINALITY AS v("videoId", ord)
    WHERE va."holderId" = ${holderId}::uuid AND va."videoId" = v."videoId"
      AND va.position IS DISTINCT FROM ((v.ord - 1) * ${POSITION_GAP})::int`);
}

/**
 * A drag's new order, written as little as it can be: the moved videos take positions between their
 * new neighbours, the rest keep theirs. One video moved to the top of a shelf of tens of thousands rewrote all
 * of them — 359 ms and 13.6 MB of WAL. Renumbered whole instead when there is no room
 * between the neighbours, or the others' positions do not say their order on their own (new
 * uploads all at 0, shelves numbered before the gaps).
 */
export async function writeMove(
  db: Db,
  holderId: string,
  holdings: readonly { videoId: string; position: number }[],
  next: readonly string[],
  moved: ReadonlySet<string>,
): Promise<void> {
  const at = new Map(holdings.map((h) => [h.videoId, h.position]));
  const first = next.findIndex((id) => moved.has(id));
  let count = 0;
  for (const id of next) if (moved.has(id)) count++;
  const rest = next.filter((id) => !moved.has(id));
  let ordered = first >= 0;
  for (let i = first; ordered && i < first + count; i++)
    ordered = moved.has(next[i]!);
  for (let i = 1; ordered && i < rest.length; i++)
    ordered = at.get(rest[i]!)! > at.get(rest[i - 1]!)!;
  let lo = first > 0 ? at.get(next[first - 1]!) : undefined;
  let hi =
    first + count < next.length ? at.get(next[first + count]!) : undefined;
  if (lo === undefined && hi !== undefined)
    lo = hi - POSITION_GAP * (count + 1);
  if (hi === undefined && lo !== undefined)
    hi = lo + POSITION_GAP * (count + 1);
  if (
    !ordered ||
    lo === undefined ||
    hi === undefined ||
    hi - lo <= count ||
    Math.abs(lo) > POSITION_LIMIT ||
    Math.abs(hi) > POSITION_LIMIT
  )
    return writeOrder(db, holderId, next);
  const ids = next.slice(first, first + count);
  const positions = ids.map(
    (_, i) => lo + Math.floor(((hi - lo) * (i + 1)) / (count + 1)),
  );
  await db.$executeRaw(Prisma.sql`
    UPDATE "VideoAccess" AS va SET position = m.position
    FROM unnest(${ids}::uuid[], ${positions}::int[]) AS m("videoId", position)
    WHERE va."holderId" = ${holderId}::uuid AND va."videoId" = m."videoId"`);
}

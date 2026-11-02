import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  AccessSource,
  ProcessingStage,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IN_USER_TRASH } from '../trash/trash-state.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  type PolicyHolding,
  type Viewer,
  canAddToCollection,
  canDownload,
  canEditVideo,
  canHide,
  canManage,
  canStream,
  canView,
  holdingVisibleTo,
  isAdmin,
  pageVisible,
  requestBlocker,
} from '../access/access-policy.js';
import type { CategoryDto } from '../categories/categories.dto.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import { PlansService } from '../plans/plans.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { linkCarries } from '../links/link-rules.js';
import { AnonymousLinksService } from '../anonymous-links/anonymous-links.service.js';
import type { Masker } from '../anonymous-links/masker.js';
import { type ResolvedHandle, UsersService } from '../users/users.service.js';
import { orderBy, pageOrderBy, sortKey } from './positions.js';
import { frameKey, videoCard } from './video-card.js';
import type { VideoCardDto } from './video-card.dto.js';
import type {
  CollectionDto,
  CollectionFilter,
  CollectionItemDto,
  CollectionBucketsDto,
  CollectionBucketsQueryDto,
  CollectionQueryDto,
  CollectionSummaryDto,
  FeaturedDto,
  ListSort,
  ShelfFoldersDto,
  SortDirection,
  VideoPageDto,
} from './collection.dto.js';
import {
  COLLECTION_SORTS,
  type CollectionSort,
  type TileScale,
} from '../users/page-settings.js';

const DEFAULT_LIMIT = 60;
/** Opened again within this, the shelf is the same visit: what is lit stays lit. */
export const VISIT_GAP_MS = 30 * 60_000;

interface CardSource {
  id: string;
  code: string;
  title: string;
  visibility: Visibility;
  status: VideoStatus;
  stage: ProcessingStage | null;
  progress: number;
  failReason: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: bigint;
  thumbnailKey: string | null;
  thumbnailSmallKey: string | null;
  contactSheetKey: string | null;
  assetPrefix: string | null;
  smallFrames: boolean;
  sensitive: boolean;
  createdAt: Date;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
}

interface CollectionRow extends CardSource {
  source: AccessSource;
  hidden: boolean;
  unseen: boolean;
  customTitle: string | null;
  categoryId: string | null;
  stackId: string | null;
  stackName: string | null;
  stackCoverVideoId: string | null;
  stackSize: bigint;
  position: number;
  addedAt: Date;
  /** The anonymous link the author reached this holder through. */
  holdingLink: string | null;
}

interface SummaryRow {
  authored: boolean;
  isPublic: boolean;
  hidden: boolean;
  categoryId: string | null;
  count: bigint;
}

/** A user's page as seen by a visitor or by the owner. */
/** Someone who holds nothing here: what a guest could ask for, were they a person. */
const GUEST_ASKER = {
  id: 'guest',
  role: 'USER',
  tier: 'BASIC',
} as const satisfies NonNullable<Viewer>;

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly exchange: ExchangeService,
    private readonly plans: PlansService,
    private readonly anonymous: AnonymousLinksService,
  ) {}

  async collection(
    viewer: RequestUser | undefined,
    username: string,
    query: CollectionQueryDto,
  ): Promise<CollectionDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner } = page;
    const ownerView = isOwnerView(v, page);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_LIMIT;
    // The table's columns are the owner's; a visitor gets the page's order.
    const sort: ListSort =
      query.sort && (ownerView || isPageSort(query.sort))
        ? query.sort
        : owner.pageSettings.sort;
    const dir = query.dir;
    // One feed for a visitor: no public → private → others first.
    const ranked = !ownerView && !query.flat;

    const { filters, found } = listFilters(v, owner.id, ownerView, query, page);
    // The holdings counted: the same filters, without the joins only the page's rows need.
    const counted = Prisma.sql`FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId" WHERE ${filters}`;
    // A search puts what it found in the title first, then elsewhere, then the near misses.
    const relevance = found
      ? Prisma.sql`${found.rank} ASC, ${found.similarity} DESC, `
      : Prisma.empty;
    const order = ranked
      ? Prisma.sql`ORDER BY (${RANK}), ${relevance}${orderBy(sort, dir)}`
      : Prisma.sql`ORDER BY ${relevance}${orderBy(sort, dir)}`;

    // A stack's size is counted for the page's rows only, with the page's filters (and, for a
    // visitor, inside its section): a window over every holding sorted the whole shelf for each
    // page.
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<CollectionRow[]>(Prisma.sql`
        SELECT p.*, (CASE WHEN p."stackId" IS NULL THEN 0 ELSE ss.n END)::bigint AS "stackSize"
        FROM (
          SELECT ${ROW_COLUMNS},
                 va.id AS "holdingId", (${RANK}) AS rank, ${SORT_TITLE} AS "sortTitle", ${sortKey(sort)} AS "sortKey",
                 ${found ? found.rank : Prisma.sql`0`} AS "searchRank",
                 ${found ? found.similarity : Prisma.sql`0`}::float AS "searchSim"
          FROM "VideoAccess" va
            JOIN "Video" v ON v.id = va."videoId"
            JOIN "User" a ON a.id = v."authorId"
            LEFT JOIN "VideoStack" s ON s.id = va."stackId"
          WHERE ${filters} ${order} OFFSET ${offset} LIMIT ${limit}
        ) p
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS n ${counted}
            AND va."stackId" = p."stackId" ${ranked ? Prisma.sql`AND (${RANK}) = p.rank` : Prisma.empty}
        ) ss ON p."stackId" IS NOT NULL
        ORDER BY ${ranked ? Prisma.sql`p.rank, ` : Prisma.empty}${found ? Prisma.sql`p."searchRank" ASC, p."searchSim" DESC, ` : Prisma.empty}${pageOrderBy(sort, dir)}`),
      this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count ${counted}`,
      ),
    ]);
    const holder = v?.id === owner.id && !page.link;
    const masker = this.masker(v, page);
    const items = rows.map((r) => this.toItem(r, holder, masker, page));
    await this.peekStacks(rows, items, filters, ranked, holder, sort, dir, {
      masker,
      page,
    });
    await masker.apply();
    return {
      mode: ownerView ? 'OWNER' : 'VISITOR',
      sort,
      total: Number(counts[0]?.count ?? 0),
      offset,
      items,
    };
  }

  /**
   * A stack's videos fall wherever the order puts them, so a page may hold only some of them and
   * the tile would show two pictures now and four once the shelf has loaded further. The first row
   * of such a stack carries its first four pictures — the cover first, then in the shelf's order,
   * the one the open stack shows its videos in — with the page's filters and, for a visitor,
   * inside its section.
   */
  private async peekStacks(
    rows: (CollectionRow & { rank?: number })[],
    items: CollectionItemDto[],
    filters: Prisma.Sql,
    ranked: boolean,
    holder: boolean,
    sort: ListSort,
    dir: SortDirection | undefined,
    mask: { masker: Masker; page: ResolvedHandle },
  ): Promise<void> {
    const key = (stackId: string, rank: unknown) =>
      ranked ? `${stackId}:${String(rank)}` : stackId;
    const onPage = new Map<string, number>();
    for (const r of rows)
      if (r.stackId)
        onPage.set(
          key(r.stackId, r.rank),
          (onPage.get(key(r.stackId, r.rank)) ?? 0) + 1,
        );
    const first = new Map<string, number>();
    rows.forEach((r, i) => {
      if (!r.stackId) return;
      const k = key(r.stackId, r.rank);
      const size = Number(r.stackSize);
      if (
        size >= 2 &&
        !first.has(k) &&
        (onPage.get(k) ?? 0) < Math.min(4, size)
      )
        first.set(k, i);
    });
    if (!first.size) return;
    const ids = [...new Set([...first.keys()].map((k) => k.split(':')[0]!))];
    const peeked = await this.prisma.$queryRaw<
      (CollectionRow & { rank: number })[]
    >(Prisma.sql`
      SELECT x.* FROM (
        SELECT ${ROW_COLUMNS}, 0::bigint AS "stackSize", (${RANK}) AS rank,
               row_number() OVER (PARTITION BY va."stackId"${ranked ? Prisma.sql`, (${RANK})` : Prisma.empty}
                 ORDER BY COALESCE(v.id = s."coverVideoId", false) DESC, ${orderBy(sort, dir)}) AS r
        FROM "VideoAccess" va
          JOIN "Video" v ON v.id = va."videoId"
          JOIN "User" a ON a.id = v."authorId"
          LEFT JOIN "VideoStack" s ON s.id = va."stackId"
        WHERE ${filters} AND va."stackId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ) x WHERE x.r <= 4 ORDER BY x.r`);
    const cards = new Map<string, VideoCardDto[]>();
    for (const r of peeked) {
      const k = key(r.stackId!, r.rank);
      if (!first.has(k)) continue;
      cards.set(k, [
        ...(cards.get(k) ?? []),
        this.toItem(r, holder, mask.masker, mask.page).video,
      ]);
    }
    for (const [k, i] of first) {
      const stack = items[i]?.stack;
      const peek = cards.get(k);
      if (stack && peek?.length) stack.peek = peek;
    }
  }

  /**
   * How the listing divides: by month added when it is newest first, by first letter when
   * by title — with how many videos each holds, for the month headers and the quick scroller.
   * Nothing for any other order or a search (relevance first). Months in the viewer's time zone.
   */
  async buckets(
    viewer: RequestUser | undefined,
    username: string,
    query: CollectionBucketsQueryDto,
  ): Promise<CollectionBucketsDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner } = page;
    const ownerView = isOwnerView(v, page);
    const sort = query.sort ?? owner.pageSettings.sort;
    // Months for the newest first, letters for A to Z; any other order has no such cuts.
    const months = sort === 'added' && query.dir !== 'asc';
    const letters = sort === 'title' && query.dir !== 'desc';
    if (query.q?.trim() || !(months || letters))
      return { by: null, buckets: [] };
    const { filters } = listFilters(v, owner.id, ownerView, query, page);
    const tz = timeZone(query.tz);
    const rows =
      sort === 'title'
        ? await this.prisma.$queryRaw<
            { key: string; count: bigint }[]
          >(Prisma.sql`
            SELECT b.key, COUNT(*)::bigint AS count FROM (
              SELECT CASE WHEN upper(left(${SORT_TITLE}, 1)) ~ '^[[:alpha:]]$'
                          THEN upper(left(${SORT_TITLE}, 1)) ELSE '#' END AS key
              FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId" WHERE ${filters}) b
            GROUP BY b.key ORDER BY (b.key = '#') DESC, lower(b.key) ASC`)
        : await this.prisma.$queryRaw<
            { key: string; count: bigint }[]
          >(Prisma.sql`
            SELECT to_char(date_trunc('month', va."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM') AS key,
                   COUNT(*)::bigint AS count
            FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId" WHERE ${filters}
            GROUP BY 1 ORDER BY 1 DESC`);
    return {
      by: sort === 'title' ? 'letter' : 'month',
      buckets: rows.map((r) => ({ key: r.key, count: Number(r.count) })),
    };
  }

  private async inboxCount(ownerId: string): Promise<number> {
    return this.prisma.videoAccess.count({
      where: {
        holderId: ownerId,
        inbox: true,
        categoryId: null,
        stackId: null,
        hidden: false,
        video: { deletedAt: null },
      },
    });
  }

  /** Folder and category counts for the sidebar (owner) or the filter chips (visitors). */
  async summary(
    viewer: RequestUser | undefined,
    username: string,
  ): Promise<CollectionSummaryDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner } = page;
    const ownerView = isOwnerView(v, page);
    const [rows, stacks, categories, trash] = await Promise.all([
      this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        SELECT (va.source = 'AUTHOR'::"AccessSource") AS authored,
               (v.visibility = 'PUBLIC'::"Visibility") AS "isPublic",
               va.hidden, va."categoryId", COUNT(*)::bigint AS count
        FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
        WHERE va."holderId" = ${owner.id}::uuid AND ${alive()} ${ownerView ? Prisma.empty : VISITOR_FILTER}
        GROUP BY 1, 2, 3, 4`),
      // Tiles of "All" are fewer than its videos by what the stacks fold; a visitor's
      // sections split a stack, so for them a stack counts once per section it shows in.
      this.prisma.$queryRaw<{ stacked: bigint; stacks: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE va."stackId" IS NOT NULL)::bigint AS stacked,
               COUNT(DISTINCT ${ownerView ? Prisma.sql`va."stackId"` : Prisma.sql`(va."stackId", (${RANK}))`}) FILTER (WHERE va."stackId" IS NOT NULL)::bigint AS stacks
        FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
        WHERE va."holderId" = ${owner.id}::uuid AND ${alive()} AND va.hidden = false ${ownerView ? Prisma.empty : VISITOR_FILTER}`),
      this.prisma.category.findMany({
        where: { ownerId: owner.id, ...(ownerView ? {} : { hidden: false }) },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      ownerView
        ? this.prisma.video.count({
            where: { authorId: owner.id, ...IN_USER_TRASH },
          })
        : 0,
    ]);
    const summary: CollectionSummaryDto = {
      all: 0,
      public: 0,
      private: 0,
      others: 0,
      hidden: 0,
      uncategorized: 0,
      inbox: ownerView ? await this.inboxCount(owner.id) : 0,
      stacked: Number(stacks[0]?.stacked ?? 0),
      stacks: Number(stacks[0]?.stacks ?? 0),
      trash,
      categories: [],
      // A signed-in visitor's visit is written down; the line of "new" is the visit before.
      newSince:
        v && !ownerView
          ? ((await this.visit(v.id, owner.id))?.toISOString() ?? null)
          : null,
      newCount: 0,
    };
    // How many of those there are, for "N new since your last visit".
    if (summary.newSince) {
      const fresh = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
        WHERE va."holderId" = ${owner.id}::uuid AND ${alive()} ${VISITOR_FILTER}
          AND va."createdAt" > ${new Date(summary.newSince)}`);
      summary.newCount = Number(fresh[0]?.count ?? 0);
    }
    const perCategory = new Map<string, number>();
    for (const r of rows) {
      const n = Number(r.count);
      if (r.hidden) {
        summary.hidden += n;
        continue; // hidden holdings live only in the "Hidden" folder
      }
      summary.all += n;
      if (!r.authored) summary.others += n;
      else if (r.isPublic) summary.public += n;
      else summary.private += n;
      if (r.categoryId)
        perCategory.set(r.categoryId, (perCategory.get(r.categoryId) ?? 0) + n);
      else summary.uncategorized += n;
    }
    summary.categories = categories.map<CategoryDto>((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      hidden: c.hidden,
      count: perCategory.get(c.id) ?? 0,
      coverVideoId: ownerView ? c.coverVideoId : null,
      // How it shows in "All videos" by category: visitors need it to draw it.
      previewRows: c.previewRows,
      tileScale: c.tileScale as TileScale | null,
    }));
    return summary;
  }

  /**
   * The owner's "Featured" strip, as the viewer may see it: the pinned videos on their own,
   * and of each pinned stack up to four videos, its cover first, with the stack's size. A stack the
   * viewer sees one video of is just that video.
   */
  async featured(
    viewer: RequestUser | undefined,
    username: string,
  ): Promise<FeaturedDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner } = page;
    const ownerView = isOwnerView(v, page);
    const scope = Prisma.sql`va."holderId" = ${owner.id}::uuid AND ${alive()} ${scopeFilter(ownerView)}`;
    const from = Prisma.sql`FROM "VideoAccess" va
      JOIN "Video" v ON v.id = va."videoId"
      JOIN "User" a ON a.id = v."authorId"
      LEFT JOIN "VideoStack" s ON s.id = va."stackId"`;
    const [videos, stacked] = await Promise.all([
      this.prisma.$queryRaw<(CollectionRow & { pin: number })[]>(Prisma.sql`
        SELECT ${ROW_COLUMNS}, 0::bigint AS "stackSize", va.pinned AS pin
        ${from} WHERE ${scope} AND va.pinned IS NOT NULL`),
      this.prisma.$queryRaw<(CollectionRow & { pin: number })[]>(Prisma.sql`
        SELECT x.* FROM (
          SELECT ${ROW_COLUMNS}, s.pinned AS pin,
                 COUNT(*) OVER (PARTITION BY va."stackId") AS "stackSize",
                 row_number() OVER (PARTITION BY va."stackId"
                   ORDER BY COALESCE(v.id = s."coverVideoId", false) DESC, va."createdAt" DESC, va.id DESC) AS r
          ${from} WHERE ${scope} AND s.pinned IS NOT NULL
        ) x WHERE x.r <= 4 ORDER BY x.r`),
    ]);
    const holder = v?.id === owner.id && !page.link;
    const masker = this.masker(v, page);
    const tiles: { pin: number; key: string; items: CollectionItemDto[] }[] =
      videos.map((r) => ({
        pin: r.pin,
        key: `video:${r.id}`,
        items: [
          Object.assign(this.toItem(r, holder, masker, page), { stack: null }),
        ],
      }));
    const stacks = new Map<string, (typeof tiles)[number]>();
    for (const r of stacked) {
      const one = Number(r.stackSize) < 2;
      const item = this.toItem(r, holder, masker, page);
      const tile = stacks.get(r.stackId!);
      if (tile) tile.items.push(item);
      else
        stacks.set(r.stackId!, {
          pin: r.pin,
          key: one ? `video:${r.id}` : `stack:${r.stackId}`,
          items: [one ? Object.assign(item, { stack: null }) : item],
        });
    }
    const all = [...tiles, ...stacks.values()].sort((x, y) => x.pin - y.pin);
    await masker.apply();
    return {
      items: all.flatMap((t) => t.items),
      order: all.map((t) => t.key),
    };
  }

  /**
   * The categories as cards, as the viewer may see them: how many videos, their length
   * together, and the chosen cover or the latest four pictures. Empty ones are left out, and for a
   * visitor the hidden ones.
   */
  async folders(
    viewer: RequestUser | undefined,
    username: string,
  ): Promise<ShelfFoldersDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner } = page;
    const ownerView = isOwnerView(v, page);
    const scope = Prisma.sql`va."holderId" = ${owner.id}::uuid AND ${alive()} ${scopeFilter(ownerView)} AND va."categoryId" IS NOT NULL`;
    const [stats, pictures, categories] = await Promise.all([
      this.prisma.$queryRaw<{ cid: string; n: bigint; dur: number }[]>(
        Prisma.sql`
          SELECT va."categoryId" AS cid, COUNT(*)::bigint AS n, COALESCE(SUM(v."durationSec"), 0)::float AS dur
          FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
          WHERE ${scope} GROUP BY 1`,
      ),
      this.prisma.$queryRaw<
        {
          cid: string;
          id: string;
          thumbnailKey: string;
          thumbnailSmallKey: string | null;
          sensitive: boolean;
          authorId: string;
          chosen: boolean;
        }[]
      >(Prisma.sql`
        SELECT x.* FROM (
          SELECT va."categoryId" AS cid, v.id, v."thumbnailKey", v."thumbnailSmallKey", v.sensitive, v."authorId",
                 COALESCE(v.id = c."coverVideoId", false) AS chosen,
                 row_number() OVER (PARTITION BY va."categoryId"
                   ORDER BY COALESCE(v.id = c."coverVideoId", false) DESC, va."createdAt" DESC, va.id DESC) AS r
          FROM "VideoAccess" va
            JOIN "Video" v ON v.id = va."videoId"
            JOIN "Category" c ON c.id = va."categoryId"
          WHERE ${scope} AND v."thumbnailKey" IS NOT NULL
        ) x WHERE x.r <= 4 ORDER BY x.r`),
      this.prisma.category.findMany({
        where: { ownerId: owner.id, ...(ownerView ? {} : { hidden: false }) },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const byCategory = new Map(stats.map((s) => [s.cid, s]));
    return {
      folders: categories
        .filter((c) => Number(byCategory.get(c.id)?.n ?? 0) > 0)
        .map((c) => {
          const own = pictures.filter((p) => p.cid === c.id);
          // The chosen cover alone; else the latest four.
          const shown = own[0]?.chosen ? own.slice(0, 1) : own;
          return {
            id: c.id,
            name: c.name,
            hidden: c.hidden,
            count: Number(byCategory.get(c.id)!.n),
            durationSec: Math.round(byCategory.get(c.id)!.dur),
            pictures: shown.map((p) => ({
              videoId: p.id,
              url: this.storage.publicUrl(
                p.thumbnailSmallKey ?? p.thumbnailKey,
              ),
              sensitive: p.sensitive,
              authorId: p.authorId,
            })),
            coverVideoId: ownerView ? c.coverVideoId : null,
          };
        }),
    };
  }

  /**
   * Records a look at `ownerId`'s shelf and returns where "new" starts for it: the end of the visit
   * before the current one. A visit goes on while the shelf is opened again within VISIT_GAP_MS
   * (a reload, back from a video), so its line stays put; a first visit has none.
   */
  private async visit(
    visitorId: string,
    ownerId: string,
  ): Promise<Date | null> {
    const now = new Date();
    const key = { visitorId_ownerId: { visitorId, ownerId } };
    const last = await this.prisma.shelfVisit.findUnique({ where: key });
    const newSince = !last
      ? null
      : now.getTime() - last.lastSeenAt.getTime() > VISIT_GAP_MS
        ? last.lastSeenAt
        : last.newSince;
    await this.prisma.shelfVisit.upsert({
      where: key,
      create: { visitorId, ownerId, lastSeenAt: now, newSince: null },
      update: { lastSeenAt: now, newSince },
    });
    return newSince;
  }

  async videoPage(
    viewer: RequestUser | undefined,
    username: string,
    videoId: string,
  ): Promise<VideoPageDto> {
    const v = toViewer(viewer);
    const page = await this.pageOwner(username, v);
    const { user: owner, link } = page;
    // The holder's own page; through their anonymous link they see it as anyone would.
    const self = v?.id === owner.id && !link;
    const holding = await this.prisma.videoAccess.findUnique({
      where: { videoId_holderId: { videoId, holderId: owner.id } },
      include: {
        category: { select: { id: true, name: true } },
        video: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                status: true,
                pageHidden: true,
              },
            },
            frames: { orderBy: { index: 'asc' } },
          },
        },
      },
    });
    if (!holding) throw videoNotFound();
    const video = holding.video;
    const pageHolding: PolicyHolding = {
      holderId: holding.holderId,
      source: holding.source,
      hidden: holding.hidden,
    };
    if (!holdingVisibleTo(v, video, pageHolding)) throw videoNotFound();
    // The holder opens what they received: it is not new any more.
    if (self && holding.unseen)
      await this.prisma.videoAccess.updateMany({
        where: { id: holding.id, unseen: true },
        data: { unseen: false },
      });

    const viewerHolding: PolicyHolding | null = !v
      ? null
      : v.id === owner.id
        ? pageHolding
        : await this.prisma.videoAccess.findUnique({
            where: { videoId_holderId: { videoId, holderId: v.id } },
            select: { holderId: true, source: true, hidden: true },
          });
    const videoCount = await this.prisma.video.count({
      where: { authorId: video.authorId, deletedAt: null },
    });

    const blocker = requestBlocker(v, video, pageHolding, viewerHolding);
    const request =
      v && !blocker
        ? await this.exchange.requestState(v.id, owner.id, video.id)
        : null;

    // Opened in this holder's shelf: their name and description for it, the author's kept aside.
    const own =
      holding.customTitle !== null || holding.customDescription !== null;
    const masker = this.masker(v, page);
    const authorLink =
      link && video.authorId === link.ownerId
        ? link.id
        : holding.anonymousLinkId;
    const dto: VideoPageDto = {
      video: Object.assign(
        videoCard(
          this.storage,
          { ...video, title: holding.customTitle ?? video.title },
          video.author,
        ),
        {
          description: holding.customDescription ?? video.description,
          posterUrl: video.thumbnailKey
            ? this.storage.publicUrl(video.thumbnailKey)
            : null,
          frames: video.frames.map((f) => ({
            index: f.index,
            timestampSec: f.timestampSec,
            url: this.storage.publicUrl(frameKey(video, f.index)),
          })),
        },
      ),
      holder: {
        id: owner.id,
        username: owner.username,
        displayName: owner.displayName,
        exchangeWants: owner.exchangeWants,
        exchangeAvoid: owner.exchangeAvoid,
      },
      holding: {
        source: holding.source,
        hidden: holding.hidden,
        categoryId: holding.categoryId,
        category: holding.category,
        customTitle: holding.customTitle,
        customDescription: holding.customDescription,
      },
      original: own
        ? { title: video.title, description: video.description }
        : null,
      author: {
        id: video.author.id,
        username: video.author.username,
        displayName: video.author.displayName,
        guest: video.author.status === 'GUEST',
        videoCount,
        pageVisible: pageVisible(video.author, v),
      },
      // Where it was saved from is the author's own note: never shown to anyone else.
      sourceUrl: v && v.id === video.authorId ? video.sourceUrl : null,
      viewer: {
        canEdit: canEditVideo(v, video, this.plans.hasTiers),
        canView: canView(v, video, viewerHolding),
        canStream: canStream(v, video, viewerHolding),
        canDownload: canDownload(v, video, viewerHolding),
        canAddToCollection: canAddToCollection(v, video, viewerHolding),
        canManage: canManage(v, video),
        canHide: self && canHide(v, pageHolding),
        inCollection: !!viewerHolding,
        canSendLink: !!v && linkCarries(video, viewerHolding),
        isHolder: self,
        // What a guest could ask for, as anyone else could, if the holder takes guests.
        guestExchange:
          !v &&
          owner.acceptGuestExchanges &&
          requestBlocker(GUEST_ASKER, video, pageHolding, null) === null,
        requestBlocker: blocker,
        request,
      },
    };
    masker.card(dto.video, {
      holding: holding.anonymousLinkId,
      context: link?.id,
    });
    masker.user(dto.holder, link?.id);
    masker.user(dto.author, authorLink);
    await masker.apply();
    return dto;
  }

  /** A page by username, or by an anonymous link's handle (`~<code>`). */
  private pageOwner(username: string, v: Viewer): Promise<ResolvedHandle> {
    return this.users.pageOwner(username, v);
  }

  /**
   * What masks the answers about this page. Seen through the owner's anonymous link it is
   * masked for everyone, the owner too: that is how the link shows it.
   */
  private masker(v: Viewer, page: ResolvedHandle): Masker {
    return this.anonymous.masker(page.link ? null : v);
  }

  /** `holderView`: the holder's own listing, the only one that says what is new to them. */
  private toItem(
    r: CollectionRow,
    holderView: boolean,
    masker: Masker,
    page: ResolvedHandle,
  ): CollectionItemDto {
    const card = masker.card(
      videoCard(
        this.storage,
        { ...r, title: r.customTitle ?? r.title },
        {
          id: r.authorId,
          username: r.authorUsername,
          displayName: r.authorDisplayName,
        },
      ),
      { holding: r.holdingLink, context: page.link?.id },
    );
    return {
      section:
        r.source === 'AUTHOR'
          ? r.visibility === 'PUBLIC'
            ? 'PUBLIC'
            : 'PRIVATE'
          : 'OTHERS',
      // On this holder's shelf the video goes by their name for it, if any.
      video: card,
      originalTitle: r.customTitle ? r.title : null,
      source: r.source,
      hidden: r.hidden,
      unseen: holderView && r.unseen,
      categoryId: r.categoryId,
      stack: r.stackId
        ? {
            id: r.stackId,
            name: r.stackName,
            coverVideoId: r.stackCoverVideoId,
            size: Number(r.stackSize),
          }
        : null,
      position: r.position,
      addedAt: r.addedAt.toISOString(),
    };
  }
}

/** A listing row's columns (aliases `va` = holding, `v` = video, `a` = its author, `s` = stack). */
const ROW_COLUMNS = Prisma.sql`va.source, va.hidden, va.unseen, va."customTitle", va."categoryId", va.position, va."createdAt" AS "addedAt",
  va."stackId", s.name AS "stackName", s."coverVideoId" AS "stackCoverVideoId",
  v.id, v.code, v.title, v.visibility, v.status, v.stage, v.progress, v."failReason",
  v."durationSec", v.width, v.height, v."sizeBytes", v."thumbnailKey", v."thumbnailSmallKey",
  v."contactSheetKey", v."assetPrefix", v."smallFrames", v.sensitive, v."createdAt", v."authorId",
  a.username AS "authorUsername", a."displayName" AS "authorDisplayName", va."anonymousLinkId" AS "holdingLink"`;

/** The title the shelf sorts by: the holder's own name where they gave one. */
const SORT_TITLE = Prisma.sql`lower(COALESCE(va."customTitle", v.title))`;

/** Section rank: public own → private own → from others. */
const RANK = Prisma.sql`CASE WHEN va.source = 'AUTHOR'::"AccessSource" AND v.visibility = 'PUBLIC'::"Visibility" THEN 0 WHEN va.source = 'AUTHOR'::"AccessSource" THEN 1 ELSE 2 END`;

/** Videos on the shelf: the live ones. */
function alive() {
  return Prisma.sql`v."deletedAt" IS NULL`;
}

/** Visitors see finished, unhidden videos; bookmarks only while the video stays public. */
const VISITOR_FILTER = Prisma.sql`AND v.status = 'READY'::"VideoStatus" AND va.hidden = false AND (va.source <> 'PUBLIC_ADD'::"AccessSource" OR v.visibility = 'PUBLIC'::"Visibility")`;

/** Owners see everything, but hidden holdings only inside the "Hidden" folder. */
function scopeFilter(ownerView: boolean, section?: CollectionFilter) {
  if (!ownerView) return VISITOR_FILTER;
  return Prisma.sql`AND va.hidden = ${section === 'HIDDEN'}`;
}

function sectionFilter(section?: CollectionFilter) {
  if (!section) return Prisma.empty;
  // Visitors never see hidden holdings (scopeFilter); for them the folder is simply empty.
  if (section === 'HIDDEN') return Prisma.sql`AND va.hidden = true`;
  // The owner's own: a visitor's request for it finds nothing.
  if (section === 'INBOX')
    return Prisma.sql`AND va.inbox = true AND va."categoryId" IS NULL AND va."stackId" IS NULL`;
  const rank = section === 'PUBLIC' ? 0 : section === 'PRIVATE' ? 1 : 2;
  return Prisma.sql`AND (${RANK}) = ${rank}`;
}

function stackFilter(stackId?: string) {
  if (!stackId) return Prisma.empty;
  return Prisma.sql`AND va."stackId" = ${stackId}::uuid`;
}

/** Near misses only from this many letters on: a short word is "similar" to too much. */
const FUZZY_FROM = 4;
/** How close a title or name must come (pg_trgm's word similarity, 0–1) to count as a typo. */
const FUZZY_MIN = 0.45;

/**
 * What a search on the shelf finds: the text in the title (the holder's own or the
 * author's), the description, the category's and the stack's name, the author's name or nickname —
 * case aside, LIKE's own characters matching themselves — and, from four letters on, titles and
 * names that come close (a typo). A visitor's search never reaches a category hidden from them.
 * `rank`: 0 in the title, 1 elsewhere, 2 a near miss; `similarity` orders the near misses.
 */
function search(
  q: string | undefined,
  ownerView: boolean,
  ownerId: string,
  masked: boolean,
): { match: Prisma.Sql; rank: Prisma.Sql; similarity: Prisma.Sql } | null {
  const text = q?.trim();
  if (!text) return null;
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const title = Prisma.sql`COALESCE(va."customTitle", v.title)`;
  const visibleCategory = ownerView
    ? Prisma.empty
    : Prisma.sql`AND sc.hidden = false`;
  // The categories, stacks and people a search names are found once, as lists of ids, and each
  // holding is checked against them: a lookup per holding took 0.6 s of a search on a shelf of
  // tens of thousands.
  const categories = (cond: Prisma.Sql) =>
    Prisma.sql`va."categoryId" = ANY (ARRAY(SELECT sc.id FROM "Category" sc WHERE sc."ownerId" = ${ownerId}::uuid ${visibleCategory} AND ${cond}))`;
  const stacks = (cond: Prisma.Sql) =>
    Prisma.sql`va."stackId" = ANY (ARRAY(SELECT sst.id FROM "VideoStack" sst WHERE sst."ownerId" = ${ownerId}::uuid AND ${cond}))`;
  const inTitle = Prisma.sql`(v.title ILIKE ${pattern} OR va."customTitle" ILIKE ${pattern})`;
  // An author who goes by an anonymous link here is never found by their nickname or name:
  // the search would tell whose videos they are.
  const byAuthor = masked
    ? Prisma.sql`(va."anonymousLinkId" IS NULL AND v."authorId" <> ${ownerId}::uuid)`
    : Prisma.sql`va."anonymousLinkId" IS NULL`;
  const elsewhere = Prisma.sql`(v.description ILIKE ${pattern} OR va."customDescription" ILIKE ${pattern}
    OR ${categories(Prisma.sql`sc.name ILIKE ${pattern}`)}
    OR ${stacks(Prisma.sql`sst.name ILIKE ${pattern}`)}
    OR (${byAuthor} AND v."authorId" = ANY (ARRAY(SELECT sa.id FROM "User" sa WHERE sa.username ILIKE ${pattern} OR sa."displayName" ILIKE ${pattern}))))`;
  if (text.length < FUZZY_FROM)
    return {
      match: Prisma.sql`${inTitle} OR ${elsewhere}`,
      rank: Prisma.sql`(CASE WHEN ${inTitle} THEN 0 ELSE 1 END)`,
      similarity: Prisma.sql`0::float`,
    };
  const similarity = Prisma.sql`word_similarity(${text}, ${title})`;
  const nearMiss = Prisma.sql`(${similarity} >= ${FUZZY_MIN}
    OR ${categories(Prisma.sql`word_similarity(${text}, sc.name) >= ${FUZZY_MIN}`)}
    OR ${stacks(Prisma.sql`word_similarity(${text}, sst.name) >= ${FUZZY_MIN}`)})`;
  return {
    match: Prisma.sql`${inTitle} OR ${elsewhere} OR ${nearMiss}`,
    rank: Prisma.sql`(CASE WHEN ${inTitle} THEN 0 WHEN ${elsewhere} THEN 1 ELSE 2 END)`,
    similarity,
  };
}

/** The holdings a listing shows, as the query narrows them (the page owner's, as the viewer may see). */
function listFilters(
  v: Viewer,
  ownerId: string,
  ownerView: boolean,
  query: Pick<
    CollectionQueryDto,
    'section' | 'categoryId' | 'stackId' | 'q' | 'addedAfter'
  >,
  page: ResolvedHandle,
): { filters: Prisma.Sql; found: ReturnType<typeof search> } {
  const found = search(query.q, ownerView, ownerId, !!page.link);
  if (!ownerView && query.section === 'INBOX')
    return { filters: Prisma.sql`false`, found };
  const after = query.addedAfter
    ? Prisma.sql`AND va."createdAt" > ${new Date(query.addedAfter)}`
    : Prisma.empty;
  const filters = Prisma.sql`va."holderId" = ${ownerId}::uuid AND ${alive()}
      ${scopeFilter(ownerView, query.section)} ${sectionFilter(query.section)} ${categoryFilter(query.categoryId, ownerView)} ${stackFilter(query.stackId)} ${after} ${found ? Prisma.sql`AND (${found.match})` : Prisma.empty}`;
  return { filters, found };
}

/** A time zone the database knows (the viewer's, for month headers); anything else is UTC. */
function timeZone(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    return Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC'
      ? tz
      : 'UTC';
  } catch {
    return 'UTC';
  }
}

function categoryFilter(categoryId: string | undefined, ownerView: boolean) {
  if (!categoryId) return Prisma.empty;
  // For a visitor, a category hidden from them is none (the rest of the shelf).
  if (categoryId === 'none')
    return ownerView
      ? Prisma.sql`AND va."categoryId" IS NULL`
      : Prisma.sql`AND (va."categoryId" IS NULL OR EXISTS (SELECT 1 FROM "Category" hc WHERE hc.id = va."categoryId" AND hc.hidden))`;
  return Prisma.sql`AND va."categoryId" = ${categoryId}::uuid`;
}

function isPageSort(sort: ListSort): sort is CollectionSort {
  return (COLLECTION_SORTS as readonly string[]).includes(sort);
}

/** The owner's own view (or an admin's); never through an anonymous link. */
function isOwnerView(v: Viewer, page: ResolvedHandle): boolean {
  return !page.link && !!v && (v.id === page.user.id || isAdmin(v));
}

function toViewer(user: RequestUser | undefined): Viewer {
  return user ? { id: user.id, role: user.role, tier: user.tier } : null;
}

const videoNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'videoNotFound',
    'errors.videos.notFound',
  );

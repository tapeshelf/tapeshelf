import { Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AccessSource } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { StreamingService } from '../streaming/streaming.service.js';
import { pageSettingsFrom } from '../users/page-settings.js';
import type {
  DuplicateCheckDto,
  DuplicateCheckResultDto,
  DuplicateGroupsDto,
  DuplicateReason,
  DuplicateVideoDto,
  MoveDto,
  UpdateHoldingsDto,
} from './collection.dto.js';
import { applyOrder, moveAround } from './order.js';
import {
  currentOrder,
  lockOrder,
  orderUnder,
  writeOrder,
  writeMove,
} from './positions.js';
import { StacksService } from './stacks.service.js';

/** Shelves up to this size compare every pair of titles for near duplicates. */
const SIMILAR_UP_TO = 2000;
/** How close two titles must be (pg_trgm similarity) with the same length to look the same. */
const SIMILAR_TITLE = 0.6;

/** Owner-side bulk operations on holdings. */
@Injectable()
export class MyCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly stacks: StacksService,
    private readonly streaming: StreamingService,
    private readonly storage: StorageService,
  ) {}

  /** Inbox videos kept as they are, without a category: they leave the Inbox. */
  async inboxDone(user: RequestUser, videoIds: string[]): Promise<number> {
    const r = await this.prisma.videoAccess.updateMany({
      where: { holderId: user.id, videoId: { in: videoIds }, inbox: true },
      data: { inbox: false },
    });
    return r.count;
  }

  /**
   * The "Featured" strip in its new order: `video:<id>` and `stack:<id>` keys of my shelf;
   * what is not mine (any more) is left out, what is not listed is unpinned.
   */
  async setFeatured(user: RequestUser, keys: string[]): Promise<void> {
    const wanted = [...new Set(keys.map((k) => k.toLowerCase()))].map((k) => {
      const cut = k.indexOf(':');
      return { kind: k.slice(0, cut), id: k.slice(cut + 1) };
    });
    const videoIds = wanted.filter((w) => w.kind === 'video').map((w) => w.id);
    const stackIds = wanted.filter((w) => w.kind === 'stack').map((w) => w.id);
    const [held, stacks] = await Promise.all([
      this.prisma.videoAccess.findMany({
        where: {
          holderId: user.id,
          videoId: { in: videoIds },
          video: { deletedAt: null },
        },
        select: { videoId: true },
      }),
      this.prisma.videoStack.findMany({
        where: { ownerId: user.id, id: { in: stackIds } },
        select: { id: true },
      }),
    ]);
    const known = new Set([
      ...held.map((h) => `video:${h.videoId}`),
      ...stacks.map((st) => `stack:${st.id}`),
    ]);
    const order = wanted.filter((w) => known.has(`${w.kind}:${w.id}`));
    await this.prisma.$transaction([
      this.prisma.videoAccess.updateMany({
        where: { holderId: user.id, pinned: { not: null } },
        data: { pinned: null },
      }),
      this.prisma.videoStack.updateMany({
        where: { ownerId: user.id, pinned: { not: null } },
        data: { pinned: null },
      }),
      ...order.map((w, pinned) =>
        w.kind === 'video'
          ? this.prisma.videoAccess.updateMany({
              where: { holderId: user.id, videoId: w.id },
              data: { pinned },
            })
          : this.prisma.videoStack.updateMany({
              where: { ownerId: user.id, id: w.id },
              data: { pinned },
            }),
      ),
    ]);
  }

  /** Where each of my holdings came from: a cleanup renames own videos and names received ones. */
  async sources(
    userId: string,
    videoIds: string[],
  ): Promise<Map<string, AccessSource>> {
    const rows = await this.prisma.videoAccess.findMany({
      where: {
        holderId: userId,
        videoId: { in: videoIds },
        video: { deletedAt: null },
      },
      select: { videoId: true, source: true },
    });
    return new Map(rows.map((r) => [r.videoId, r.source]));
  }

  /**
   * Files about to be uploaded that are on my shelf already: the same size as uploaded, or
   * the same file name. One match per file, the first found.
   */
  async duplicatesCheck(
    user: RequestUser,
    dto: DuplicateCheckDto,
  ): Promise<DuplicateCheckResultDto> {
    if (!dto.files.length) return { matches: [] };
    const sizes = [...new Set(dto.files.map((f) => BigInt(f.size)))];
    const names = [...new Set(dto.files.map((f) => f.name.toLowerCase()))];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        code: string;
        title: string;
        size: bigint | null;
        name: string;
      }[]
    >(Prisma.sql`
      SELECT v.id, v.code, COALESCE(va."customTitle", v.title) AS title,
             v."uploadedSize" AS size, lower(v."originalFilename") AS name
      FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
      WHERE va."holderId" = ${user.id}::uuid AND v."deletedAt" IS NULL
        AND (v."uploadedSize" = ANY(${sizes}::bigint[]) OR lower(v."originalFilename") = ANY(${names}::text[]))`);
    const matches = dto.files.flatMap((f, index) => {
      const hit =
        rows.find((r) => r.size !== null && r.size === BigInt(f.size)) ??
        rows.find((r) => r.name === f.name.toLowerCase());
      return hit
        ? [{ index, videoId: hit.id, code: hit.code, title: hit.title }]
        : [];
    });
    return { matches };
  }

  /**
   * Videos of my shelf that are likely the same: the same file (fingerprint or size as
   * uploaded), the same file name and length, or — on shelves small enough to compare every pair —
   * a close title and the same length. Strongest reason first; at most 200 groups of 20.
   */
  async duplicateGroups(user: RequestUser): Promise<DuplicateGroupsDto> {
    const mine = Prisma.sql`
      SELECT va."videoId" AS id, v."originalSha256" AS sha, v."uploadedSize" AS size,
             lower(v."originalFilename") AS fname, v."durationSec" AS dur,
             COALESCE(va."customTitle", v.title) AS title
      FROM "VideoAccess" va JOIN "Video" v ON v.id = va."videoId"
      WHERE va."holderId" = ${user.id}::uuid AND v."deletedAt" IS NULL`;
    const [byKey, count] = await Promise.all([
      this.prisma.$queryRaw<
        { reason: DuplicateReason; ids: string[] }[]
      >(Prisma.sql`
        WITH mine AS (${mine})
        SELECT 'file' AS reason, array_agg(id) AS ids FROM mine WHERE sha IS NOT NULL GROUP BY sha HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'file', array_agg(id) FROM mine WHERE size IS NOT NULL GROUP BY size HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'name', array_agg(id) FROM mine WHERE dur IS NOT NULL GROUP BY fname, round(dur) HAVING COUNT(*) > 1`),
      this.prisma.videoAccess.count({
        where: { holderId: user.id, video: { deletedAt: null } },
      }),
    ]);
    const similar =
      count <= SIMILAR_UP_TO
        ? await this.prisma.$queryRaw<{ a: string; b: string }[]>(Prisma.sql`
            WITH mine AS (${mine})
            SELECT x.id AS a, y.id AS b FROM mine x JOIN mine y
              ON x.id < y.id AND x.dur IS NOT NULL AND y.dur IS NOT NULL
             AND abs(x.dur - y.dur) <= 1 AND similarity(x.title, y.title) >= ${SIMILAR_TITLE}`)
        : [];
    // Pairs and groups joined into sets (union–find), each with its strongest reason.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    const reasonOf = new Map<string, DuplicateReason>();
    const rank: Record<DuplicateReason, number> = {
      file: 0,
      name: 1,
      similar: 2,
    };
    const join = (ids: string[], reason: DuplicateReason) => {
      for (const id of ids) if (!parent.has(id)) parent.set(id, id);
      const root = find(ids[0]!);
      for (const id of ids.slice(1)) parent.set(find(id), root);
      const prev = reasonOf.get(root);
      if (!prev || rank[reason] < rank[prev]) reasonOf.set(root, reason);
    };
    for (const g of byKey) join(g.ids, g.reason);
    for (const p of similar) join([p.a, p.b], 'similar');
    const sets = new Map<string, string[]>();
    for (const id of parent.keys()) {
      const root = find(id);
      sets.set(root, [...(sets.get(root) ?? []), id]);
    }
    // Reasons of merged sets: the strongest of their members' roots.
    const groups = [...sets.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([, ids]) => {
        let reason: DuplicateReason = 'similar';
        for (const id of ids) {
          const r = reasonOf.get(id);
          if (r && rank[r] < rank[reason]) reason = r;
        }
        return { reason, ids: ids.slice(0, 20) };
      })
      .sort(
        (x, y) =>
          rank[x.reason] - rank[y.reason] || y.ids.length - x.ids.length,
      )
      .slice(0, 200);
    const videos = await this.prisma.videoAccess.findMany({
      where: {
        holderId: user.id,
        videoId: { in: groups.flatMap((g) => g.ids) },
      },
      include: { video: true },
    });
    const byId = new Map(videos.map((h) => [h.videoId, h]));
    return {
      groups: groups.map((g) => ({
        reason: g.reason,
        videos: g.ids
          .map((id) => byId.get(id))
          .filter((h): h is NonNullable<typeof h> => !!h)
          .map((h): DuplicateVideoDto => ({
            id: h.videoId,
            code: h.video.code,
            title: h.customTitle ?? h.video.title,
            thumbnailUrl: h.video.thumbnailKey
              ? this.storage.publicUrl(
                  h.video.thumbnailSmallKey ?? h.video.thumbnailKey,
                )
              : null,
            durationSec: h.video.durationSec,
            sizeBytes: Number(h.video.sizeBytes),
            width: h.video.width,
            height: h.video.height,
            addedAt: h.createdAt.toISOString(),
            source: h.source,
            sensitive: h.video.sensitive,
          })),
      })),
    };
  }

  /**
   * Received videos taken off my shelf: only my copy goes, the video stays with its
   * author and everyone else who holds it. Never the author's own holding — that is deleting the
   * video. Nothing is sent to anyone; an open request built on the copy resets at its next
   * step, as for any lost video. Returns how many copies went.
   */
  async removeReceived(
    user: RequestUser,
    videoIds: readonly string[],
  ): Promise<number> {
    const gone = await this.prisma.$transaction(async (tx) => {
      const held = await tx.videoAccess.findMany({
        where: {
          holderId: user.id,
          videoId: { in: [...videoIds] },
          source: { not: 'AUTHOR' },
        },
        select: { id: true, videoId: true, stackId: true },
      });
      if (held.length === 0) return [];
      await tx.videoAccess.deleteMany({
        where: { id: { in: held.map((h) => h.id) } },
      });
      await this.stacks.afterLeaving(
        tx,
        held.flatMap((h) => (h.stackId ? [h.stackId] : [])),
      );
      return held.map((h) => h.videoId);
    });
    // The cached streaming decision would keep the copy playing for up to a minute.
    await Promise.all(
      gone.map((id) => this.streaming.forgetDecision(id, user.id)),
    );
    return gone.length;
  }

  /** Category and hidden for any of my holdings (own videos too). Returns how many holdings matched. */
  async updateHoldings(
    user: RequestUser,
    dto: UpdateHoldingsDto,
  ): Promise<number> {
    if (dto.categoryId)
      await this.categories.assertOwn(user.id, dto.categoryId);
    const base = {
      holderId: user.id,
      videoId: { in: dto.videoIds },
      video: { deletedAt: null },
    };
    let updated = 0;
    if (dto.categoryId !== undefined) {
      // A video changing category on its own leaves its stack; a whole stack moves together.
      const r = await this.prisma.$transaction(async (tx) => {
        await this.stacks.beforeCategoryChange(tx, user.id, dto.videoIds);
        // Put somewhere, even under "no category": sorted, out of the Inbox.
        return tx.videoAccess.updateMany({
          where: base,
          data: { categoryId: dto.categoryId, inbox: false },
        });
      });
      updated = Math.max(updated, r.count);
    }
    if (dto.hidden !== undefined) {
      const r = await this.prisma.videoAccess.updateMany({
        where: base,
        data: { hidden: dto.hidden },
      });
      updated = Math.max(updated, r.count);
    }
    return updated;
  }

  /** Manual order: the given videos take over their current slots in the new order. */
  async order(user: RequestUser, videoIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, user.id);
      const holdings = await currentOrder(tx, user.id);
      await writeOrder(
        tx,
        user.id,
        applyOrder(
          holdings.map((h) => h.videoId),
          videoIds,
        ),
      );
    }, ORDER_TX);
  }

  /** A drag (MoveDto): the move is made on the whole shelf, under the order lock. */
  async move(user: RequestUser, dto: MoveDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, user.id);
      const adopt = dto.adopt && dto.adopt !== 'manual' ? dto.adopt : null;
      const holdings = await orderUnder(
        tx,
        user.id,
        adopt ?? 'manual',
        dto.adoptDir,
      );
      const stacks = new Set(dto.stackIds ?? []);
      const moved = new Set(dto.videoIds);
      for (const h of holdings)
        if (h.stackId && stacks.has(h.stackId)) moved.add(h.videoId);
      const order = holdings.map((h) => h.videoId);
      const next = moveAround(order, moved, dto.anchorId, dto.side === 'after');
      if (adopt) await writeOrder(tx, user.id, next);
      else if (next !== order)
        await writeMove(tx, user.id, holdings, next, moved);
      if (adopt) {
        const me = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { pageSettings: true },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            pageSettings: {
              ...pageSettingsFrom(me.pageSettings),
              sort: 'manual',
            },
          },
        });
      }
    }, ORDER_TX);
  }
}

/**
 * A shelf's order is written in one transaction: on a very large shelf the first drag numbers
 * all of it (tens of thousands of rows), which on a busy machine outlasts Prisma's default five
 * seconds and came back as 503 (P2028). The budget of the account's other long transactions.
 */
const ORDER_TX = { timeout: 120_000, maxWait: 10_000 };

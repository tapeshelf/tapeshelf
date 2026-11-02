import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { clip } from '../../common/validation/text.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import type {
  CreateStackDto,
  StackDto,
  StackRemoveDto,
  StackRemoveResultDto,
  StackVideosDto,
  UpdateStackDto,
} from './collection.dto.js';
import { type Db, currentOrder, lockOrder, writeOrder } from './positions.js';
import { gather, stackCategory } from './stacks.js';

interface Holding {
  videoId: string;
  categoryId: string | null;
  stackId: string | null;
}

/**
 * Stacks: several of the holder's videos folded into one tile. A stack keeps one
 * category for all its videos; a video that changes category on its own leaves its stack; a stack
 * left with fewer than two videos is dissolved. Its place in the manual order is its first video's,
 * so after every change the videos of a stack are gathered into one block of positions.
 */
@Injectable()
export class StacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  /**
   * A new stack of these videos, in this order, where the first of them sits. When one of them is
   * already in a stack, the others join that stack instead (the first such stack in the list).
   */
  async create(user: RequestUser, dto: CreateStackDto): Promise<StackDto> {
    const ids = unique(dto.videoIds);
    if (ids.length < 2) throw tooSmall();
    const given = await this.holdings(this.prisma, user.id, ids);
    const existing = given.find((h) => h.stackId)?.stackId;
    if (existing) return this.add(user, existing, dto);
    const categoryId = await this.resolveCategory(user.id, given, dto);
    return this.prisma.$transaction(async (tx) => {
      const stack = await tx.videoStack.create({
        data: { ownerId: user.id, name: cleanName(dto.name) },
      });
      await this.join(tx, user.id, stack.id, given, dto.categoryId, [ids[0]!]);
      return this.toDto(tx, user.id, stack.id, categoryId);
    });
  }

  /**
   * The owner's stacks with their category and size: "Move to" offers them under their
   * category. Only live stacks (two videos or more); by name, the unnamed last.
   */
  async list(user: RequestUser): Promise<StackDto[]> {
    const stacks = await this.prisma.videoStack.findMany({
      where: { ownerId: user.id },
      select: {
        id: true,
        name: true,
        coverVideoId: true,
        holdings: {
          where: { holderId: user.id, video: { deletedAt: null } },
          select: { categoryId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return stacks
      .filter((s) => s.holdings.length >= 2)
      .map((s) => ({
        id: s.id,
        name: s.name,
        coverVideoId: s.coverVideoId,
        size: s.holdings.length,
        categoryId: s.holdings[0]!.categoryId,
      }))
      .sort((a, b) =>
        a.name === null
          ? b.name === null
            ? 0
            : 1
          : b.name === null
            ? -1
            : a.name.localeCompare(b.name),
      );
  }

  /** Puts videos into an existing stack, behind the videos already there. */
  async add(
    user: RequestUser,
    stackId: string,
    dto: StackVideosDto,
  ): Promise<StackDto> {
    await this.own(user.id, stackId);
    const ids = unique(dto.videoIds);
    const given = await this.holdings(this.prisma, user.id, ids);
    const current = await this.members(this.prisma, stackId);
    const all = [
      ...current,
      ...given.filter((g) => !current.some((m) => m.videoId === g.videoId)),
    ];
    const categoryId = await this.resolveCategory(user.id, all, dto);
    return this.prisma.$transaction(async (tx) => {
      await this.join(
        tx,
        user.id,
        stackId,
        given,
        dto.categoryId,
        current.map((m) => m.videoId),
      );
      return this.toDto(tx, user.id, stackId, categoryId);
    });
  }

  /** Takes videos out of a stack; a stack left with fewer than two videos is dissolved. */
  async remove(
    user: RequestUser,
    stackId: string,
    dto: StackRemoveDto,
  ): Promise<StackRemoveResultDto> {
    await this.own(user.id, stackId);
    return this.prisma.$transaction(async (tx) => {
      await tx.videoAccess.updateMany({
        where: {
          holderId: user.id,
          stackId,
          videoId: { in: unique(dto.videoIds) },
        },
        data: { stackId: null },
      });
      const dissolved = await this.collapse(tx, stackId);
      if (!dissolved) await this.keepCover(tx, stackId);
      return {
        size: dissolved ? 0 : await this.size(tx, stackId),
        dissolved,
      };
    });
  }

  /** Spreads the stack's videos back onto the shelf, in their places. */
  async dissolve(user: RequestUser, stackId: string): Promise<void> {
    await this.own(user.id, stackId);
    await this.prisma.$transaction((tx) => this.drop(tx, stackId));
  }

  /** The stack's name and the video on its cover: one of its own videos, or none. */
  async update(
    user: RequestUser,
    stackId: string,
    dto: UpdateStackDto,
  ): Promise<StackDto> {
    await this.own(user.id, stackId);
    if (dto.coverVideoId) {
      const member = await this.prisma.videoAccess.findFirst({
        where: {
          holderId: user.id,
          stackId,
          videoId: dto.coverVideoId,
          video: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!member)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'videoNotFound',
          'errors.videos.notFound',
        );
    }
    await this.prisma.videoStack.update({
      where: { id: stackId },
      data: {
        name: dto.name === undefined ? undefined : cleanName(dto.name),
        coverVideoId: dto.coverVideoId,
      },
    });
    return this.toDto(this.prisma, user.id, stackId);
  }

  /**
   * Before some of a holder's videos change category: the ones leaving their stack-mates behind
   * leave the stack too (a stack keeps one category); a whole stack moves together.
   */
  async beforeCategoryChange(
    db: Db,
    holderId: string,
    videoIds: readonly string[],
  ): Promise<void> {
    const moving = await db.videoAccess.findMany({
      where: {
        holderId,
        videoId: { in: [...videoIds] },
        stackId: { not: null },
        video: { deletedAt: null },
      },
      select: { videoId: true, stackId: true },
    });
    const byStack = new Map<string, string[]>();
    for (const m of moving) {
      const list = byStack.get(m.stackId!) ?? [];
      list.push(m.videoId);
      byStack.set(m.stackId!, list);
    }
    for (const [stackId, ids] of byStack) {
      if ((await this.size(db, stackId)) <= ids.length) continue;
      await db.videoAccess.updateMany({
        where: { holderId, stackId, videoId: { in: ids } },
        data: { stackId: null },
      });
      if (!(await this.collapse(db, stackId)))
        await this.keepCover(db, stackId);
    }
  }

  /**
   * After videos left the holder's shelf (received copies taken off): each of their
   * stacks keeps a cover it still holds, or goes when fewer than two videos are left in it.
   */
  async afterLeaving(db: Db, stackIds: readonly string[]): Promise<void> {
    for (const stackId of new Set(stackIds))
      if (!(await this.collapse(db, stackId)))
        await this.keepCover(db, stackId);
  }

  /** A cover that left the stack is forgotten: the first video stands in again. */
  private async keepCover(db: Db, stackId: string): Promise<void> {
    const stack = await db.videoStack.findUnique({
      where: { id: stackId },
      select: { coverVideoId: true },
    });
    if (!stack?.coverVideoId) return;
    const still = await db.videoAccess.count({
      where: { stackId, videoId: stack.coverVideoId },
    });
    if (!still)
      await db.videoStack.update({
        where: { id: stackId },
        data: { coverVideoId: null },
      });
  }

  // ---------------------------------------------------------------- internals

  /** Sets the stack on `given`, the category on every member when the user chose one, and gathers the positions. */
  private async join(
    tx: Db,
    holderId: string,
    stackId: string,
    given: Holding[],
    categoryId: string | null | undefined,
    head: string[],
  ): Promise<void> {
    await lockOrder(tx, holderId);
    const left = new Set(
      given
        .map((h) => h.stackId)
        .filter((s): s is string => !!s && s !== stackId),
    );
    const ids = given.map((h) => h.videoId);
    // In a stack, sorted: out of the Inbox.
    await tx.videoAccess.updateMany({
      where: { holderId, videoId: { in: ids } },
      data: { stackId, inbox: false },
    });
    if (categoryId !== undefined)
      await tx.videoAccess.updateMany({
        where: { holderId, stackId },
        data: { categoryId },
      });
    for (const other of left) await this.collapse(tx, other);
    const order = await currentOrder(tx, holderId);
    await writeOrder(
      tx,
      holderId,
      gather(
        order.map((h) => h.videoId),
        head,
        ids.filter((id) => !head.includes(id)),
      ),
    );
  }

  private async resolveCategory(
    ownerId: string,
    members: Holding[],
    dto: { categoryId?: string | null },
  ): Promise<string | null> {
    if (dto.categoryId)
      await this.categories.assertOwn(ownerId, dto.categoryId);
    const result = stackCategory(
      members.map((m) => m.categoryId),
      dto.categoryId,
    );
    if (!result.ok)
      throw new AppException(
        HttpStatus.CONFLICT,
        'stackCategories',
        'errors.videos.stackCategories',
        { details: { categories: result.categories } },
      );
    return result.categoryId;
  }

  /** Fewer than two live videos: the stack goes, its videos stay where they are. */
  private async collapse(db: Db, stackId: string): Promise<boolean> {
    if ((await this.size(db, stackId)) >= 2) return false;
    await this.drop(db, stackId);
    return true;
  }

  private async drop(db: Db, stackId: string): Promise<void> {
    await db.videoAccess.updateMany({
      where: { stackId },
      data: { stackId: null },
    });
    await db.videoStack.deleteMany({ where: { id: stackId } });
  }

  private size(db: Db, stackId: string): Promise<number> {
    return db.videoAccess.count({
      where: { stackId, video: { deletedAt: null } },
    });
  }

  private members(db: Db, stackId: string): Promise<Holding[]> {
    return db.videoAccess.findMany({
      where: { stackId, video: { deletedAt: null } },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { videoId: true, categoryId: true, stackId: true },
    });
  }

  /** The holder's live holdings of exactly these videos, in the order given. */
  private async holdings(
    db: Db,
    holderId: string,
    ids: string[],
  ): Promise<Holding[]> {
    const rows = await db.videoAccess.findMany({
      where: { holderId, videoId: { in: ids }, video: { deletedAt: null } },
      select: { videoId: true, categoryId: true, stackId: true },
    });
    if (rows.length !== ids.length)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'videoNotFound',
        'errors.videos.notFound',
      );
    const byId = new Map(rows.map((r) => [r.videoId, r]));
    return ids.map((id) => byId.get(id)!);
  }

  private async own(ownerId: string, stackId: string): Promise<void> {
    const stack = await this.prisma.videoStack.findFirst({
      where: { id: stackId, ownerId },
      select: { id: true },
    });
    if (!stack)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'stackNotFound',
        'errors.videos.stackNotFound',
      );
  }

  private async toDto(
    db: Db,
    ownerId: string,
    stackId: string,
    categoryId?: string | null,
  ): Promise<StackDto> {
    const stack = await db.videoStack.findFirstOrThrow({
      where: { id: stackId, ownerId },
    });
    const first = (await this.members(db, stackId))[0];
    return {
      id: stack.id,
      name: stack.name,
      coverVideoId: stack.coverVideoId,
      size: await this.size(db, stackId),
      categoryId:
        categoryId === undefined ? (first?.categoryId ?? null) : categoryId,
    };
  }
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Trimmed, at most 60 characters; nothing left means no name. */
function cleanName(name: string | undefined): string | null {
  const clean = name === undefined ? '' : clip(name.trim(), 60);
  return clean ? clean : null;
}

const tooSmall = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'stackTooSmall',
    'errors.videos.stackTooSmall',
  );

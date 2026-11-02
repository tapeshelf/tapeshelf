import { HttpStatus, Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  CATEGORIES_MAX,
  type CategoryDto,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './categories.dto.js';
import type { TileScale } from '../users/page-settings.js';

/** Holder's flat categories. */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All categories of the owner with the number of live holdings in each. */
  async listMine(ownerId: string): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { ownerId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: { holdings: { where: { video: { deletedAt: null } } } },
        },
      },
    });
    return rows.map((c) => ({ ...pick(c), count: c._count.holdings }));
  }

  async create(ownerId: string, dto: CreateCategoryDto): Promise<CategoryDto> {
    const name = dto.name.trim();
    if (!name) throw validation();
    const count = await this.prisma.category.count({ where: { ownerId } });
    if (count >= CATEGORIES_MAX)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'tooManyCategories',
        'errors.categories.tooMany',
        { params: { max: CATEGORIES_MAX } },
      );
    await this.assertNameFree(ownerId, name);
    const created = await this.prisma.category
      .create({ data: { ownerId, name, position: count } })
      .catch(rethrowDuplicate);
    return { ...pick(created), count: 0 };
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    const category = await this.own(ownerId, id);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw validation();
    if (name && name !== category.name)
      await this.assertNameFree(ownerId, name, id);
    // The cover is one of the category's own videos.
    if (dto.coverVideoId) {
      const held = await this.prisma.videoAccess.count({
        where: {
          holderId: ownerId,
          videoId: dto.coverVideoId,
          categoryId: id,
          video: { deletedAt: null },
        },
      });
      if (!held)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'videoNotFound',
          'errors.videos.notFound',
        );
    }
    const updated = await this.prisma.category
      .update({
        where: { id },
        data: {
          name: name || undefined,
          hidden: dto.hidden,
          coverVideoId: dto.coverVideoId,
          previewRows: dto.previewRows,
          tileScale: dto.tileScale,
        },
        include: {
          _count: {
            select: { holdings: { where: { video: { deletedAt: null } } } },
          },
        },
      })
      .catch(rethrowDuplicate);
    return { ...pick(updated), count: updated._count.holdings };
  }

  /** Deleting a category keeps the videos: their holdings just lose the category. */
  async remove(ownerId: string, id: string): Promise<void> {
    await this.own(ownerId, id);
    await this.prisma.$transaction([
      this.prisma.videoAccess.updateMany({
        where: { holderId: ownerId, categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.delete({ where: { id } }),
    ]);
  }

  /** Listed ids get positions 0..n-1 in that order; the rest keep their relative order after them. */
  async reorder(ownerId: string, ids: string[]): Promise<CategoryDto[]> {
    const mine = await this.prisma.category.findMany({
      where: { ownerId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const known = new Set(mine.map((c) => c.id));
    const ordered = ids.filter(
      (id, i) => known.has(id) && ids.indexOf(id) === i,
    );
    for (const c of mine) if (!ordered.includes(c.id)) ordered.push(c.id);
    await this.prisma.$transaction(
      ordered.map((id, position) =>
        this.prisma.category.update({ where: { id }, data: { position } }),
      ),
    );
    return this.listMine(ownerId);
  }

  /** Resolves a category id that must belong to `ownerId` (composite FK backs it). */
  async assertOwn(ownerId: string, id: string): Promise<void> {
    await this.own(ownerId, id);
  }

  private async own(ownerId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, ownerId },
    });
    if (!category)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'categoryNotFound',
        'errors.videos.categoryNotFound',
      );
    return category;
  }

  private async assertNameFree(
    ownerId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: {
        ownerId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw duplicate();
  }
}

function pick(c: {
  id: string;
  name: string;
  position: number;
  hidden: boolean;
  coverVideoId: string | null;
  previewRows: number | null;
  tileScale: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    position: c.position,
    hidden: c.hidden,
    coverVideoId: c.coverVideoId,
    previewRows: c.previewRows,
    tileScale: c.tileScale as TileScale | null,
  };
}

const duplicate = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'categoryExists',
    'errors.categories.exists',
  );

const validation = () =>
  new AppException(HttpStatus.BAD_REQUEST, 'validation', 'errors.validation');

function rethrowDuplicate(err: { code?: string }): never {
  if (err.code === 'P2002') throw duplicate();
  throw err;
}

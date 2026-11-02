import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { categoriesCreate } from '../../api/fn/categories/categories-create';
import { categoriesList } from '../../api/fn/categories/categories-list';
import { categoriesRemove } from '../../api/fn/categories/categories-remove';
import { categoriesReorder } from '../../api/fn/categories/categories-reorder';
import { categoriesUpdate } from '../../api/fn/categories/categories-update';
import type { CategoryDto } from '../../api/models/category-dto';
import type { UpdateCategoryDto } from '../../api/models/update-category-dto';
import { AuthStore } from '../auth/auth.store';

/** The signed-in user's categories: loaded once per session, kept in sync by the mutations. */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private loading: Promise<void> | null = null;

  readonly items = signal<CategoryDto[]>([]);
  readonly loaded = signal(false);
  readonly byId = computed(() => new Map(this.items().map((c) => [c.id, c])));

  constructor() {
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.items.set([]);
        this.loaded.set(false);
        if (user) void this.load();
      });
    });
  }

  load(): Promise<void> {
    this.loading ??= this.api
      .invoke(categoriesList)
      .then((list) => {
        this.items.set(list);
        this.loaded.set(true);
      })
      .catch(() => undefined)
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  async create(name: string): Promise<CategoryDto> {
    const created = await this.api.invoke(categoriesCreate, { body: { name } });
    this.items.update((list) => [...list, created]);
    return created;
  }

  async rename(id: string, name: string): Promise<void> {
    const updated = await this.api.invoke(categoriesUpdate, { id, body: { name } });
    this.replace(updated);
  }

  async setHidden(id: string, hidden: boolean): Promise<void> {
    const updated = await this.api.invoke(categoriesUpdate, { id, body: { hidden } });
    this.replace(updated);
  }

  /** Its card's picture, its rows and tile size in "All videos". */
  async update(id: string, body: UpdateCategoryDto): Promise<void> {
    this.replace(await this.api.invoke(categoriesUpdate, { id, body }));
  }

  async remove(id: string): Promise<void> {
    await this.api.invoke(categoriesRemove, { id });
    this.items.update((list) => list.filter((c) => c.id !== id));
  }

  /** Optimistic: the list is reordered at once and reconciled with the server's answer. */
  async reorder(ids: string[]): Promise<void> {
    const before = this.items();
    const byId = new Map(before.map((c) => [c.id, c]));
    this.items.set(ids.map((id) => byId.get(id)).filter((c): c is CategoryDto => !!c));
    try {
      this.items.set(await this.api.invoke(categoriesReorder, { body: { ids } }));
    } catch (e) {
      this.items.set(before);
      throw e;
    }
  }

  /** Counts come from the server; after local holding changes the caller passes fresh ones. */
  setCounts(counts: Map<string, number>): void {
    this.items.update((list) =>
      list.map((c) => (counts.has(c.id) ? { ...c, count: counts.get(c.id)! } : c)),
    );
  }

  private replace(category: CategoryDto): void {
    this.items.update((list) => list.map((c) => (c.id === category.id ? category : c)));
  }
}

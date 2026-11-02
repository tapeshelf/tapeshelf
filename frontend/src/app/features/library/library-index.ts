import { CdkDrag, type CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideEllipsis,
  lucideEye,
  lucideEyeOff,
  lucidePencil,
  lucidePlus,
  lucideRows3,
  lucideTrash2,
} from '@ng-icons/lucide';

import { type CategoryDto, type CollectionSummaryDto } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { CategoriesStore } from '../../core/categories/categories.store';
import { LanguageService } from '../../core/i18n/language.service';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { FitRowDirective } from '../../shared/ui/fit-row/fit-row.directive';
import { StrokeComponent, hashString } from '../../shared/ui/stroke/stroke';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { type DragTarget } from './tile-drag';
import { CategoryLookDialog } from './category-look-dialog';
import { type Folder, folderFromParam, folderToParam } from './library.store';
import {
  ShelfFolderMenuComponent,
  type FolderMenuItem,
} from '../../shared/collection/shelf-folder-menu';

type Filter = 'INBOX' | 'PUBLIC' | 'PRIVATE' | 'OTHERS' | 'NONE' | 'HIDDEN' | 'TRASH';

/** The quieter folders under the index: what the videos are rather than where they are kept. */
const FILTERS: { kind: Filter; count: keyof CollectionSummaryDto }[] = [
  // Unsorted uploads first: what waits for the owner.
  { kind: 'INBOX', count: 'inbox' },
  { kind: 'PUBLIC', count: 'public' },
  { kind: 'PRIVATE', count: 'private' },
  { kind: 'OTHERS', count: 'others' },
  { kind: 'NONE', count: 'uncategorized' },
  { kind: 'HIDDEN', count: 'hidden' },
  { kind: 'TRASH', count: 'trash' },
];

/**
 * Folders and categories of the own shelf: an index in display
 * type — all videos and the owner's categories, the open one underlined with a brush stroke — and a
 * quiet line of filters under it. Every entry is a drop target for dragged tiles; categories are
 * created, renamed, hidden, deleted and reordered right here.
 */
@Component({
  selector: 'app-library-index',
  imports: [
    TranslocoPipe,
    FormsModule,
    NgIcon,
    AutofocusDirective,
    CdkDropList,
    CdkDrag,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    StrokeComponent,
    FitRowDirective,
    ShelfFolderMenuComponent,
  ],
  providers: [
    provideIcons({
      lucideEllipsis,
      lucideEye,
      lucideEyeOff,
      lucidePencil,
      lucidePlus,
      lucideRows3,
      lucideTrash2,
    }),
  ],
  template: `
    <nav class="flex flex-col gap-5" [attr.aria-label]="'library.folders.title' | transloco">
      <!-- One row of "All videos", the categories (dragged to reorder) and "+": the type adapts
           to the room and the row wraps as one flow. The drop list sorts only its
           draggable categories; the other children keep their places. -->
      <!-- On a phone it scrolls sideways; the list of all is under it. -->
      <div
        appFitRow
        [scrollBelow]="640"
        cdkDropList
        [cdkDropListOrientation]="'mixed'"
        class="flex flex-wrap items-end gap-x-6 gap-y-4 pb-2"
        (cdkDropListDropped)="reorder($event)"
      >
        <button
          type="button"
          class="index-tab"
          [class]="tabClass(folder().kind === 'ALL', false)"
          [attr.aria-current]="folder().kind === 'ALL' ? 'page' : null"
          (click)="folderChange.emit({ kind: 'ALL' })"
        >
          <span class="index-tab">{{ 'library.folders.ALL' | transloco }}</span
          ><sup class="index-count">{{ summary()?.all ?? '' }}</sup>
          @if (folder().kind === 'ALL') {
            <app-stroke
              class="absolute inset-x-0 -bottom-2.5"
              [seed]="seed('ALL')"
              [height]="8"
              [thickness]="3.5"
            />
          }
        </button>

        @for (c of categories.items(); track c.id) {
          <div
            cdkDrag
            class="group relative flex shrink-0 items-end"
            [attr.data-drop-category]="c.id"
          >
            @if (renaming() === c.id) {
              <input
                type="text"
                maxlength="50"
                class="index-tab w-[12ch] border-b-2 border-line bg-transparent outline-none"
                [ngModel]="draft()"
                (ngModelChange)="draft.set($event)"
                [attr.aria-label]="'library.categoryName' | transloco"
                (keydown.enter)="commitRename(c)"
                (keydown.escape)="renaming.set(null)"
                (blur)="commitRename(c)"
                appAutofocus
              />
            } @else {
              <button
                type="button"
                class="index-tab"
                [class]="tabClass(isCurrent(c.id), isDropTarget('category', c.id))"
                [attr.aria-current]="isCurrent(c.id) ? 'page' : null"
                (click)="folderChange.emit({ kind: 'CATEGORY', id: c.id })"
                (dblclick)="startRename(c)"
              >
                <span
                  class="index-tab inline-block max-w-[min(20rem,70vw)] truncate align-bottom"
                  [title]="c.name"
                  >{{ c.name }}</span
                ><sup class="index-count">{{ countOf(c) }}</sup>
                @if (c.hidden) {
                  <ng-icon
                    name="lucideEyeOff"
                    size="14"
                    class="mb-1 ml-1 self-end text-faint"
                    [attr.aria-label]="'library.categoryHiddenBadge' | transloco"
                  />
                }
                @if (isCurrent(c.id)) {
                  <app-stroke
                    class="absolute inset-x-0 -bottom-2.5"
                    [seed]="seed(c.id)"
                    [height]="8"
                    [thickness]="3.5"
                  />
                }
              </button>
              <!-- Over the count, on hover only: it takes no room in the row. -->
              <button
                type="button"
                class="absolute -top-1 -right-2 rounded-sm bg-canvas p-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text focus:opacity-100"
                [cdkMenuTriggerFor]="categoryMenu"
                [cdkMenuTriggerData]="{ category: c }"
                [attr.aria-label]="'library.categoryActions' | transloco: { name: c.name }"
              >
                <ng-icon name="lucideEllipsis" size="16" />
              </button>
            }
          </div>
        }
        @if (creating()) {
          <input
            type="text"
            maxlength="50"
            class="index-tab w-[12ch] shrink-0 border-b-2 border-line bg-transparent outline-none placeholder:text-faint"
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
            [placeholder]="'library.categoryName' | transloco"
            [attr.aria-label]="'library.categoryName' | transloco"
            (keydown.enter)="commitCreate()"
            (keydown.escape)="creating.set(false)"
            (blur)="commitCreate()"
            appAutofocus
          />
        } @else {
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-line hover:text-text"
            [attr.aria-label]="'library.newCategory' | transloco"
            [attr.title]="'library.newCategory' | transloco"
            (click)="startCreate()"
          >
            <ng-icon name="lucidePlus" size="15" />
          </button>
        }
      </div>

      <app-shelf-folder-menu
        class="-mt-2 self-start sm:hidden"
        [items]="menuItems()"
        [label]="'collection.sticky.allCategories' | transloco"
        [ariaLabel]="'collection.sticky.folders' | transloco"
        (picked)="pick($event)"
      />
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        @for (f of filters; track f.kind) {
          @if (f.kind !== 'INBOX' || (summary()?.inbox ?? 0) > 0 || folder().kind === 'INBOX') {
            <button
              type="button"
              class="rounded-sm transition-colors"
              [class]="filterClass(folder().kind === f.kind, isDropTarget('folder', f.kind))"
              [attr.data-drop-folder]="
                f.kind === 'PUBLIC' || f.kind === 'PRIVATE' || f.kind === 'HIDDEN' ? f.kind : null
              "
              [attr.data-drop-category]="f.kind === 'NONE' ? 'none' : null"
              [attr.aria-current]="folder().kind === f.kind ? 'page' : null"
              (click)="folderChange.emit({ kind: f.kind })"
            >
              {{ 'library.folders.' + f.kind | transloco }}
              <span
                class="ml-0.5 font-mono text-[11px]"
                [class]="f.kind === 'INBOX' ? 'font-semibold text-accent-text' : 'text-faint'"
                >{{ summary()?.[f.count] ?? '' }}</span
              >
            </button>
          }
        }
        <!-- Not a folder: a window that finds the likely same videos. -->
        <button
          type="button"
          class="rounded-sm text-muted transition-colors hover:text-text"
          (click)="duplicates.emit()"
          data-testid="open-duplicates"
        >
          {{ 'library.duplicates.open' | transloco }}
        </button>
        <ng-content />
      </div>
    </nav>

    <ng-template #categoryMenu let-category="category">
      <div
        cdkMenu
        class="flex w-48 flex-col rounded-md border border-border bg-surface p-1 text-sm text-text shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]"
      >
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left hover:bg-surface-2"
          (click)="startRename(category)"
        >
          <ng-icon name="lucidePencil" size="15" class="shrink-0 text-muted" />{{
            'library.rename' | transloco
          }}
        </button>
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left hover:bg-surface-2"
          (click)="toggleHidden(category)"
        >
          <ng-icon
            [name]="category.hidden ? 'lucideEye' : 'lucideEyeOff'"
            size="15"
            class="shrink-0 text-muted"
          />{{ (category.hidden ? 'library.showCategory' : 'library.hideCategory') | transloco }}
        </button>
        <!-- Its rows and tile size in "All videos" by category. -->
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left hover:bg-surface-2"
          data-testid="category-look"
          (click)="look.open(category)"
        >
          <ng-icon name="lucideRows3" size="15" class="shrink-0 text-muted" />{{
            'library.look.open' | transloco
          }}
        </button>
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-left text-danger hover:bg-surface-2"
          (click)="remove(category)"
        >
          <ng-icon name="lucideTrash2" size="15" class="shrink-0" />{{
            'library.deleteCategory' | transloco
          }}
        </button>
      </div>
    </ng-template>
  `,
})
export class LibraryIndexComponent {
  protected readonly categories = inject(CategoriesStore);
  protected readonly look = inject(CategoryLookDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  readonly folder = input.required<Folder>();
  readonly summary = input<CollectionSummaryDto | null>(null);
  readonly dropTarget = input<DragTarget>(null);
  readonly folderChange = output<Folder>();
  /** "Duplicates" was asked for. */
  readonly duplicates = output<void>();

  protected readonly filters = FILTERS;
  protected readonly creating = signal(false);
  protected readonly renaming = signal<string | null>(null);
  protected readonly draft = signal('');
  private readonly summaryCounts = computed(
    () => new Map((this.summary()?.categories ?? []).map((c) => [c.id, c.count])),
  );

  /** Every folder in one list: the phone's "all categories" and the compact bar. */
  readonly menuItems = computed(() => {
    this.language.loaded();
    return ownerFolderItems(this.folder(), this.categories.items(), this.summary(), (key) =>
      this.t.translate(key),
    );
  });

  protected pick(key: string): void {
    this.folderChange.emit(folderFromParam(key || null));
  }

  protected seed(key: string): number {
    return hashString(key);
  }

  protected isCurrent(id: string): boolean {
    const f = this.folder();
    return f.kind === 'CATEGORY' && f.id === id;
  }

  protected countOf(c: CategoryDto): number {
    return this.summaryCounts().get(c.id) ?? c.count;
  }

  protected isDropTarget(type: 'folder' | 'category', id: string): boolean {
    const t = this.dropTarget();
    if (!t) return false;
    if (type === 'folder') return t.type === 'folder' && t.kind === id;
    return t.type === 'category' && (t.id ?? 'NONE') === id;
  }

  protected tabClass(current: boolean, drop: boolean): string {
    const base = 'relative flex shrink-0 items-start whitespace-nowrap transition-colors ';
    if (drop) return base + 'text-accent-text';
    return base + (current ? 'text-text' : 'text-faint hover:text-text');
  }

  protected filterClass(current: boolean, drop: boolean): string {
    if (drop) return 'text-accent-text underline decoration-2 underline-offset-4';
    return current
      ? 'font-semibold text-text underline decoration-accent decoration-2 underline-offset-[6px]'
      : 'text-muted hover:text-text';
  }

  protected startCreate(): void {
    this.renaming.set(null);
    this.draft.set('');
    this.creating.set(true);
  }

  protected async commitCreate(): Promise<void> {
    if (!this.creating()) return;
    const name = this.draft().trim();
    this.creating.set(false);
    if (!name) return;
    try {
      const created = await this.categories.create(name);
      this.folderChange.emit({ kind: 'CATEGORY', id: created.id });
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected startRename(c: CategoryDto): void {
    this.creating.set(false);
    this.draft.set(c.name);
    this.renaming.set(c.id);
  }

  protected async commitRename(c: CategoryDto): Promise<void> {
    if (this.renaming() !== c.id) return;
    const name = this.draft().trim();
    this.renaming.set(null);
    if (!name || name === c.name) return;
    try {
      await this.categories.rename(c.id, name);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected async toggleHidden(c: CategoryDto): Promise<void> {
    try {
      await this.categories.setHidden(c.id, !c.hidden);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected async remove(c: CategoryDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('library.deleteCategory'),
      message: this.t.translate('library.confirmDeleteCategory', { name: c.name }),
      confirmLabel: this.t.translate('library.deleteCategory'),
      danger: true,
    });
    if (!ok) return;
    try {
      await this.categories.remove(c.id);
      if (this.isCurrent(c.id)) this.folderChange.emit({ kind: 'ALL' });
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected async reorder(event: CdkDragDrop<CategoryDto[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const ids = this.categories.items().map((c) => c.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    try {
      await this.categories.reorder(ids);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

/**
 * The owner's folders as one list: "All videos", the categories, then the filters under a
 * line. The key is the folder as the address writes it (`folderToParam`; "" for all).
 */
export function ownerFolderItems(
  folder: Folder,
  categories: readonly CategoryDto[],
  summary: CollectionSummaryDto | null,
  translate: (key: string) => string,
): FolderMenuItem[] {
  const current = folderToParam(folder) ?? '';
  const counts = new Map((summary?.categories ?? []).map((c) => [c.id, c.count]));
  return [
    {
      key: '',
      label: translate('library.folders.ALL'),
      count: summary?.all ?? null,
      current: current === '',
    },
    ...categories.map((c) => ({
      key: `c:${c.id}`,
      label: c.name,
      count: counts.get(c.id) ?? c.count,
      current: current === `c:${c.id}`,
    })),
    ...FILTERS.map((f, i) => ({
      key: f.kind.toLowerCase(),
      label: translate(`library.folders.${f.kind}`),
      count: (summary?.[f.count] as number | undefined) ?? null,
      current: current === f.kind.toLowerCase(),
      divided: i === 0,
    })),
  ];
}

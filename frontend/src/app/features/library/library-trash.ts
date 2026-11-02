import { Component, computed, inject, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFilm, lucideRotateCcw, lucideTrash2 } from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import {
  Api,
  type TrashItemDto,
  trashEmpty,
  trashList,
  trashRemove,
  trashRestore,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { RowSelection } from '../../shared/selection/row-selection';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';

const DAY_MS = 24 * 3600 * 1000;

/**
 * The owner's deleted videos: each stays the plan's number of days and can be
 * put back on the shelf. The owner may also let them go sooner — some ticked (a click on the row,
 * Shift for a range) or the whole trash; then, as when the days are over, they can no longer be
 * brought back. Videos removed by an admin are not here.
 */
@Component({
  selector: 'app-library-trash',
  imports: [
    TranslocoPipe,
    AppDatePipe,
    NgIcon,
    BytesPipe,
    ButtonDirective,
    EmptyStateComponent,
    SpinnerComponent,
    SensitiveBlurDirective,
  ],
  providers: [provideIcons({ lucideFilm, lucideRotateCcw, lucideTrash2 })],
  template: `
    <div class="mb-7 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="flex items-baseline gap-2.5 font-display text-2xl font-bold tracking-tight">
          {{ 'library.folders.TRASH' | transloco }}
          <span
            class="-rotate-3 rounded-sm border-2 border-accent-edge bg-accent px-1.5 font-mono text-xs leading-5 font-bold text-accent-fg"
            >{{ items().length }}</span
          >
        </h2>
        @if (days(); as d) {
          <p class="mt-2 max-w-2xl text-sm text-muted">
            {{ 'library.trash.hint' | transloco: { days: d } }}
          </p>
        }
      </div>
      @if (items().length) {
        <button
          type="button"
          appButton
          variant="secondary"
          size="sm"
          [disabled]="busy()"
          (click)="emptyAll()"
          data-testid="trash-empty"
        >
          <ng-icon name="lucideTrash2" size="14" />{{ 'library.trash.emptyAll' | transloco }}
        </button>
      }
    </div>
    @if (loading()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else if (items().length === 0) {
      <app-empty-state [text]="'library.trash.empty' | transloco" [seed]="31" />
    } @else {
      <div class="mb-3 flex min-h-10 flex-wrap items-center gap-2" data-testid="trash-bar">
        <label class="flex items-center gap-2 px-4 text-sm text-muted">
          <input
            type="checkbox"
            [checked]="sel.all()"
            [indeterminate]="sel.some()"
            (change)="sel.toggleAll($any($event.target).checked)"
            data-testid="trash-select-all"
          />
          {{ 'library.trash.selectAll' | transloco }}
        </label>
        @if (sel.count()) {
          <button
            type="button"
            appButton
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            (click)="restoreSelected()"
            data-testid="trash-restore-selected"
          >
            <ng-icon name="lucideRotateCcw" size="14" />{{
              'library.trash.restoreSelected' | transloco: { count: sel.count() }
            }}
          </button>
          <button
            type="button"
            appButton
            variant="danger"
            size="sm"
            [disabled]="busy()"
            (click)="remove(picked())"
            data-testid="trash-delete-selected"
          >
            <ng-icon name="lucideTrash2" size="14" />{{
              'library.trash.deleteSelected' | transloco: { count: sel.count() }
            }}
          </button>
        }
      </div>
      <ul
        class="flex flex-col divide-y-2 divide-line/10 rounded-xl border-2 border-line bg-surface"
        data-testid="trash-list"
      >
        @for (item of items(); track item.video.id) {
          <li
            class="flex items-center gap-4 px-4 py-3 first:rounded-t-[10px] last:rounded-b-[10px]"
            [class.bg-accent-soft]="sel.has(item.video.id)"
            data-testid="trash-item"
          >
            <input
              type="checkbox"
              [id]="'trash-' + item.video.id"
              [checked]="sel.has(item.video.id)"
              (click)="sel.box(item.video.id, $event)"
              data-testid="trash-item-select"
            />
            <!-- The whole row ticks its box; with Shift, the range. -->
            <label
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-4"
              [for]="'trash-' + item.video.id"
              (mousedown)="sel.mousedown($event)"
            >
              <span
                class="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-md border-2 border-line bg-shelf"
              >
                @if (item.video.thumbnailUrl) {
                  <img
                    [src]="item.video.thumbnailUrl"
                    [appSensitiveBlur]="false"
                    alt=""
                    class="h-full w-full object-cover opacity-70 grayscale"
                  />
                } @else {
                  <span class="flex h-full items-center justify-center text-faint">
                    <ng-icon name="lucideFilm" size="18" />
                  </span>
                }
              </span>
              <span class="block min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ item.video.title }}</span>
                <span class="label-mono mt-1 block text-muted">
                  {{ item.video.sizeBytes | bytes }} ·
                  {{
                    'library.trash.deleted'
                      | transloco: { date: (item.deletedAt | appDate: 'mediumDate') }
                  }}
                  ·
                  <span [class.text-danger]="daysLeft(item) <= 3">{{
                    'library.trash.left' | transloco: { count: daysLeft(item) }
                  }}</span>
                </span>
              </span>
            </label>
            <span class="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="restore(item)"
                data-testid="trash-restore"
              >
                <ng-icon name="lucideRotateCcw" size="14" />{{
                  'library.trash.restore' | transloco
                }}
              </button>
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                [disabled]="busy()"
                (click)="remove([item])"
                [attr.aria-label]="'library.trash.delete' | transloco"
                data-testid="trash-delete"
              >
                <ng-icon name="lucideTrash2" size="14" />{{ 'library.trash.delete' | transloco }}
              </button>
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class LibraryTrashComponent {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly confirm = inject(ConfirmService);

  /** The trash changed (back on the shelf or gone): the folders' counts change. */
  readonly restored = output<void>();

  protected readonly items = signal<TrashItemDto[]>([]);
  protected readonly days = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly sel = new RowSelection(() => this.items().map((i) => i.video.id));
  protected readonly picked = computed(() => this.items().filter((i) => this.sel.has(i.video.id)));
  private readonly now = signal(Date.now());
  protected readonly daysLeft = (item: TrashItemDto) =>
    Math.max(0, Math.ceil((new Date(item.purgeAt).getTime() - this.now()) / DAY_MS));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const list = await this.api.invoke(trashList);
      this.items.set(list.items);
      this.days.set(list.retentionDays);
      this.now.set(Date.now());
      this.sel.prune();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async restore(item: TrashItemDto): Promise<void> {
    await this.run(async () => {
      await this.api.invoke(trashRestore, { id: item.video.id });
      this.drop([item.video.id]);
      this.toast.success(this.t.translate('library.trash.restored', { title: item.video.title }));
    });
  }

  /** One by one: a video the shelf has no room for stops the rest, with the reason. */
  protected async restoreSelected(): Promise<void> {
    const picked = this.picked();
    await this.run(async () => {
      const back: string[] = [];
      try {
        for (const item of picked) {
          await this.api.invoke(trashRestore, { id: item.video.id });
          back.push(item.video.id);
        }
      } finally {
        this.drop(back);
      }
      this.toast.success(this.t.translate('library.trash.restoredMany', { count: back.length }));
    });
  }

  protected async remove(items: TrashItemDto[]): Promise<void> {
    if (!items.length) return;
    const ok = await this.confirm.confirm({
      title: this.t.translate('library.trash.confirmDeleteTitle', { count: items.length }),
      message: this.t.translate('library.trash.confirmDeleteText', { count: items.length }),
      confirmLabel: this.t.translate('library.trash.delete'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      const ids = items.map((i) => i.video.id);
      const r = await this.api.invoke(trashRemove, { body: { videoIds: ids } });
      this.drop(ids);
      this.toast.success(this.t.translate('library.trash.removed', { count: r.updated }));
    });
  }

  protected async emptyAll(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('library.trash.confirmEmptyTitle'),
      message: this.t.translate('library.trash.confirmEmptyText', { count: this.items().length }),
      confirmLabel: this.t.translate('library.trash.emptyAll'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.invoke(trashEmpty);
      this.drop(this.items().map((i) => i.video.id));
      this.toast.success(this.t.translate('library.trash.emptied'));
    });
  }

  private drop(ids: string[]): void {
    if (!ids.length) return;
    const gone = new Set(ids);
    this.items.update((list) => list.filter((i) => !gone.has(i.video.id)));
    this.sel.prune();
    this.restored.emit();
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

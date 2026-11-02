import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEraser } from '@ng-icons/lucide';

import {
  Api,
  type AdminTrashState,
  type AdminVideoRowDto,
  type TrashExit,
  adminTrashList,
  adminTrashPurge,
  adminTrashRestore,
} from '../../api';
import { RowSelection } from '../../shared/selection/row-selection';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { BytesPipe, formatBytes } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  AdminMoreComponent,
  AdminSelectionBarComponent,
  TABLE,
  TABLE_WRAP,
  TD,
  TD_BOX,
  TH,
  apiMessage,
  type RowsMode,
  fetchRows,
} from './admin-ui';

const DAY_MS = 24 * 3600 * 1000;
const EXITS: TrashExit[] = ['EMPTIED', 'REMOVED', 'EXPIRED', 'BANNED', 'ACCOUNT_DELETED', 'ADMIN'];

/** The filter: everything, one of the two parts, or one reason for leaving an author's trash. */
type Show = '' | AdminTrashState | TrashExit;

/** A row that left its author's trash for good: marked, it waits for the admin. */
const OUT_ROW = 'bg-warning/10 shadow-[inset_4px_0_0_var(--color-warning)]';
const SELECTED_ROW = 'bg-accent-soft shadow-[inset_4px_0_0_var(--color-accent)]';

/**
 * Trash: every deleted video keeps its files until the
 * admin erases them here; nothing else ever does. On top, marked, what left its author's trash for
 * good — emptied, deleted from there, time over, account blocked or gone, removed by an admin — and
 * waits for the admin to decide. Below, what the authors
 * can still restore themselves, with the days they have left.
 */
@Component({
  selector: 'app-admin-trash',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    NgIcon,
    AppDatePipe,
    BytesPipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
    AdminMoreComponent,
    AdminSelectionBarComponent,
  ],
  providers: [
    provideIcons({
      lucideEraser,
    }),
  ],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <input
        appInput
        type="search"
        maxlength="64"
        class="min-w-56 flex-1"
        [placeholder]="'admin.trash.search' | transloco"
        [attr.aria-label]="'admin.trash.search' | transloco"
        (input)="search($any($event.target).value)"
      />
      <app-select
        [ariaLabel]="'admin.filterLabel.reason' | transloco"
        class="w-auto"
        [ngModel]="show()"
        (ngModelChange)="setShow($event)"
      >
        <app-option [value]="''">{{ 'admin.trash.show.all' | transloco }}</app-option>
        <app-option [value]="'out'">{{ 'admin.trash.show.out' | transloco }}</app-option>
        <app-option [value]="'user'">{{ 'admin.trash.show.user' | transloco }}</app-option>
        @for (e of exits; track e) {
          <app-option [value]="e">— {{ 'admin.trash.exit.' + e | transloco }}</app-option>
        }
      </app-select>
    </div>

    <div
      class="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"
      data-testid="trash-summary"
    >
      <span class="flex items-center gap-2">
        <span class="h-3 w-3 rounded-sm bg-warning"></span>
        {{ 'admin.trash.waiting' | transloco: { count: waiting() } }}
      </span>
      <span class="text-muted">{{
        'admin.trash.inUserTrashCount' | transloco: { count: inUserTrash() }
      }}</span>
      <span class="font-mono text-xs text-muted">{{
        'admin.trash.stored' | transloco: { size: (totalBytes() | bytes) }
      }}</span>
    </div>

    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else {
      <app-admin-selection-bar [count]="sel.count()" (clear)="sel.clear()">
        <button
          type="button"
          appButton
          variant="secondary"
          size="sm"
          [disabled]="busy()"
          (click)="restore()"
          data-testid="trash-restore"
        >
          {{ 'admin.trash.restore' | transloco: { count: sel.count() } }}
        </button>
        <button
          type="button"
          appButton
          variant="danger"
          size="sm"
          [disabled]="busy()"
          (click)="purge(picked())"
          data-testid="trash-purge"
        >
          {{ 'admin.trash.purge' | transloco: { count: sel.count() } }}
        </button>
      </app-admin-selection-bar>

      <div [class]="tableWrap">
        <table [class]="table" data-testid="admin-trash">
          <thead>
            <tr>
              <th [class]="th" class="w-10">
                <input
                  type="checkbox"
                  [checked]="sel.all()"
                  [indeterminate]="sel.some()"
                  [disabled]="items().length === 0"
                  (change)="sel.toggleAll($any($event.target).checked)"
                  [attr.aria-label]="'admin.trash.selectAll' | transloco"
                  data-testid="select-all"
                />
              </th>
              <th [class]="th">{{ 'admin.videos.video' | transloco }}</th>
              <th [class]="th">{{ 'admin.trash.deletedAt' | transloco }}</th>
              <th [class]="th">{{ 'admin.trash.reasonCol' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.holders' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.trash.inS3' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.actions' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (v of items(); track v.id; let i = $index) {
              @if (groupStarts(i); as group) {
                <tr>
                  <td
                    colspan="7"
                    class="label-mono border-b border-line/10 bg-surface-2 px-3 py-1.5 text-muted"
                    [attr.data-testid]="'trash-group-' + group"
                  >
                    {{ 'admin.trash.group.' + group | transloco }}
                  </td>
                </tr>
              }
              <tr
                [class]="rowClass(v)"
                (click)="sel.row(v.id, $event)"
                (mousedown)="sel.mousedown($event)"
                data-testid="trash-row"
                [attr.data-video-id]="v.id"
                [attr.data-out]="v.trashExit ? 'true' : null"
              >
                <td [class]="tdBox">
                  <input
                    type="checkbox"
                    [checked]="sel.has(v.id)"
                    (click)="sel.box(v.id, $event)"
                    [attr.aria-label]="v.title"
                    data-testid="row-select"
                  />
                </td>
                <td [class]="td">
                  <a [routerLink]="['/admin/videos', v.id]" class="flex items-center gap-3">
                    @if (v.thumbnailUrl) {
                      <img
                        [src]="v.thumbnailUrl"
                        alt=""
                        class="h-10 w-16 shrink-0 rounded-sm border border-line object-cover"
                      />
                    } @else {
                      <span
                        class="block h-10 w-16 shrink-0 rounded-sm border border-line bg-surface-3"
                      ></span>
                    }
                    <span class="min-w-0">
                      <span class="block truncate font-semibold">{{ v.title }}</span>
                      <span class="font-mono text-xs text-muted">
                        @if (v.author.status === 'DELETED') {
                          {{ 'admin.trash.deletedAccount' | transloco }} (&#64;{{
                            v.author.username
                          }})
                        } @else {
                          &#64;{{ v.author.username }}
                        }
                      </span>
                    </span>
                  </a>
                </td>
                <td [class]="td">
                  <span class="block whitespace-nowrap">{{ v.deletedAt | appDate: 'short' }}</span>
                  <span class="text-xs text-muted">
                    {{ 'admin.trash.reason.' + v.deleteReason | transloco }}
                    @if (v.deletedBy && v.deletedBy.id !== v.author.id) {
                      &#64;{{ v.deletedBy.username }}
                    }
                  </span>
                </td>
                <td [class]="td">
                  @if (v.trashExit) {
                    <span class="font-semibold">{{
                      'admin.trash.exit.' + v.trashExit | transloco
                    }}</span>
                    <span class="mt-0.5 block text-xs whitespace-nowrap text-muted">{{
                      v.trashExitAt | appDate: 'short'
                    }}</span>
                  } @else {
                    <span class="text-sm">{{ 'admin.trash.atAuthor' | transloco }}</span>
                    <span class="block text-xs text-muted">{{
                      'admin.trash.daysLeft' | transloco: { count: daysLeft(v) }
                    }}</span>
                  }
                </td>
                <td [class]="td" class="text-right font-mono">{{ v.holders }}</td>
                <td [class]="td" class="text-right font-mono whitespace-nowrap">
                  {{ v.storedBytes ?? v.sizeBytes | bytes }}
                </td>
                <td [class]="td">
                  <span class="flex justify-end gap-1">
                    <button
                      type="button"
                      class="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
                      [attr.aria-label]="'admin.trash.eraseOne' | transloco"
                      [title]="'admin.trash.eraseOne' | transloco"
                      [disabled]="busy()"
                      (click)="purge([v])"
                      data-testid="trash-row-purge"
                    >
                      <ng-icon name="lucideEraser" size="16" />
                    </button>
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td [class]="td" colspan="7" class="py-8 text-center text-muted">
                  {{ 'admin.trash.empty' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-admin-more [total]="total()" [count]="items().length" [load]="more" />
    }
  `,
})
export class AdminTrashPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly exits = EXITS;
  protected readonly q = signal('');
  protected readonly show = signal<Show>('');
  protected readonly items = signal<AdminVideoRowDto[]>([]);
  protected readonly total = signal(0);
  protected readonly totalBytes = signal(0);
  protected readonly waiting = signal(0);
  protected readonly inUserTrash = signal(0);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Ticked rows: the bar above acts on all of them. */
  protected readonly sel = new RowSelection(() => this.items().map((v) => v.id));
  protected readonly picked = computed(() => this.items().filter((v) => this.sel.has(v.id)));
  private readonly now = signal(Date.now());
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;
  protected readonly tdBox = TD_BOX;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const query = { q: this.q(), show: this.show() };
      untracked(() => void this.load(query, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load({ q: this.q(), show: this.show() }, 'more');

  protected search(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.q.set(q.trim());
    }, 300);
  }

  protected setShow(show: Show): void {
    this.show.set(show);
  }

  /** Where a part of the list starts on this page: its heading goes above that row. */
  protected groupStarts(i: number): 'out' | 'user' | null {
    const list = this.items();
    const group = (v: AdminVideoRowDto) => (v.trashExit ? 'out' : 'user');
    if (i > 0 && group(list[i]!) === group(list[i - 1]!)) return null;
    return group(list[i]!);
  }

  protected rowClass(v: AdminVideoRowDto): string {
    if (this.sel.has(v.id)) return SELECTED_ROW;
    return v.trashExit ? OUT_ROW : 'hover:bg-surface-2';
  }

  protected daysLeft(v: AdminVideoRowDto): number {
    if (!v.restorableUntil) return 0;
    return Math.max(0, Math.ceil((new Date(v.restorableUntil).getTime() - this.now()) / DAY_MS));
  }

  protected async purge(videos: AdminVideoRowDto[]): Promise<void> {
    if (!videos.length) return;
    const bytes = videos.reduce((n, v) => n + (v.storedBytes ?? v.sizeBytes), 0);
    const atAuthor = videos.some((v) => !v.trashExit);
    const ok = await this.confirm.confirm({
      title: this.t.translate('admin.trash.purgeTitle', { count: videos.length }),
      message:
        this.t.translate('admin.trash.purgeText', { size: formatBytes(bytes) }) +
        (atAuthor ? ' ' + this.t.translate('admin.trash.purgeAtAuthor') : ''),
      confirmLabel: this.t.translate('admin.trash.purgeConfirm'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      const r = await this.api.invoke(adminTrashPurge, {
        body: { videoIds: videos.map((v) => v.id) },
      });
      this.toast.success(
        this.t.translate('admin.trash.purged', { count: r.done, size: formatBytes(r.bytes) }),
      );
      if (r.skipped.length)
        this.toast.error(this.t.translate('admin.bulk.skipped', { count: r.skipped.length }));
    });
  }

  protected async restore(): Promise<void> {
    const ids = [...this.sel.ids()];
    await this.run(async () => {
      const r = await this.api.invoke(adminTrashRestore, { body: { videoIds: ids } });
      this.toast.success(this.t.translate('admin.trash.restored', { count: r.done }));
      if (r.skipped.length)
        this.toast.error(this.t.translate('admin.trash.notRestored', { count: r.skipped.length }));
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      await this.reload();
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
    } finally {
      this.busy.set(false);
    }
  }

  private reload(): Promise<void> {
    return this.load({ q: this.q(), show: this.show() }, 'again');
  }

  private generation = 0;

  private async load(query: { q: string; show: Show }, mode: RowsMode): Promise<void> {
    const generation = mode === 'more' ? this.generation : ++this.generation;
    if (mode !== 'more') this.error.set(null);
    const state = query.show === 'out' || query.show === 'user' ? query.show : undefined;
    const exit = query.show && !state ? (query.show as TrashExit) : undefined;
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminTrashList, { q: query.q || undefined, state, exit, offset, limit }),
      );
      if (generation !== this.generation) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.totalBytes.set(page.totalBytes);
      this.waiting.set(page.waiting);
      this.inUserTrash.set(page.inUserTrash);
      this.now.set(Date.now());
      this.sel.prune();
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (generation === this.generation) this.error.set(apiMessage(e, this.t));
    }
  }
}

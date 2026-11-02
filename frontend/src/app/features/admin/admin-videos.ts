import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type AdminVideoRowDto,
  type AdminVideoScope,
  type AdminVideoSort,
  type VideoStatus,
  type Visibility,
  adminVideosList,
} from '../../api';
import { RowSelection } from '../../shared/selection/row-selection';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  AdminBadgeComponent,
  AdminMoreComponent,
  AdminSelectionBarComponent,
  TABLE,
  TABLE_WRAP,
  TD,
  TD_BOX,
  TH,
  apiMessage,
  toneOf,
  type RowsMode,
  fetchRows,
} from './admin-ui';
import { AdminVideoActions, AdminVideoActionsComponent } from './video-actions';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

interface Filters {
  q: string;
  author: string;
  status: VideoStatus | '';
  visibility: Visibility | '';
  scope: AdminVideoScope;
  sort: AdminVideoSort;
}

/**
 * Videos: every video, private and deleted ones included. Rows can be ticked
 * (box, Ctrl/⌘, Shift) to remove many at once.
 */
@Component({
  selector: 'app-admin-videos',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    BytesPipe,
    DurationPipe,
    AlertComponent,
    InputDirective,
    SpinnerComponent,
    AdminBadgeComponent,
    AdminMoreComponent,
    AdminSelectionBarComponent,
    AdminVideoActionsComponent,
    ButtonDirective,
  ],
  template: `
    <div class="mb-4 flex flex-wrap gap-2">
      <input
        appInput
        type="search"
        maxlength="64"
        class="min-w-56 flex-1"
        [placeholder]="'admin.videos.search' | transloco"
        [attr.aria-label]="'admin.videos.search' | transloco"
        (input)="debounced('q', $any($event.target).value)"
      />
      <input
        appInput
        type="search"
        maxlength="64"
        class="w-44"
        [placeholder]="'admin.videos.author' | transloco"
        [attr.aria-label]="'admin.videos.author' | transloco"
        [value]="filters().author"
        (input)="debounced('author', $any($event.target).value)"
      />
      <app-select
        [ariaLabel]="'admin.filterLabel.scope' | transloco"
        class="w-auto"
        [ngModel]="filters().scope"
        (ngModelChange)="set('scope', $event)"
      >
        @for (s of scopes; track s) {
          <app-option [value]="s">{{ 'admin.videos.scope.' + s | transloco }}</app-option>
        }
      </app-select>
      <app-select
        [ariaLabel]="'admin.filterLabel.status' | transloco"
        class="w-auto"
        [ngModel]="filters().status"
        (ngModelChange)="set('status', $event)"
      >
        <app-option [value]="''">{{ 'admin.anyStatus' | transloco }}</app-option>
        @for (s of statuses; track s) {
          <app-option [value]="s">{{ 'admin.videoStatus.' + s | transloco }}</app-option>
        }
      </app-select>
      <app-select
        [ariaLabel]="'admin.filterLabel.visibility' | transloco"
        class="w-auto"
        [ngModel]="filters().visibility"
        (ngModelChange)="set('visibility', $event)"
      >
        <app-option [value]="''">{{ 'admin.videos.anyVisibility' | transloco }}</app-option>
        <app-option [value]="'PUBLIC'">{{ 'admin.visibility.PUBLIC' | transloco }}</app-option>
        <app-option [value]="'PRIVATE'">{{ 'admin.visibility.PRIVATE' | transloco }}</app-option>
      </app-select>
      <app-select
        [ariaLabel]="'admin.filterLabel.sort' | transloco"
        class="w-auto"
        [ngModel]="filters().sort"
        (ngModelChange)="set('sort', $event)"
      >
        @for (s of sorts; track s) {
          <app-option [value]="s">{{ 'admin.videos.sort.' + s | transloco }}</app-option>
        }
      </app-select>
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
          variant="danger"
          size="sm"
          [disabled]="busy()"
          (click)="removeSelected()"
          data-testid="bulk-delete"
        >
          {{ 'admin.videos.toTrash' | transloco }}
        </button>
      </app-admin-selection-bar>
      <div [class]="tableWrap">
        <table [class]="table" data-testid="admin-videos">
          <thead>
            <tr>
              <th [class]="th" class="w-10">
                <input
                  type="checkbox"
                  [checked]="sel.all()"
                  [indeterminate]="sel.some()"
                  [disabled]="items().length === 0"
                  (change)="sel.toggleAll($any($event.target).checked)"
                  [attr.aria-label]="'admin.bulk.selectAll' | transloco"
                  data-testid="select-all"
                />
              </th>
              <th [class]="th">{{ 'admin.videos.video' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.authorCol' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.status' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.size' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.holders' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.created' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.actions' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (v of items(); track v.id) {
              <tr
                [class.hover:bg-surface-2]="!sel.has(v.id)"
                [class.bg-accent-soft]="sel.has(v.id)"
                (click)="sel.row(v.id, $event)"
                (mousedown)="sel.mousedown($event)"
                data-testid="admin-video-row"
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
                  <a [routerLink]="[v.id]" class="flex items-center gap-3">
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
                        {{ v.durationSec | duration }}
                        @if (v.width) {
                          · {{ v.width }}×{{ v.height }}
                        }
                      </span>
                    </span>
                  </a>
                </td>
                <td [class]="td">
                  <a
                    [routerLink]="['../users', v.author.id]"
                    class="font-mono text-xs hover:underline"
                    >&#64;{{ v.author.username }}</a
                  >
                </td>
                <td [class]="td">
                  <span class="flex flex-wrap gap-1">
                    <app-admin-badge [tone]="tone(v.status)">{{
                      'admin.videoStatus.' + v.status | transloco
                    }}</app-admin-badge>
                    <app-admin-badge>{{
                      'admin.visibility.' + v.visibility | transloco
                    }}</app-admin-badge>
                    @if (v.hiddenByAuthor) {
                      <app-admin-badge>{{
                        'admin.videos.hiddenByAuthor' | transloco
                      }}</app-admin-badge>
                    }
                    @if (v.purgedAt) {
                      <app-admin-badge tone="bad">{{
                        'admin.videos.purged' | transloco
                      }}</app-admin-badge>
                    } @else if (v.deletedAt) {
                      <app-admin-badge tone="bad">{{
                        'admin.videos.deleted' | transloco
                      }}</app-admin-badge>
                    }
                  </span>
                </td>
                <td [class]="td" class="text-right font-mono whitespace-nowrap">
                  {{ v.sizeBytes | bytes }}
                </td>
                <td [class]="td" class="text-right font-mono">{{ v.holders }}</td>
                <td [class]="td" class="whitespace-nowrap">
                  {{ v.createdAt | appDate: 'mediumDate' }}
                </td>
                <td [class]="td">
                  <app-admin-video-actions [video]="v" (changed)="reload()" />
                </td>
              </tr>
            } @empty {
              <tr>
                <td [class]="td" colspan="8" class="py-8 text-center text-muted">
                  {{ 'admin.nothing' | transloco }}
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
export class AdminVideosPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  /** Query parameter: open the list filtered by an author (from the user card). */
  readonly author = input<string>();

  protected readonly scopes: AdminVideoScope[] = ['live', 'trash', 'purged', 'all'];
  protected readonly statuses: VideoStatus[] = ['READY', 'QUEUED', 'PROCESSING', 'FAILED'];
  protected readonly sorts: AdminVideoSort[] = ['created', 'size', 'title'];
  protected readonly filters = signal<Filters>({
    q: '',
    author: '',
    status: '',
    visibility: '',
    scope: 'live',
    sort: 'created',
  });
  protected readonly items = signal<AdminVideoRowDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Ticked rows: the bar above acts on all of them. */
  protected readonly sel = new RowSelection(() => this.items().map((v) => v.id));
  private readonly picked = computed(() => this.items().filter((v) => this.sel.has(v.id)));
  private readonly actions = inject(AdminVideoActions);
  protected readonly tdBox = TD_BOX;
  protected readonly tone = toneOf;
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;
  /** A pause per field: typing in one must not drop what was just typed in the other. */
  private readonly timers: Partial<Record<'q' | 'author', ReturnType<typeof setTimeout>>> = {};

  constructor() {
    effect(() => {
      const author = this.author();
      if (author) untracked(() => this.set('author', author));
    });
    effect(() => {
      const f = this.filters();
      untracked(() => void this.load(f, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load(this.filters(), 'more');

  protected reload(): void {
    void this.load(this.filters(), 'again');
  }

  /** Sends every ticked video to the trash; the table reloads after it. */
  protected async removeSelected(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.actions.removeMany(this.picked())) {
        this.sel.clear();
        await this.load(this.filters(), 'again');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected debounced(key: 'q' | 'author', value: string): void {
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.set(key, value.trim()), 300);
  }

  protected set<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  private async load(f: Filters, mode: RowsMode): Promise<void> {
    if (mode !== 'more') this.error.set(null);
    try {
      const page = await fetchRows(mode, this.items(), (offset, limit) =>
        this.api.invoke(adminVideosList, {
          q: f.q || undefined,
          author: f.author.replace(/^@/, '') || undefined,
          status: f.status || undefined,
          visibility: f.visibility || undefined,
          scope: f.scope,
          sort: f.sort,
          offset,
          limit,
        }),
      );
      if (f !== this.filters()) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.sel.prune();
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (f === this.filters()) this.error.set(apiMessage(e, this.t));
    }
  }
}

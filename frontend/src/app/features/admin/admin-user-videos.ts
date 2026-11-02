import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type AdminVideoRowDto, adminVideosList } from '../../api';
import { RowSelection } from '../../shared/selection/row-selection';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
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

const LIMIT = 20;

/**
 * Every video the person uploaded: private, public, hidden by them, being
 * processed, failed and deleted, with a preview, newest first, page by page; the last column holds
 * the admin's tools; rows can be ticked to act on many at once.
 */
@Component({
  selector: 'app-admin-user-videos',
  imports: [
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    BytesPipe,
    DurationPipe,
    AlertComponent,
    SpinnerComponent,
    AdminBadgeComponent,
    AdminMoreComponent,
    AdminSelectionBarComponent,
    AdminVideoActionsComponent,
    ButtonDirective,
  ],
  template: `
    <h3 class="mt-8 mb-3 text-lg font-semibold">
      {{ 'admin.users.videosTitle' | transloco }}
      @if (total()) {
        <span class="ml-1 font-mono text-sm font-normal text-muted">{{ total() }}</span>
      }
    </h3>
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-6 text-muted"><app-spinner /></div>
    } @else if (items().length === 0) {
      <p class="text-sm text-muted">{{ 'admin.nothing' | transloco }}</p>
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
        <table [class]="table" data-testid="admin-user-videos">
          <thead>
            <tr>
              <th [class]="th" class="w-10">
                <input
                  type="checkbox"
                  [checked]="sel.all()"
                  [indeterminate]="sel.some()"
                  (change)="sel.toggleAll($any($event.target).checked)"
                  [attr.aria-label]="'admin.bulk.selectAll' | transloco"
                  data-testid="select-all"
                />
              </th>
              <th [class]="th">{{ 'admin.videos.video' | transloco }}</th>
              <th [class]="th">{{ 'admin.videos.status' | transloco }}</th>
              <th [class]="th" class="text-right">{{ 'admin.videos.size' | transloco }}</th>
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
                data-testid="admin-user-video"
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
                      <span class="block truncate font-semibold hover:underline">{{
                        v.title
                      }}</span>
                      @if (v.durationSec) {
                        <span class="font-mono text-xs text-muted">{{
                          v.durationSec | duration
                        }}</span>
                      }
                    </span>
                  </a>
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
                <td [class]="td" class="whitespace-nowrap">
                  {{ v.createdAt | appDate: 'mediumDate' }}
                </td>
                <td [class]="td">
                  <app-admin-video-actions [video]="v" (changed)="reload()" />
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
export class AdminUserVideosComponent {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  readonly username = input.required<string>();
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
  private seq = 0;

  constructor() {
    effect(() => {
      const username = this.username();
      untracked(() => void this.load(username, 'fresh'));
    });
  }

  /** The next rows, as the end of the table comes near. */
  protected readonly more = () => this.load(this.username(), 'more');

  protected reload(): void {
    void this.load(this.username(), 'again');
  }

  /** Sends every ticked video to the trash; the table reloads after it. */
  protected async removeSelected(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.actions.removeMany(this.picked())) {
        this.sel.clear();
        this.reload();
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async load(author: string, mode: RowsMode): Promise<void> {
    const seq = mode === 'more' ? this.seq : ++this.seq;
    try {
      const page = await fetchRows(
        mode,
        this.items(),
        (offset, limit) =>
          this.api.invoke(adminVideosList, {
            author,
            scope: 'all',
            sort: 'created',
            offset,
            limit,
          }),
        LIMIT,
      );
      if (seq !== this.seq) return;
      this.items.set(page.items);
      this.total.set(page.total);
      this.sel.prune();
      this.error.set(null);
      this.loaded.set(true);
    } catch (e) {
      if (mode === 'more') throw e;
      if (seq === this.seq) this.error.set(apiMessage(e, this.t));
    }
  }
}

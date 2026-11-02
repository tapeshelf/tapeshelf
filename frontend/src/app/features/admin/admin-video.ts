import { JsonPipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideDownload, lucideExternalLink } from '@ng-icons/lucide';

import {
  Api,
  type AdminVideoDetailDto,
  type Visibility,
  adminVideosDetail,
  adminVideosReprocess,
  adminVideosUpdate,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { Lightbox } from '../../shared/ui/lightbox/lightbox';
import { VideoPlayerComponent } from '../video/video-player';
import { AdminVideoActions } from './video-actions';
import { AdminBadgeComponent, TABLE, TABLE_WRAP, TD, TH, apiMessage, toneOf } from './admin-ui';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

/**
 * One video, whoever holds it: the admin plays any live video (admin bypass in
 * the access policy), sees the ffprobe data and the failure, changes visibility, reprocesses a
 * failed video, sends it to the trash.
 */
@Component({
  selector: 'app-admin-video',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    JsonPipe,
    BytesPipe,
    DurationPipe,
    NgIcon,
    AlertComponent,
    ButtonDirective,
    SpinnerComponent,
    VideoPlayerComponent,
    AdminBadgeComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideDownload,
      lucideExternalLink,
    }),
  ],
  template: `
    <a routerLink="../" class="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ng-icon name="lucideArrowLeft" size="14" />{{ 'admin.nav.videos' | transloco }}
    </a>
    @if (error(); as message) {
      <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
    } @else if (v(); as v) {
      <div class="mt-3 flex flex-wrap items-center gap-2" data-testid="admin-video">
        <h2 class="font-display text-xl font-semibold">{{ v.title }}</h2>
        <app-admin-badge [tone]="tone(v.status)">{{
          'admin.videoStatus.' + v.status | transloco
        }}</app-admin-badge>
        <app-admin-badge>{{ 'admin.visibility.' + v.visibility | transloco }}</app-admin-badge>
        @if (v.purgedAt) {
          <app-admin-badge tone="bad">{{ 'admin.videos.purged' | transloco }}</app-admin-badge>
        } @else if (v.deletedAt) {
          <app-admin-badge tone="bad">{{ 'admin.videos.deleted' | transloco }}</app-admin-badge>
        }
      </div>
      <p class="mt-1 text-sm text-muted">
        {{ 'admin.videos.by' | transloco }}
        <a [routerLink]="['/admin/users', v.author.id]" class="font-mono hover:underline"
          >&#64;{{ v.author.username }}</a
        >
        · {{ v.createdAt | appDate: 'medium' }}
      </p>

      <div class="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0">
          @if (v.status === 'READY' && !v.purgedAt) {
            <div class="overflow-hidden rounded-lg border-2 border-line">
              <app-video-player [videoId]="v.id" [frames]="v.frames" [poster]="v.thumbnailUrl" />
            </div>
          } @else if (v.contactSheetUrl) {
            <button type="button" class="block w-full cursor-zoom-in" (click)="openSheet(v)">
              <img
                [src]="v.contactSheetUrl"
                alt=""
                class="w-full rounded-lg border-2 border-line"
              />
            </button>
          } @else {
            <div
              class="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-line/40 text-sm text-muted"
            >
              {{ 'admin.videos.noPreview' | transloco }}
            </div>
          }
          @if (v.description) {
            <p class="mt-3 text-sm whitespace-pre-line">{{ v.description }}</p>
          }
          @if (v.failReason) {
            <app-alert kind="error" class="mt-4 block">
              <strong>{{ 'admin.videos.failReason' | transloco }}:</strong>
              {{ 'videos.failReason.' + v.failReason | transloco }} ({{ v.failReason }})
              @if (v.failDetail) {
                <pre class="mt-2 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap">{{
                  v.failDetail
                }}</pre>
              }
            </app-alert>
          }
        </div>

        <aside class="flex flex-col gap-4">
          @if (!v.deletedAt) {
            <section class="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
              <label class="flex items-center justify-between gap-3 text-sm">
                <span class="label-mono text-muted">{{
                  'admin.videos.visibilityLabel' | transloco
                }}</span>
                <app-select
                  size="sm"
                  class="w-36"
                  [ngModel]="v.visibility"
                  [disabled]="busy()"
                  (ngModelChange)="setVisibility($event)"
                >
                  <app-option [value]="'PUBLIC'">{{
                    'admin.visibility.PUBLIC' | transloco
                  }}</app-option>
                  <app-option [value]="'PRIVATE'">{{
                    'admin.visibility.PRIVATE' | transloco
                  }}</app-option>
                </app-select>
              </label>
              <label class="flex items-center justify-between gap-3 text-sm">
                <span class="label-mono text-muted">{{
                  'admin.videos.sensitive' | transloco
                }}</span>
                <input
                  type="checkbox"
                  [checked]="v.sensitive"
                  [disabled]="busy()"
                  (change)="setSensitive($any($event.target).checked)"
                />
              </label>
              <div class="flex flex-wrap gap-2 pt-1">
                <a appButton variant="secondary" size="sm" [routerLink]="['/v', v.id]">
                  <ng-icon name="lucideExternalLink" size="14" />{{
                    'admin.videos.openOnSite' | transloco
                  }}
                </a>
                @if (v.status === 'READY') {
                  <a
                    appButton
                    variant="secondary"
                    size="sm"
                    [href]="'/api/videos/' + v.id + '/download'"
                  >
                    <ng-icon name="lucideDownload" size="14" />{{
                      'admin.videos.download' | transloco
                    }}
                  </a>
                } @else {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    size="sm"
                    [disabled]="busy()"
                    (click)="reprocess()"
                    data-testid="admin-reprocess"
                  >
                    {{ 'admin.videos.reprocess' | transloco }}
                  </button>
                }
                <button
                  type="button"
                  appButton
                  variant="danger"
                  size="sm"
                  [disabled]="busy()"
                  (click)="remove(v)"
                  data-testid="admin-video-delete"
                >
                  {{ 'admin.videos.toTrash' | transloco }}
                </button>
              </div>
            </section>
          } @else {
            <section class="rounded-lg border-2 border-line bg-surface p-4 text-sm">
              <p>
                {{ 'admin.trash.reason.' + v.deleteReason | transloco }} ·
                {{ v.deletedAt | appDate: 'short' }}
              </p>
              <p class="mt-1" data-testid="admin-video-exit">
                @if (v.trashExit) {
                  {{ 'admin.trash.exit.' + v.trashExit | transloco }} ·
                  {{ v.trashExitAt | appDate: 'short' }}
                } @else {
                  {{ 'admin.trash.inUserTrash' | transloco }}
                }
              </p>
              @if (v.deletedBy) {
                <p class="mt-1 text-muted">
                  {{ 'admin.trash.deletedBy' | transloco }} &#64;{{ v.deletedBy.username }}
                </p>
              }
              @if (v.takedownRule) {
                <p class="mt-2" data-testid="admin-video-takedown">
                  {{ 'admin.takedown.told' | transloco }}
                  {{ 'reports.reason.' + v.takedownRule | transloco }}
                  @if (v.takedownNote) {
                    <span class="block text-muted">«{{ v.takedownNote }}»</span>
                  }
                </p>
              }
              @if (v.blocked) {
                <p class="mt-1 text-danger" data-testid="admin-video-blocked">
                  {{ 'admin.takedown.blocked' | transloco }}
                </p>
              }
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <a routerLink="/admin/trash" class="underline-offset-4 hover:underline">{{
                  'admin.nav.trash' | transloco
                }}</a>
              </div>
            </section>
          }
          <section class="rounded-lg border-2 border-line bg-surface p-4">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted">{{ 'admin.videos.file' | transloco }}</dt>
              <dd class="truncate font-mono text-xs" [title]="v.originalFilename">
                {{ v.originalFilename }}
              </dd>
              <dt class="text-muted">{{ 'admin.videos.size' | transloco }}</dt>
              <dd class="font-mono">{{ v.sizeBytes | bytes }}</dd>
              <dt class="text-muted">{{ 'admin.videos.duration' | transloco }}</dt>
              <dd class="font-mono">{{ v.durationSec | duration }}</dd>
              <dt class="text-muted">{{ 'admin.videos.resolution' | transloco }}</dt>
              <dd class="font-mono">{{ v.width ? v.width + '×' + v.height : '—' }}</dd>
              <dt class="text-muted">{{ 'admin.videos.processed' | transloco }}</dt>
              <dd>{{ v.processedAt ? (v.processedAt | appDate: 'short') : '—' }}</dd>
              <dt class="text-muted">{{ 'admin.videos.attempts' | transloco }}</dt>
              <dd class="font-mono">{{ v.processingAttempts }}</dd>
              <dt class="text-muted">{{ 'admin.videos.segments' | transloco }}</dt>
              <dd class="font-mono">
                {{ v.segmentCount ?? '—' }} ·
                {{ 'admin.videos.keyVersion' | transloco: { version: v.keyVersion } }}
              </dd>
              <dt class="text-muted">{{ 'admin.videos.openRequests' | transloco }}</dt>
              <dd class="font-mono">{{ v.openRequests }}</dd>
              <dt class="text-muted">{{ 'admin.videos.openReports' | transloco }}</dt>
              <dd class="font-mono">{{ v.openReports }}</dd>
            </dl>
          </section>
        </aside>
      </div>

      <section
        class="mt-6 rounded-lg border-2 border-line bg-surface p-4"
        data-testid="admin-source-meta"
      >
        <h3 class="text-sm font-semibold">{{ 'admin.videos.sourceMeta' | transloco }}</h3>
        @if (v.sourceMetadata; as meta) {
          <p class="mt-1 text-xs text-muted">{{ 'admin.videos.sourceMetaLead' | transloco }}</p>
          @if (!meta.entries.length && !meta.removedStreams.length) {
            <p class="mt-3 text-sm text-muted">{{ 'admin.videos.sourceMetaNone' | transloco }}</p>
          } @else {
            <table class="mt-3 w-full text-sm">
              <tbody class="divide-y divide-line/10">
                @for (e of meta.entries; track $index) {
                  <tr class="align-top">
                    <td class="py-1.5 pr-3 whitespace-nowrap text-muted">{{ scope(e.scope) }}</td>
                    <td class="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{{ e.key }}</td>
                    <td class="py-1.5 font-mono text-xs break-all">{{ e.value }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (meta.removedStreams.length) {
              <p class="mt-3 text-xs text-muted">
                {{ 'admin.videos.sourceMetaRemoved' | transloco }}:
                @for (r of meta.removedStreams; track r.index; let last = $last) {
                  <span class="font-mono">#{{ r.index }} {{ r.type }} ({{ r.codec }})</span
                  >{{ last ? '' : ', ' }}
                }
              </p>
            }
          }
        } @else {
          <p class="mt-1 text-sm text-muted">{{ 'admin.videos.sourceMetaOld' | transloco }}</p>
        }
      </section>

      @if (v.probe) {
        <details class="mt-6 rounded-lg border-2 border-line bg-surface p-4">
          <summary class="cursor-pointer text-sm font-semibold">
            {{ 'admin.videos.probe' | transloco }}
          </summary>
          <pre class="mt-3 max-h-96 overflow-auto font-mono text-xs">{{ v.probe | json }}</pre>
        </details>
      }
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminVideoPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly lightbox = inject(Lightbox);

  /** The frame preview full screen. */
  protected openSheet(v: { contactSheetUrl: string | null; title: string }): void {
    if (v.contactSheetUrl) void this.lightbox.open([{ url: v.contactSheetUrl, title: v.title }]);
  }
  private readonly toast = inject(ToastService);
  private readonly actions = inject(AdminVideoActions);

  readonly id = input.required<string>();
  protected readonly v = signal<AdminVideoDetailDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly tone = toneOf;
  protected readonly tableWrap = TABLE_WRAP;
  protected readonly table = TABLE;
  protected readonly th = TH;
  protected readonly td = TD;

  /** "format", "stream:2:video", "chapter:0" in words. */
  protected scope(scope: string): string {
    const [kind, index, type] = scope.split(':');
    return this.t.translate(`admin.videos.sourceMetaScope.${kind}`, { index, type });
  }

  /** Loads numbered: the answer for a video left meanwhile is dropped. */
  private loads = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        // Another video: the last one's card does not stand in for it while it loads.
        if (this.v()?.id !== id) this.v.set(null);
        void this.load(id);
      });
    });
  }

  protected setVisibility(visibility: Visibility): Promise<void> {
    return this.run(() =>
      this.api.invoke(adminVideosUpdate, { id: this.id(), body: { visibility } }),
    );
  }

  protected setSensitive(sensitive: boolean): Promise<void> {
    return this.run(() =>
      this.api.invoke(adminVideosUpdate, { id: this.id(), body: { sensitive } }),
    );
  }

  protected reprocess(): Promise<void> {
    return this.run(() => this.api.invoke(adminVideosReprocess, { id: this.id() }));
  }

  protected remove(v: AdminVideoDetailDto): Promise<void> {
    return this.act(() => this.actions.remove(v));
  }

  /** The actions show their own outcome; the page takes the video as it is now. */
  private async act(fn: () => Promise<AdminVideoDetailDto | null>): Promise<void> {
    this.busy.set(true);
    try {
      const done = await fn();
      if (done) this.v.set(done);
    } finally {
      this.busy.set(false);
    }
  }

  private async run(fn: () => Promise<AdminVideoDetailDto>): Promise<void> {
    this.busy.set(true);
    const id = this.id();
    try {
      const v = await fn();
      if (this.id() === id) this.v.set(v);
      this.toast.success(this.t.translate('admin.done'));
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
      await this.load(this.id());
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const seq = ++this.loads;
    try {
      const v = await this.api.invoke(adminVideosDetail, { id });
      if (seq !== this.loads) return;
      this.v.set(v);
      this.error.set(null);
    } catch (e) {
      if (seq === this.loads) this.error.set(apiMessage(e, this.t));
    }
  }
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink, lucideFilm, lucideX } from '@ng-icons/lucide';

import { Api, type VideoDetailDto, videosUpdateHolding } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { CategoriesStore } from '../../core/categories/categories.store';
import { VideosStore } from '../../core/videos/videos.store';
import { fieldError } from '../../shared/forms/validation';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { failReasonKey, stageKey } from './video-status';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { videoLink, videoState } from '../../core/navigation/user-links';

export interface VideoEditDialogData {
  id: string;
  /** My holding's category, when the opener knows it (the library does). */
  categoryId?: string | null;
}

/**
 * Details of an own video: metadata, the sensitive mark, thumbnail choice (16 frames or a second), status.
 * The video preview (contact sheet) is not shown here: it cannot be changed or removed.
 */
@Component({
  selector: 'app-video-edit-dialog',
  imports: [
    SelectComponent,
    OptionComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    NgIcon,
    BytesPipe,
    DurationPipe,
    AlertComponent,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    ProgressBarComponent,
    SpinnerComponent,
  ],
  providers: [provideIcons({ lucideX, lucideFilm, lucideExternalLink })],
  template: `
    <div
      class="flex max-h-[90vh] w-[min(960px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-hard"
      role="dialog"
      [attr.aria-label]="'videos.edit.title' | transloco"
    >
      <header class="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 class="text-base font-semibold">{{ 'videos.edit.title' | transloco }}</h2>
        <div class="flex items-center gap-1">
          @if (video(); as v) {
            <a
              [routerLink]="videoLink(v.code)"
              [state]="videoState(auth.user()?.username)"
              class="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text"
              data-testid="open-video-page"
              (click)="close()"
            >
              <ng-icon name="lucideExternalLink" size="14" />{{
                'videos.edit.openPage' | transloco
              }}
            </a>
          }
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
            [attr.aria-label]="'common.close' | transloco"
            (click)="close()"
          >
            <ng-icon name="lucideX" size="18" />
          </button>
        </div>
      </header>
      @if (video(); as v) {
        <div class="grid gap-6 overflow-y-auto p-5 md:grid-cols-[1.15fr_1fr]">
          <div class="min-w-0">
            <div class="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
              @if (v.thumbnailUrl) {
                @if (frameAspect() < 1.2) {
                  <!-- A tall or square picture is shown whole, on a blur of itself. -->
                  <img
                    [src]="v.thumbnailUrl"
                    alt=""
                    aria-hidden="true"
                    class="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl"
                  />
                }
                <img
                  [src]="v.thumbnailUrl"
                  [alt]="v.title"
                  class="relative h-full w-full"
                  [class.object-contain]="frameAspect() < 1.2"
                  [class.object-cover]="frameAspect() >= 1.2"
                  data-testid="edit-thumbnail"
                />
              } @else {
                <div class="flex h-full items-center justify-center text-faint">
                  <ng-icon name="lucideFilm" size="40" />
                </div>
              }
            </div>
            <p class="mt-2 text-xs text-muted">
              {{ v.originalFilename }} · {{ v.sizeBytes | bytes }}
              @if (v.durationSec) {
                · {{ v.durationSec | duration }}
              }
              @if (v.width && v.height) {
                · {{ v.width }}×{{ v.height }}
              }
            </p>
            @if (v.status === 'FAILED') {
              <app-alert kind="error" class="mt-2 block">{{ failReason(v) | transloco }}</app-alert>
            } @else if (v.status !== 'READY') {
              <p class="mt-2 text-xs text-muted">{{ stage(v) | transloco }} · {{ v.progress }}%</p>
              <app-progress-bar
                class="mt-1"
                [label]="'a11y.processing' | transloco"
                [value]="v.progress"
              />
            }
            @if (v.frames.length) {
              <h3 class="mt-5 mb-2 text-sm font-medium">
                {{ 'videos.edit.thumbnail' | transloco }}
              </h3>
              <p class="mb-2 text-xs text-muted">{{ 'videos.edit.pickFrame' | transloco }}</p>
              <!-- Frames in the video's own shape: tall ones in two rows of eight, so the dialog
                   stays as low as with wide ones. -->
              <div
                class="grid gap-1.5"
                [style.grid-template-columns]="'repeat(' + frameColumns() + ', minmax(0, 1fr))'"
                data-testid="edit-frames"
              >
                @for (f of v.frames; track f.index) {
                  <button
                    type="button"
                    class="overflow-hidden rounded-md border-2 transition-colors disabled:opacity-60"
                    [class.border-accent]="v.thumbnailFrameIndex === f.index"
                    [class.border-transparent]="v.thumbnailFrameIndex !== f.index"
                    [attr.aria-pressed]="v.thumbnailFrameIndex === f.index"
                    [attr.aria-label]="
                      'videos.edit.frameAt' | transloco: { time: f.timestampSec | duration }
                    "
                    [disabled]="busy()"
                    (click)="pickFrame(f.index)"
                  >
                    <img
                      [src]="f.url"
                      alt=""
                      class="w-full object-cover"
                      [style.aspect-ratio]="frameAspect()"
                      loading="lazy"
                    />
                  </button>
                }
              </div>
              @if (v.status === 'READY') {
                <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <label class="text-muted" for="vs-custom-second">{{
                    'videos.edit.customSecond' | transloco
                  }}</label>
                  <input
                    appInput="sm"
                    id="vs-custom-second"
                    type="number"
                    min="0"
                    step="0.1"
                    class="w-28"
                    [max]="v.durationSec ?? 0"
                    [(ngModel)]="customSecond"
                  />
                  <button
                    type="button"
                    appButton
                    size="sm"
                    variant="secondary"
                    [disabled]="busy()"
                    (click)="pickSecond()"
                  >
                    {{ 'videos.edit.setCustom' | transloco }}
                  </button>
                </div>
                @if (customPending()) {
                  <p class="mt-1 text-xs text-muted">
                    {{ 'videos.edit.customPending' | transloco }}
                  </p>
                }
              }
            }
          </div>
          <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
            <app-field [label]="'videos.edit.titleField' | transloco" [error]="err('title')">
              <input
                appInput
                type="text"
                formControlName="title"
                maxlength="150"
                [attr.aria-invalid]="!!err('title')"
              />
            </app-field>
            <app-field
              optional
              [label]="'videos.edit.description' | transloco"
              [error]="err('description')"
            >
              <textarea appInput rows="5" formControlName="description" maxlength="2000"></textarea>
            </app-field>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" formControlName="isPublic" class="mt-0.5" />
              <span>
                {{ 'videos.edit.makePublic' | transloco }}
                <span class="block text-xs text-muted">{{
                  'videos.edit.visibilityHint' | transloco
                }}</span>
              </span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" formControlName="sensitive" class="mt-0.5" />
              <span>
                {{ 'videos.edit.sensitiveFull' | transloco }}
                <span class="block text-xs text-muted">{{
                  'videos.edit.sensitiveHint' | transloco
                }}</span>
              </span>
            </label>
            <app-field [label]="'videos.edit.category' | transloco">
              <app-select formControlName="categoryId">
                <app-option [value]="''">{{ 'videos.edit.noCategory' | transloco }}</app-option>
                @for (c of categories.items(); track c.id) {
                  <app-option [value]="c.id">{{ c.name }}</app-option>
                }
              </app-select>
            </app-field>
            <div class="mt-auto flex flex-wrap items-center justify-end gap-2 pt-2">
              @if (confirmDelete()) {
                <span class="mr-auto inline-flex flex-wrap items-center gap-2 text-sm">
                  {{ 'video.confirmDelete' | transloco }}
                  <button
                    type="button"
                    appButton
                    variant="danger"
                    size="sm"
                    [disabled]="busy()"
                    (click)="remove()"
                  >
                    {{ 'video.confirmDeleteYes' | transloco }}
                  </button>
                  <button
                    type="button"
                    appButton
                    variant="ghost"
                    size="sm"
                    (click)="confirmDelete.set(false)"
                  >
                    {{ 'common.cancel' | transloco }}
                  </button>
                </span>
              } @else {
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  class="mr-auto text-danger"
                  (click)="confirmDelete.set(true)"
                >
                  {{ 'video.delete' | transloco }}
                </button>
              }
              <button type="button" appButton variant="ghost" (click)="close()">
                {{ 'common.cancel' | transloco }}
              </button>
              <button type="submit" appButton [disabled]="busy() || form.invalid">
                {{ (busy() ? 'common.saving' : 'common.save') | transloco }}
              </button>
            </div>
          </form>
        </div>
      } @else if (loadError(); as message) {
        <div class="p-5">
          <app-alert kind="error">{{ message }}</app-alert>
        </div>
      } @else {
        <div class="flex justify-center p-10 text-muted"><app-spinner /></div>
      }
    </div>
  `,
})
export class VideoEditDialog {
  protected readonly videoLink = videoLink;
  protected readonly videoState = videoState;
  protected readonly data = inject<VideoEditDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  /** Whether anything was saved: the shelf behind reloads only then. */
  private changed = false;
  protected readonly auth = inject(AuthStore);
  protected readonly categories = inject(CategoriesStore);
  private readonly api = inject(Api);
  private readonly store = inject(VideosStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly video = signal<VideoDetailDto | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** Width over height of the video's picture, 9:16 to 16:9 (16:9 until it is known). */
  protected readonly frameAspect = computed(() => {
    const v = this.video();
    if (!v?.width || !v.height) return 16 / 9;
    return Math.min(16 / 9, Math.max(9 / 16, v.width / v.height));
  });
  /** Wide: four a row; square: six; tall: eight — 16 frames take about the same height. */
  protected readonly frameColumns = computed(() => {
    const a = this.frameAspect();
    return a >= 1.2 ? 4 : a >= 0.8 ? 6 : 8;
  });
  protected readonly customPending = signal(false);
  protected readonly confirmDelete = signal(false);
  protected customSecond = 0;
  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(2000)]],
    isPublic: [false],
    sensitive: [false],
    categoryId: [''],
  });

  constructor() {
    void this.load();
    // Live updates from the store (websocket): merge status/progress/thumbnail; reload frames when they appear.
    effect(() => {
      const item = this.store.videos().find((v) => v.id === this.data.id);
      const current = untracked(this.video);
      if (!item || !current) return;
      if (item.thumbnailUrl !== current.thumbnailUrl) this.customPending.set(false);
      if (current.frames.length === 0 && item.contactSheetUrl) void this.load();
      else this.video.set({ ...current, ...item, frames: current.frames });
    });
  }

  private async load(): Promise<void> {
    try {
      const v = await this.store.detail(this.data.id);
      this.video.set(v);
      this.form.reset({
        title: v.title,
        description: v.description ?? '',
        isPublic: v.visibility === 'PUBLIC',
        sensitive: v.sensitive,
        categoryId: this.data.categoryId ?? '',
      });
    } catch (e) {
      this.loadError.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected stage = stageKey;
  protected failReason = failReasonKey;

  protected err(name: 'title' | 'description'): string | null {
    const e = fieldError(this.form.get(name));
    return e ? this.t.translate(e.key, e.params) : null;
  }

  async pickFrame(index: number): Promise<void> {
    await this.run(async () => {
      this.video.set(await this.store.setThumbnail(this.data.id, { frameIndex: index }));
      this.changed = true;
      this.customPending.set(false);
    });
  }

  async pickSecond(): Promise<void> {
    const v = this.video();
    if (!v || !v.durationSec) return;
    const t = Math.max(0, Math.min(v.durationSec, Number(this.customSecond) || 0));
    await this.run(async () => {
      await this.store.setThumbnail(this.data.id, { timestampSec: t });
      this.changed = true;
      this.customPending.set(true);
    });
  }

  async remove(): Promise<void> {
    await this.run(async () => {
      await this.store.remove(this.data.id);
      this.changed = true;
      this.toast.success(this.t.translate('video.deleted'));
      this.close();
    });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { title, description, isPublic, sensitive, categoryId } = this.form.getRawValue();
    await this.run(async () => {
      await this.store.update(this.data.id, {
        title,
        description,
        visibility: isPublic ? 'PUBLIC' : 'PRIVATE',
        sensitive,
      });
      if ((this.data.categoryId ?? '') !== categoryId)
        await this.api.invoke(videosUpdateHolding, {
          id: this.data.id,
          body: { categoryId: categoryId || null },
        });
      this.changed = true;
      this.toast.success(this.t.translate('common.saved'));
      this.close();
    });
  }

  protected close(): void {
    this.ref.close(this.changed);
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
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

import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideChevronUp,
  lucidePause,
  lucidePencil,
  lucidePlay,
  lucideRotateCw,
  lucideX,
} from '@ng-icons/lucide';

import { AuthStore } from '../../core/auth/auth.store';
import { CategoriesStore } from '../../core/categories/categories.store';
import { SiteConfig } from '../../core/site/site-config';
import { toApiError } from '../../core/api/api-error';
import { UploadStore, type UploadItem } from '../../core/upload/upload.store';
import { BytesPipe, formatBytes } from '../../shared/pipes/bytes.pipe';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { panelLink } from '../../core/navigation/panels';

const IN_PROGRESS = new Set(['queued', 'preparing', 'uploading', 'paused', 'finishing']);

/**
 * Bottom-right upload queue: progress, pause/resume/cancel, metadata while
 * uploading; the name stays editable after the upload and then renames the video.
 */
@Component({
  selector: 'app-upload-panel',
  imports: [
    RouterLink,
    SelectComponent,
    OptionComponent,
    TranslocoPipe,
    FormsModule,
    NgIcon,
    BytesPipe,
    ProgressBarComponent,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideX,
      lucidePause,
      lucidePencil,
      lucidePlay,
      lucideRotateCw,
      lucideCheck,
    }),
  ],
  template: `
    @if (store.panelOpen() && store.items().length) {
      <aside
        class="fixed right-4 bottom-4 z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-float"
        [class]="store.collapsed() ? 'w-auto' : 'w-[min(440px,calc(100vw-2rem))]'"
        [attr.aria-label]="'upload.panelTitle' | transloco"
        data-testid="upload-panel"
      >
        <header
          class="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold"
          [class.border-b]="!store.collapsed()"
        >
          <span class="flex items-center gap-1.5">
            @if (store.collapsed() && !store.activeCount()) {
              <ng-icon name="lucideCheck" size="16" class="text-success" />
            }
            {{ 'upload.panelTitle' | transloco }}
            @if (store.activeCount()) {
              ({{ store.activeCount() }})
            }
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
              [attr.aria-label]="
                (store.collapsed() ? 'upload.expand' : 'upload.collapse') | transloco
              "
              (click)="store.collapsed.set(!store.collapsed())"
            >
              <ng-icon
                [name]="store.collapsed() ? 'lucideChevronUp' : 'lucideChevronDown'"
                size="16"
              />
            </button>
            <button
              type="button"
              class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
              [attr.aria-label]="'upload.close' | transloco"
              [disabled]="store.activeCount() > 0"
              (click)="close()"
            >
              <ng-icon name="lucideX" size="16" />
            </button>
          </div>
        </header>
        @if (!store.collapsed()) {
          <ul class="max-h-[50vh] overflow-y-auto">
            @for (item of store.items(); track item.id) {
              <li class="border-b border-border px-3 py-2 text-sm last:border-b-0">
                <div class="flex items-start gap-2">
                  <!-- The name once, editable in place: before the upload ends it goes with the
                       upload, after that it renames the video. The file's own name only shows
                       where it matters (a restored upload asks for that file again). -->
                  <div class="group/title min-w-0 flex-1">
                    @if (item.status === 'cancelled') {
                      <p class="truncate py-0.5 font-medium text-muted">{{ item.meta.title }}</p>
                    } @else {
                      <div class="relative -mx-1.5">
                        <input
                          type="text"
                          maxlength="150"
                          class="w-full truncate rounded-sm border border-transparent bg-transparent py-0.5 pr-6 pl-1.5 font-medium outline-none transition-colors group-hover/title:border-border focus:border-line focus:bg-canvas"
                          [ngModel]="item.meta.title"
                          (ngModelChange)="store.updateMeta(item.id, { title: $event })"
                          (blur)="saveTitle(item)"
                          (keydown.enter)="blur($event)"
                          (keydown.escape)="revert(item, $event)"
                          [placeholder]="'upload.titlePlaceholder' | transloco"
                          [attr.aria-label]="'upload.rename' | transloco"
                          data-testid="upload-title"
                        />
                        <ng-icon
                          name="lucidePencil"
                          size="12"
                          class="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-faint opacity-0 transition-opacity group-hover/title:opacity-100"
                        />
                      </div>
                    }
                    <p class="mt-0.5 truncate text-xs text-muted" [attr.title]="item.filename">
                      @if (item.status === 'needsFile') {
                        {{ item.filename }} ·
                      }
                      {{ item.size | bytes }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-0.5">
                    @switch (item.status) {
                      @case ('paused') {
                        <button
                          type="button"
                          class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                          [attr.aria-label]="'upload.resume' | transloco"
                          (click)="store.resume(item.id)"
                        >
                          <ng-icon name="lucidePlay" size="16" />
                        </button>
                      }
                      @case ('error') {
                        <button
                          type="button"
                          class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                          [attr.aria-label]="'upload.retry' | transloco"
                          (click)="store.resume(item.id)"
                        >
                          <ng-icon name="lucideRotateCw" size="16" />
                        </button>
                      }
                      @case ('done') {
                        <ng-icon name="lucideCheck" size="16" class="m-1 text-success" />
                      }
                      @case ('cancelled') {}
                      @case ('needsFile') {}
                      @default {
                        <button
                          type="button"
                          class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                          [attr.aria-label]="'upload.pause' | transloco"
                          (click)="store.pause(item.id)"
                        >
                          <ng-icon name="lucidePause" size="16" />
                        </button>
                      }
                    }
                    @if (inProgress(item)) {
                      <button
                        type="button"
                        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                        [attr.aria-label]="'upload.cancel' | transloco"
                        (click)="store.cancel(item.id)"
                      >
                        <ng-icon name="lucideX" size="16" />
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
                        [attr.aria-label]="'upload.remove' | transloco"
                        (click)="store.remove(item.id)"
                      >
                        <ng-icon name="lucideX" size="16" />
                      </button>
                    }
                  </div>
                </div>
                @if (item.held && item.duplicateOf; as dup) {
                  <!-- On the shelf already: it waits for a word. -->
                  <div
                    class="mt-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs"
                    data-testid="upload-duplicate"
                  >
                    <p>{{ 'upload.duplicate.found' | transloco: { title: dup.title } }}</p>
                    <div class="mt-1 flex flex-wrap gap-3">
                      <button
                        type="button"
                        class="font-semibold underline decoration-accent decoration-2 underline-offset-4"
                        (click)="store.skip(item.id)"
                        data-testid="upload-skip"
                      >
                        {{ 'upload.duplicate.skip' | transloco }}
                      </button>
                      <button
                        type="button"
                        class="text-muted underline underline-offset-4 hover:text-text"
                        (click)="store.uploadAnyway(item.id)"
                        data-testid="upload-anyway"
                      >
                        {{ 'upload.duplicate.anyway' | transloco }}
                      </button>
                    </div>
                  </div>
                }
                @if (inProgress(item)) {
                  <div class="mt-2 flex items-center gap-2 text-xs text-muted">
                    <app-progress-bar
                      class="flex-1"
                      [label]="'a11y.upload' | transloco"
                      [value]="percent(item)"
                      [indeterminate]="item.status === 'finishing' || item.status === 'preparing'"
                    />
                    <span class="w-28 text-right">
                      {{ 'upload.status.' + item.status | transloco }}
                      @if (item.status === 'uploading' || item.status === 'paused') {
                        {{ percent(item) }}%
                      }
                    </span>
                  </div>
                } @else {
                  <p
                    class="mt-1 text-xs"
                    [class.text-danger]="item.status === 'error'"
                    [class.text-success]="item.status === 'done'"
                    [class.text-muted]="item.status === 'cancelled' || item.status === 'needsFile'"
                  >
                    {{ item.error || ('upload.status.' + item.status | transloco) }}
                    @if (item.errorCode === 'quotaExceeded' && offerPro()) {
                      <a
                        [routerLink]="panelLink('pro')"
                        [queryParamsHandling]="'merge'"
                        class="ml-1 font-semibold text-text underline decoration-accent decoration-2 underline-offset-2"
                        data-testid="upload-more-pro"
                        >{{ 'upload.morePro' | transloco }}</a
                      >
                    }
                  </p>
                }
                @if (item.status !== 'done' && item.status !== 'cancelled') {
                  <div class="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <label class="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        [ngModel]="item.meta.visibility === 'PUBLIC'"
                        (ngModelChange)="
                          store.updateMeta(item.id, { visibility: $event ? 'PUBLIC' : 'PRIVATE' })
                        "
                      />
                      {{ 'videos.visibility.PUBLIC' | transloco }}
                    </label>
                    <label class="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        [ngModel]="item.meta.sensitive"
                        (ngModelChange)="store.updateMeta(item.id, { sensitive: $event })"
                      />
                      {{ 'videos.edit.sensitive' | transloco }}
                    </label>
                    @if (categories.items().length) {
                      <app-select
                        size="sm"
                        class="w-auto max-w-40"
                        [ngModel]="item.meta.categoryId ?? ''"
                        (ngModelChange)="store.updateMeta(item.id, { categoryId: $event || null })"
                        [ariaLabel]="'videos.edit.category' | transloco"
                      >
                        <app-option [value]="''">{{
                          'videos.edit.noCategory' | transloco
                        }}</app-option>
                        @for (c of categories.items(); track c.id) {
                          <app-option [value]="c.id">{{ c.name }}</app-option>
                        }
                      </app-select>
                    }
                    @if (item.status === 'needsFile') {
                      <label class="inline-flex cursor-pointer items-center gap-1 text-accent-text">
                        <input type="file" class="hidden" (change)="attach(item, $event)" />
                        {{ 'upload.chooseFile' | transloco }}
                      </label>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      </aside>
    }
  `,
})
export class UploadPanelComponent {
  protected readonly panelLink = panelLink;
  protected readonly store = inject(UploadStore);
  private readonly site = inject(SiteConfig);
  private readonly auth = inject(AuthStore);
  /** Out of room on Free in the cloud: Pro has more. */
  protected readonly offerPro = computed(
    () => this.site.hasTiers() && this.auth.user()?.plan.tier !== 'PREMIUM',
  );
  protected readonly categories = inject(CategoriesStore);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  constructor() {
    // Once everything has finished the panel tucks itself into a small chip after a moment, so
    // it stops covering the page; the chip expands again on demand. Not while the
    // pointer is over it or a name is being typed in it: then it waits for another moment.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasActive = false;
    const tuck = () => {
      if (host.matches(':hover') || host.contains(document.activeElement))
        timer = setTimeout(tuck, 4000);
      else untracked(() => this.store.collapsed.set(true));
    };
    effect(() => {
      const active = this.store.activeCount() > 0;
      const finished = wasActive && !active;
      wasActive = active;
      clearTimeout(timer);
      if (finished) timer = setTimeout(tuck, 4000);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  protected inProgress(item: UploadItem): boolean {
    return IN_PROGRESS.has(item.status);
  }

  protected percent(item: UploadItem): number {
    return item.size > 0 ? Math.floor((item.uploadedBytes / item.size) * 100) : 0;
  }

  /** A finished upload renames its video when the field is left (Enter leaves it too). */
  protected saveTitle(item: UploadItem): void {
    this.store
      .saveTitle(item.id)
      .catch((e: unknown) =>
        this.toast.error(toApiError(e).message || this.t.translate('errors.unknown')),
      );
  }

  protected blur(event: Event): void {
    (event.target as HTMLInputElement).blur();
  }

  /** Esc drops the edit: the saved name of a finished upload comes back. */
  protected revert(item: UploadItem, event: Event): void {
    const current = this.store.items().find((i) => i.id === item.id);
    if (current?.savedTitle !== null && current?.savedTitle !== undefined)
      this.store.updateMeta(item.id, { title: current.savedTitle });
    this.blur(event);
  }

  protected attach(item: UploadItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.store.attachFile(item.id, file))
      this.toast.error(
        this.t.translate('upload.fileMismatch', {
          name: item.filename,
          size: formatBytes(item.size),
        }),
      );
  }

  protected close(): void {
    this.store.clearFinished();
    this.store.panelOpen.set(false);
  }
}

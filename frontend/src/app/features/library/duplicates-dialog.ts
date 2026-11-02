import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, type Injector, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideFilm, lucideX } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';

import {
  Api,
  type DuplicateGroupDto,
  type DuplicateVideoDto,
  myCollectionDeleteVideos,
  myCollectionDuplicates,
  myCollectionRemoveVideos,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';

/**
 * The likely same videos of the own shelf, group by group with why they look alike — the
 * same file, the same file name and length, or a close title and the same length — and in each,
 * "keep this one": the others go (own uploads to the trash, received copies off the shelf).
 */
@Component({
  selector: 'app-duplicates-dialog',
  imports: [TranslocoPipe, NgIcon, BytesPipe, AppDatePipe, ButtonDirective, SpinnerComponent],
  providers: [provideIcons({ lucideCheck, lucideFilm, lucideX })],
  template: `
    <section
      class="flex max-h-[90dvh] w-[min(880px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-hard"
      role="dialog"
      [attr.aria-label]="'library.duplicates.title' | transloco"
      data-testid="duplicates"
    >
      <header class="flex items-center gap-3 border-b-2 border-line px-5 py-3">
        <h2 class="font-display text-lg font-bold tracking-tight">
          {{ 'library.duplicates.title' | transloco }}
        </h2>
        <span class="flex-1"></span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'common.close' | transloco"
          (click)="ref.close(changed())"
        >
          <ng-icon name="lucideX" size="18" />
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        @if (loading()) {
          <div class="flex justify-center py-12 text-muted"><app-spinner /></div>
        } @else if (!groups().length) {
          <p class="py-12 text-center text-muted" data-testid="duplicates-none">
            {{ 'library.duplicates.none' | transloco }}
          </p>
        } @else {
          <p class="mb-4 text-sm text-muted">{{ 'library.duplicates.lead' | transloco }}</p>
          <ol class="flex flex-col gap-4">
            @for (g of groups(); track $index) {
              <li class="rounded-lg border-2 border-line/25 p-3" data-testid="duplicate-group">
                <p class="label-mono mb-2 text-muted">
                  {{ 'library.duplicates.reason.' + g.reason | transloco }}
                </p>
                <ul class="flex flex-col gap-2">
                  @for (v of g.videos; track v.id) {
                    <li class="flex items-center gap-3">
                      <span
                        class="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2 text-muted"
                      >
                        @if (v.thumbnailUrl) {
                          <img [src]="v.thumbnailUrl" alt="" class="h-full w-full object-cover" />
                        } @else {
                          <ng-icon name="lucideFilm" size="16" />
                        }
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">{{ v.title }}</span>
                        <span class="label-mono text-muted"
                          >{{ length(v) }} · {{ v.sizeBytes | bytes }} ·
                          {{ v.addedAt | appDate: 'mediumDate' }}</span
                        >
                      </span>
                      <button
                        type="button"
                        appButton
                        variant="secondary"
                        size="sm"
                        [disabled]="busy()"
                        (click)="keep(g, v)"
                        data-testid="duplicate-keep"
                      >
                        <ng-icon name="lucideCheck" size="14" />{{
                          'library.duplicates.keep' | transloco
                        }}
                      </button>
                    </li>
                  }
                </ul>
              </li>
            }
          </ol>
        }
      </div>
    </section>
  `,
})
export class DuplicatesDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(Api);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly groups = signal<DuplicateGroupDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  /** Read by the opener too: an Escape closes the dialog without a result. */
  readonly changed = signal(false);

  constructor() {
    void this.load();
  }

  protected length(v: DuplicateVideoDto): string {
    if (!v.durationSec) return '—';
    const s = Math.round(v.durationSec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** This one stays; the rest of the group goes, after a word. */
  protected async keep(group: DuplicateGroupDto, kept: DuplicateVideoDto): Promise<void> {
    const others = group.videos.filter((v) => v.id !== kept.id);
    const ok = await this.confirm.confirm({
      title: this.t.translate('library.duplicates.confirmTitle', { count: others.length }),
      message: this.t.translate('library.duplicates.confirmText', { title: kept.title }),
      confirmLabel: this.t.translate('library.duplicates.confirm'),
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const own = others.filter((v) => v.source === 'AUTHOR').map((v) => v.id);
      const received = others.filter((v) => v.source !== 'AUTHOR').map((v) => v.id);
      if (own.length) await this.api.invoke(myCollectionDeleteVideos, { body: { videoIds: own } });
      if (received.length)
        await this.api.invoke(myCollectionRemoveVideos, { body: { videoIds: received } });
      this.changed.set(true);
      this.groups.update((list) => list.filter((g) => g !== group));
      this.toast.success(this.t.translate('library.duplicates.done', { count: others.length }));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.groups.set((await this.api.invoke(myCollectionDuplicates)).groups);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loading.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class DuplicatesDialog {
  private readonly dialog = inject(Dialog);

  /** Resolves true when videos went (the shelf reloads). */
  async open(injector?: Injector): Promise<boolean> {
    const ref = this.dialog.open<boolean, unknown, DuplicatesDialogComponent>(
      DuplicatesDialogComponent,
      {
        backdropClass: 'vs-backdrop',
        injector,
      },
    );
    const dialog = ref.componentInstance;
    return (await firstValueFrom(ref.closed)) ?? dialog?.changed() ?? false;
  }
}

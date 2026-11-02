import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { Api, myCollectionRenameMany } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { DEFAULT_CLEANUP, type TitleCleanup, cleanTitle } from '../../shared/titles/clean-title';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { titleOr } from '../../shared/forms/limits';

export interface TitleCleanupData {
  videos: { id: string; title: string }[];
}

/** The API renames at most this many at once (backend BULK_MAX). */
const PART = 200;

/**
 * Tidier titles for the picked videos at once: what to clean — separators, a file's words,
 * the first letter — and a find and replace of one's own, with every "before → after" shown before
 * anything is saved. Own videos are renamed; received ones get the owner's own name for them.
 */
@Component({
  selector: 'app-title-cleanup-dialog',
  imports: [FormsModule, TranslocoPipe, ButtonDirective, InputDirective],
  template: `
    <form
      class="flex max-h-[90dvh] w-[min(640px,calc(100vw-2rem))] flex-col rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'library.cleanup.title' | transloco"
      (ngSubmit)="apply()"
      data-testid="title-cleanup"
    >
      <h2 class="text-base font-semibold">
        {{ 'library.cleanup.title' | transloco: { count: data.videos.length } }}
      </h2>
      <p class="mt-1 text-sm text-muted">{{ 'library.cleanup.lead' | transloco }}</p>

      <fieldset class="mt-4 flex flex-col gap-1.5 text-sm">
        @for (opt of switches; track opt) {
          <label class="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              [checked]="options()[opt]"
              (change)="toggle(opt)"
              [attr.data-testid]="'cleanup-' + opt"
            />
            {{ 'library.cleanup.' + opt | transloco }}
          </label>
        }
      </fieldset>
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="label-mono text-muted">{{ 'library.cleanup.find' | transloco }}</span>
          <input
            appInput="sm"
            name="find"
            maxlength="100"
            [ngModel]="options().find"
            (ngModelChange)="set('find', $event)"
            data-testid="cleanup-find"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="label-mono text-muted">{{ 'library.cleanup.replace' | transloco }}</span>
          <input
            appInput="sm"
            name="replace"
            maxlength="100"
            [ngModel]="options().replace"
            (ngModelChange)="set('replace', $event)"
          />
        </label>
      </div>

      <p class="label-mono mt-4 mb-1.5 text-muted">
        {{ 'library.cleanup.preview' | transloco: { count: changes().length } }}
      </p>
      <ul
        class="min-h-24 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border text-sm"
        data-testid="cleanup-preview"
      >
        @for (row of preview(); track row.id) {
          @if (row.after === row.before) {
            <li class="truncate px-3 py-1.5 text-faint">{{ row.before }}</li>
          } @else {
            <li class="grid gap-0.5 px-3 py-1.5">
              <span class="truncate text-muted line-through decoration-faint">{{
                row.before
              }}</span>
              <span class="truncate font-medium">{{ row.after }}</span>
            </li>
          }
        }
      </ul>

      @if (error(); as message) {
        <p class="mt-3 text-sm text-danger">{{ message }}</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(false)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          appButton
          [disabled]="!changes().length || busy()"
          data-testid="cleanup-apply"
        >
          {{ 'library.cleanup.apply' | transloco: { count: changes().length } }}
        </button>
      </div>
    </form>
  `,
})
export class TitleCleanupDialogComponent {
  protected readonly data = inject<TitleCleanupData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly switches = ['separators', 'junk', 'capitalize'] as const;
  protected readonly options = signal<TitleCleanup>({ ...DEFAULT_CLEANUP });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly rows = computed(() =>
    this.data.videos.map((v) => ({
      id: v.id,
      before: v.title,
      // A cleanup that leaves nothing keeps the title as it was.
      after: titleOr(cleanTitle(v.title, this.options()), v.title),
    })),
  );
  protected readonly changes = computed(() => this.rows().filter((r) => r.after !== r.before));
  /** What changes first, then what stays: up to a hundred lines. */
  protected readonly preview = computed(() =>
    [...this.changes(), ...this.rows().filter((r) => r.after === r.before)].slice(0, 100),
  );

  protected toggle(key: 'separators' | 'junk' | 'capitalize'): void {
    this.options.update((o) => ({ ...o, [key]: !o[key] }));
  }

  protected set(key: 'find' | 'replace', value: string): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }

  protected async apply(): Promise<void> {
    const items = this.changes().map((r) => ({ videoId: r.id, title: r.after }));
    if (!items.length || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      let updated = 0;
      for (let i = 0; i < items.length; i += PART)
        updated += (
          await this.api.invoke(myCollectionRenameMany, {
            body: { items: items.slice(i, i + PART) },
          })
        ).updated;
      this.toast.success(this.t.translate('library.cleanup.done', { count: updated }));
      this.ref.close(true);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class TitleCleanupService {
  private readonly dialog = inject(Dialog);

  /** Resolves true when titles were saved. */
  async open(videos: { id: string; title: string }[]): Promise<boolean> {
    const ref = this.dialog.open<boolean>(TitleCleanupDialogComponent, {
      data: { videos } satisfies TitleCleanupData,
      backdropClass: 'vs-backdrop',
    });
    return (await firstValueFrom(ref.closed)) ?? false;
  }
}

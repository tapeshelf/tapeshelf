import { Component, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolder } from '@ng-icons/lucide';

import { type FolderPictureDto, type ShelfFolderDto } from '../../api';
import { SensitiveContentService } from '../../core/content/sensitive.service';

/**
 * The shelf's categories as cards (the "Folders" view): the chosen cover or the latest four
 * pictures, the name, how many videos and how long together. A card opens its category.
 */
@Component({
  selector: 'app-shelf-folders',
  imports: [TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideFolder })],
  template: `
    <ul
      class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="folders"
    >
      @for (f of folders(); track f.id) {
        <li>
          <button
            type="button"
            class="group block w-full text-left outline-none"
            (click)="picked.emit(f.id)"
            data-testid="folder-card"
          >
            <span
              class="grid aspect-video gap-0.5 overflow-hidden rounded-md bg-surface-2 ring-line ring-offset-2 ring-offset-canvas group-focus-visible:ring-2"
              [class]="frame(f.pictures.length)"
            >
              @for (p of f.pictures; track p.videoId; let i = $index) {
                <span class="relative overflow-hidden" [class]="cell(f.pictures.length, i)">
                  <img
                    [src]="p.url"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    [class.blur-xl]="blurs(p)"
                  />
                </span>
              } @empty {
                <span class="flex items-center justify-center text-faint">
                  <ng-icon name="lucideFolder" size="28" />
                </span>
              }
            </span>
            <span
              class="mt-2.5 block truncate font-display text-base leading-tight font-bold tracking-tight group-hover:text-accent-text sm:text-lg"
              >{{ f.name }}</span
            >
            <span class="label-mono mt-0.5 block text-muted">
              {{ 'collection.folders.count' | transloco: { count: f.count } }}
              @if (f.durationSec) {
                · {{ length(f.durationSec) }}
              }
            </span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class ShelfFoldersComponent {
  readonly folders = input.required<readonly ShelfFolderDto[]>();
  readonly picked = output<string>();

  private readonly sensitive = inject(SensitiveContentService);
  private readonly t = inject(TranslocoService);

  /** One picture fills the card; two side by side; three: one big and two; four: a square of four. */
  protected frame(n: number): string {
    return n >= 3 ? 'grid-cols-2 grid-rows-2' : n === 2 ? 'grid-cols-2' : 'grid-cols-1';
  }

  protected cell(n: number, i: number): string {
    return n === 3 && i === 0 ? 'row-span-2' : '';
  }

  protected blurs(p: FolderPictureDto): boolean {
    return this.sensitive.blurs({ sensitive: p.sensitive, author: { id: p.authorId } });
  }

  /** "3 h 10 min", "45 min". */
  protected length(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.max(1, Math.round((sec % 3600) / 60));
    return h
      ? this.t.translate('collection.folders.hours', { h, m: Math.floor((sec % 3600) / 60) })
      : this.t.translate('collection.folders.minutes', { m });
  }
}

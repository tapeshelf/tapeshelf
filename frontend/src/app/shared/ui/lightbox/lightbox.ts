import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideExternalLink,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';

import { SensitiveContentService } from '../../../core/content/sensitive.service';

/** A picture to look at in full (a video's frame preview). */
export interface LightboxItem {
  url: string;
  title: string;
  /** "12:04 · 1.2 GB · 1080p" */
  meta?: string;
  /** Marked sensitive: shown once the viewer agreed. */
  sensitive?: boolean;
  /** The video's page, when the viewer may open it. */
  link?: unknown[] | null;
}

interface LightboxData {
  items: LightboxItem[];
  index: number;
}

@Component({
  selector: 'app-lightbox',
  imports: [NgIcon, RouterLink, TranslocoPipe],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucideExternalLink, lucideX })],
  host: {
    class: 'fixed inset-0 flex flex-col bg-black text-white',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': 'item().title',
    '(keydown.arrowleft)': 'go(-1)',
    '(keydown.arrowright)': 'go(1)',
    '(keydown.escape)': 'ref.close()',
    tabindex: '-1',
  },
  template: `
    <header class="flex items-center gap-3 px-4 py-3">
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{{ item().title }}</p>
        @if (item().meta) {
          <p class="label-mono text-white/60">{{ item().meta }}</p>
        }
      </div>
      @if (data.items.length > 1) {
        <span class="label-mono text-white/60">{{ index() + 1 }} / {{ data.items.length }}</span>
      }
      @if (item().link; as link) {
        <a
          [routerLink]="link"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-white/80 hover:bg-white/10"
          (click)="ref.close()"
          ><ng-icon name="lucideExternalLink" size="16" />{{ 'lightbox.open' | transloco }}</a
        >
      }
      <button
        type="button"
        class="rounded-md p-2 hover:bg-white/10"
        [attr.aria-label]="'common.close' | transloco"
        data-testid="lightbox-close"
        (click)="ref.close()"
      >
        <ng-icon name="lucideX" size="20" />
      </button>
    </header>
    <div class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
      <img
        [src]="item().url"
        [alt]="item().title"
        class="max-h-full max-w-full rounded object-contain shadow-float"
        data-testid="lightbox-image"
      />
      @if (data.items.length > 1) {
        <button
          type="button"
          class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/80"
          [attr.aria-label]="'lightbox.previous' | transloco"
          (click)="go(-1)"
        >
          <ng-icon name="lucideChevronLeft" size="24" />
        </button>
        <button
          type="button"
          class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/80"
          [attr.aria-label]="'lightbox.next' | transloco"
          (click)="go(1)"
        >
          <ng-icon name="lucideChevronRight" size="24" />
        </button>
      }
    </div>
  `,
})
export class LightboxComponent {
  protected readonly data = inject<LightboxData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly sensitive = inject(SensitiveContentService);
  protected readonly index = signal(this.data.index);
  protected readonly item = computed(() => this.data.items[this.index()]!);

  /** The next or previous picture; a sensitive one asks first, as everywhere. */
  protected async go(step: number): Promise<void> {
    const n = this.data.items.length;
    const next = (this.index() + step + n) % n;
    if (this.data.items[next]!.sensitive && !(await this.sensitive.ensure())) return;
    this.index.set(next);
  }
}

/** Full-screen pictures: click a frame preview anywhere and it opens over everything. */
@Injectable({ providedIn: 'root' })
export class Lightbox {
  private readonly dialog = inject(Dialog);
  private readonly sensitive = inject(SensitiveContentService);

  async open(items: LightboxItem[], index = 0): Promise<void> {
    const item = items[index];
    if (!item) return;
    if (item.sensitive && !(await this.sensitive.ensure())) return;
    this.dialog.open(LightboxComponent, {
      data: { items, index } satisfies LightboxData,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      panelClass: 'vs-lightbox',
      autoFocus: 'dialog',
    });
  }
}

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFilm, lucideLock, lucideX } from '@ng-icons/lucide';

import { Api, type ChatVideoDto, type CollectionItemDto, collectionList } from '../../api';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';

const PAGE = 60;

export interface VideoPickerData {
  /** The sender's username: their own collection is offered. */
  username: string;
}

/**
 * Pick a video from the own collection to attach to a message. Only what a visitor of the sender's
 * page could see is offered (the server checks the same rule): ready, not hidden, and no bookmark
 * of a video that turned private.
 */
@Component({
  selector: 'app-video-picker-dialog',
  imports: [
    TranslocoPipe,
    SensitiveBlurDirective,
    FormsModule,
    NgIcon,
    DurationPipe,
    AutofocusDirective,
    InputDirective,
    SpinnerComponent,
  ],
  providers: [provideIcons({ lucideFilm, lucideLock, lucideX })],
  template: `
    <div
      class="flex max-h-[85vh] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-hard"
      role="dialog"
      [attr.aria-label]="'chat.picker.title' | transloco"
    >
      <header class="flex items-center gap-3 border-b-2 border-line px-4 py-3">
        <h2 class="mr-auto font-display text-base font-semibold">
          {{ 'chat.picker.title' | transloco }}
        </h2>
        <input
          appInput="sm"
          type="search"
          class="w-48"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          [placeholder]="'chat.picker.search' | transloco"
          [attr.aria-label]="'chat.picker.search' | transloco"
          appAutofocus
        />
        <button
          type="button"
          class="rounded-sm p-1 text-muted hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'common.close' | transloco"
          (click)="ref.close()"
        >
          <ng-icon name="lucideX" size="18" />
        </button>
      </header>
      <div class="min-h-40 overflow-y-auto p-4">
        @if (!loaded()) {
          <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
        } @else if (shown().length === 0) {
          <p class="py-10 text-center text-sm text-muted">{{ 'chat.picker.empty' | transloco }}</p>
        } @else {
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="video-picker">
            @for (item of shown(); track item.video.id) {
              <button
                type="button"
                class="rounded-t-md border-2 border-line bg-surface text-left transition-[transform,box-shadow] duration-100 lift-hitbox hover:-translate-y-0.5 hover:shadow-hard-sm"
                [attr.aria-label]="item.video.title"
                (click)="pick(item)"
              >
                <span
                  class="relative block aspect-video overflow-hidden rounded-t-[4px] border-b-2 border-line bg-surface-2"
                >
                  @if (item.video.thumbnailUrl) {
                    <img
                      [src]="item.video.thumbnailUrl"
                      [appSensitiveBlur]="false"
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  } @else {
                    <span class="flex h-full items-center justify-center text-faint">
                      <ng-icon name="lucideFilm" size="24" />
                    </span>
                  }
                  @if (item.video.visibility === 'PRIVATE') {
                    <span
                      class="absolute top-1.5 left-1.5 rounded-sm border border-line bg-canvas p-0.5 text-ink"
                    >
                      <ng-icon name="lucideLock" size="11" />
                    </span>
                  }
                  @if (item.video.durationSec !== null) {
                    <span
                      class="absolute right-1.5 bottom-1.5 rounded-sm bg-inverse px-1 py-0.5 font-mono text-[10px] text-on-inverse"
                      >{{ item.video.durationSec | duration }}</span
                    >
                  }
                </span>
                <span class="block truncate px-2 py-1.5 text-[13px] font-semibold">{{
                  item.video.title
                }}</span>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class VideoPickerDialog {
  private readonly api = inject(Api);
  private readonly data = inject<VideoPickerData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ChatVideoDto>>(DialogRef);

  private readonly items = signal<CollectionItemDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items().filter(
      (i) =>
        i.video.status === 'READY' &&
        !i.hidden &&
        !(i.source === 'PUBLIC_ADD' && i.video.visibility === 'PRIVATE') &&
        (!q || i.video.title.toLowerCase().includes(q)),
    );
  });

  constructor() {
    void this.load();
  }

  protected pick(item: CollectionItemDto): void {
    this.ref.close({
      id: item.video.id,
      code: item.video.code,
      title: item.video.title,
      thumbnailUrl: item.video.thumbnailUrl,
      sensitive: item.video.sensitive,
      durationSec: item.video.durationSec,
      visibility: item.video.visibility,
      holderUsername: this.data.username,
    });
  }

  private async load(): Promise<void> {
    try {
      let offset = 0;
      // The whole own collection, page by page (owners rarely have thousands; the list stops at 600).
      for (let i = 0; i < 10; i++) {
        const page = await this.api.invoke(collectionList, {
          username: this.data.username,
          offset,
          limit: PAGE,
        });
        this.items.update((list) => [...list, ...page.items]);
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) break;
      }
    } finally {
      this.loaded.set(true);
    }
  }
}

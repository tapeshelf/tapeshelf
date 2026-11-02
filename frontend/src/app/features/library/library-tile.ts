import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideBookmark,
  lucideCheck,
  lucideDownload,
  lucideEyeOff,
  lucideFilm,
  lucideGlobe,
  lucideLock,
  lucideTriangleAlert,
  lucideUserRound,
} from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { type CollectionItemDto, type PageLayout } from '../../api';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { LanguageService } from '../../core/i18n/language.service';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { QualityPipe } from '../../shared/pipes/quality.pipe';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';
import { stageKey } from '../videos/video-status';
import { BylinePipe } from '../../shared/pipes/byline.pipe';

/**
 * One holding in the owner's file manager: a picture in the mosaic in
 * the video's own shape whose name and marks show on hover, or a row in the
 * list. Selection (Ctrl/Shift-click) rings it in orange with a check. Nothing on the
 * own shelf is ever blurred: every video here is one the owner may watch.
 */
@Component({
  selector: 'app-library-tile',
  imports: [
    BylinePipe,
    TranslocoPipe,
    AppDatePipe,
    NgIcon,
    BytesPipe,
    DurationPipe,
    QualityPipe,
    ProgressBarComponent,
    ThumbScrubComponent,
  ],
  providers: [
    provideIcons({
      lucideLock,
      lucideGlobe,
      lucideTriangleAlert,
      lucideFilm,
      lucideUserRound,
      lucideBookmark,
      lucideEyeOff,
      lucideDownload,
      lucideCheck,
      lucideFolder,
    }),
  ],
  host: {
    role: 'button',
    tabindex: '0',
    '[attr.aria-label]': 'label()',
    '[attr.data-video-id]': 'item().video.id',
    '[class]': 'hostClass()',
  },
  template: `
    @if (selected() && layout() === 'list') {
      <span
        class="pointer-events-none absolute top-1/2 -left-2.5 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-fg"
        aria-hidden="true"
        data-testid="tile-check"
      >
        <ng-icon name="lucideCheck" size="14" strokeWidth="3" />
      </span>
    }
    @if (layout() === 'list') {
      <div
        class="relative h-12 w-20 shrink-0 overflow-hidden rounded-sm border border-line bg-surface-2"
        data-morph
      >
        <app-thumb-scrub
          [thumbnailUrl]="item().video.thumbnailUrl"
          [frameUrls]="item().video.frameUrls"
          [alt]="''"
        >
          <ng-icon name="lucideFilm" size="18" />
        </app-thumb-scrub>
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 text-sm font-semibold">
          <span class="truncate">{{ item().video.title }}</span>
          @if (context(); as where) {
            <span class="label-mono shrink-0 font-normal text-muted" data-testid="tile-context">{{
              where
            }}</span>
          }
          @if (item().unseen) {
            <span
              class="shrink-0 rounded-sm bg-accent px-1 font-mono text-[10px] text-accent-fg"
              [attr.title]="'collection.newHint' | transloco"
              data-testid="new-badge"
              >{{ 'collection.new' | transloco }}</span
            >
          }
        </p>
        <p class="label-mono flex items-center gap-2 truncate text-muted">
          @if (item().source !== 'AUTHOR') {
            <span class="inline-flex items-center gap-1">
              <ng-icon name="lucideUserRound" size="12" />
              {{ 'collection.fromAuthor' | transloco: { name: authorName() } }}
            </span>
          }
          @if (item().video.status !== 'READY') {
            <span>{{ stage() | transloco }} · {{ item().video.progress }}%</span>
          }
        </p>
      </div>
      <!-- The owner's table: the same columns as its header. -->
      <span
        class="label-mono hidden w-32 shrink-0 truncate text-muted lg:block"
        data-testid="tile-category"
        >{{ category() ?? '—' }}</span
      >
      <span class="label-mono hidden w-14 shrink-0 text-muted md:block">{{
        (item().video | quality) ?? '—'
      }}</span>
      <span class="label-mono hidden w-28 shrink-0 text-muted sm:block">
        {{ item().addedAt | appDate: 'mediumDate' }}
      </span>
      <span class="label-mono hidden w-20 shrink-0 text-right text-muted sm:block">
        {{ item().video.sizeBytes | bytes }}
      </span>
      <span class="label-mono w-16 shrink-0 text-right text-muted">
        @if (item().video.durationSec !== null) {
          {{ item().video.durationSec | duration }}
        }
      </span>
      <span class="flex w-20 shrink-0 justify-end gap-1 text-muted">
        <ng-icon
          [name]="item().video.visibility === 'PRIVATE' ? 'lucideLock' : 'lucideGlobe'"
          size="14"
          [attr.aria-label]="'videos.visibility.' + item().video.visibility | transloco"
        />
        @if (item().video.sensitive) {
          <ng-icon
            name="lucideTriangleAlert"
            size="14"
            role="img"
            [attr.aria-label]="'sensitive.label' | transloco"
            [attr.title]="'sensitive.label' | transloco"
          />
        }
        @if (item().hidden) {
          <ng-icon
            name="lucideEyeOff"
            size="14"
            [attr.aria-label]="'collection.hidden' | transloco"
          />
        }
        @if (item().source === 'PUBLIC_ADD') {
          <ng-icon
            name="lucideBookmark"
            size="14"
            [attr.aria-label]="'collection.bookmark' | transloco"
          />
        }
      </span>
    } @else {
      <!-- The picture is the tile: the video's own shape, square corners;
           its name and length show on hover (always on touch screens). -->
      <!-- A drag resting on it: the picture ducks a little and two card edges show
           above it, the pile the drop would make. -->
      @if (armed()) {
        <span
          class="pile-in pointer-events-none absolute top-0 right-[9%] left-[9%] h-2.5 rounded-t-[3px] bg-ink/35"
          aria-hidden="true"
        ></span>
        <span
          class="pile-in pointer-events-none absolute top-[6px] right-[4.5%] left-[4.5%] h-2.5 rounded-t-[3px] bg-ink/55"
          aria-hidden="true"
        ></span>
      }
      <div
        class="relative origin-bottom overflow-hidden bg-surface-2 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        [class.scale-[0.93]]="armed()"
        [style.height.px]="height()"
        data-morph
      >
        <div
          class="h-full w-full transition-transform duration-300 ease-out"
          [class.scale-[0.92]]="selected()"
        >
          <app-thumb-scrub
            [thumbnailUrl]="item().video.thumbnailUrl"
            [frameUrls]="item().video.frameUrls"
            [alt]="''"
          >
            <ng-icon name="lucideFilm" size="28" />
          </app-thumb-scrub>
        </div>
        <span
          class="pointer-events-none absolute inset-0 opacity-0 ring-2 ring-ink ring-inset group-focus-visible:opacity-100"
          aria-hidden="true"
        ></span>
        @if (armed()) {
          <span
            class="pointer-events-none absolute inset-0 ring-[3px] ring-accent ring-inset"
            aria-hidden="true"
          ></span>
        }
        @if (selected()) {
          <span
            class="pointer-events-none absolute inset-0 ring-[3px] ring-accent ring-inset"
            aria-hidden="true"
          ></span>
          <span
            class="pointer-events-none absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg"
            aria-hidden="true"
            data-testid="tile-check"
          >
            <ng-icon name="lucideCheck" size="14" strokeWidth="3" />
          </span>
        }
        @if (cover()) {
          <span
            class="tile-chip pointer-events-none absolute top-2 left-2 z-10 text-[10.5px] font-semibold"
            data-testid="cover-chip"
            >{{ 'stacks.cover' | transloco }}</span
          >
        }
        @if (item().unseen && !selected()) {
          <!-- Received and not opened yet: quiet, always there, gone once opened. -->
          <span
            class="pointer-events-none absolute top-2 right-2 z-10 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold text-accent-fg"
            [attr.title]="'collection.newHint' | transloco"
            data-testid="new-badge"
            >{{ 'collection.new' | transloco }}</span
          >
        }
        @if (context(); as where) {
          <!-- Where a search found it: the video's category, always in sight. -->
          <span
            class="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[70%] items-center gap-1 rounded-sm bg-scrim px-1.5 py-0.5 font-mono text-[10px] leading-none text-white"
            data-testid="tile-context"
            ><ng-icon name="lucideFolder" size="11" class="shrink-0" /><span class="truncate">{{
              where
            }}</span></span
          >
        }
        <div
          class="tile-reveal pointer-events-none absolute top-2 left-2 flex gap-1"
          [class.top-9]="cover() || !!context()"
        >
          @if (item().video.visibility === 'PUBLIC') {
            <span class="tile-chip" [attr.title]="'videos.visibility.PUBLIC' | transloco">
              <ng-icon name="lucideGlobe" size="12" />
            </span>
          }
          @if (item().source !== 'AUTHOR') {
            <span
              class="tile-chip"
              [attr.title]="'collection.fromAuthor' | transloco: { name: authorName() }"
            >
              <ng-icon
                [name]="item().source === 'PUBLIC_ADD' ? 'lucideBookmark' : 'lucideUserRound'"
                size="12"
              />
            </span>
          }
          @if (item().video.sensitive && !sensitive.allowed()) {
            <span class="tile-chip" [attr.title]="'sensitive.label' | transloco">
              <ng-icon name="lucideTriangleAlert" size="12" />
            </span>
          }
          @if (item().hidden) {
            <span class="tile-chip" [attr.title]="'collection.hidden' | transloco">
              <ng-icon name="lucideEyeOff" size="12" />
            </span>
          }
        </div>
        @if (item().video.status === 'FAILED') {
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-danger px-2 py-1.5 text-[11px] font-semibold text-white"
          >
            <ng-icon name="lucideTriangleAlert" size="12" />
            {{ 'videos.status.FAILED' | transloco }}
          </div>
        } @else if (item().video.status !== 'READY') {
          <div
            class="pointer-events-none absolute inset-x-2 bottom-2 rounded-sm bg-canvas/90 px-2 py-1.5 text-[11px]"
          >
            <div class="label-mono mb-1 flex justify-between">
              <span>{{ stage() | transloco }}</span>
              <span>{{ item().video.progress }}%</span>
            </div>
            <app-progress-bar
              [label]="'a11y.processing' | transloco"
              [value]="item().video.progress"
              [indeterminate]="indeterminate()"
            />
          </div>
        } @else {
          <div class="tile-caption">
            <span class="min-w-0 flex-1 truncate text-[12.5px] leading-4 font-medium">{{
              item().video.title
            }}</span>
            @if (item().source !== 'AUTHOR') {
              <span class="max-w-[35%] shrink-0 truncate font-mono text-[10.5px] text-white/75">{{
                item().video.author.guest
                  ? ('common.guest' | transloco)
                  : (item().video.author | byline) || ('common.anonymous' | transloco)
              }}</span>
            }
            <!-- The quality as YouTube names it, beside the length. -->
            @if (item().video | quality; as q) {
              <span
                class="shrink-0 rounded-[3px] bg-white/90 px-1 font-mono text-[9.5px] leading-[14px] font-bold text-black"
                data-testid="tile-quality"
                >{{ q }}</span
              >
            }
            @if (item().video.durationSec !== null) {
              <span class="shrink-0 font-mono text-[10.5px] text-white/85">{{
                item().video.durationSec | duration
              }}</span>
            }
          </div>
        }
      </div>
    }
  `,
})
export class LibraryTileComponent {
  private readonly t = inject(TranslocoService);
  /** A guest who uploaded it in an exchange is "Guest". */
  protected authorName(): string {
    const a = this.item().video.author;
    return a.guest ? this.t.translate('common.guest') : a.displayName;
  }
  private readonly language = inject(LanguageService);
  protected readonly sensitive = inject(SensitiveContentService);
  readonly item = input.required<CollectionItemDto>();
  /** Where a search found it: the category's name, or null. */
  readonly context = input<string | null>(null);
  /** Its category's name, for the owner's table. */
  readonly category = input<string | null>(null);
  readonly layout = input<PageLayout>('grid');
  /** Height of the picture in the mosaic, px; the width follows from the tile. */
  readonly height = input<number | null>(null);
  readonly selected = input(false);
  readonly dropBefore = input<'before' | 'after' | null>(null);
  /** A drag rests on it: dropping now stacks the dragged videos with this one. */
  readonly armed = input(false);
  /** Inside an open stack: this video is on its cover. */
  readonly cover = input(false);

  protected readonly stage = computed(() => stageKey(this.item().video));
  protected readonly indeterminate = computed(
    () => this.item().video.status === 'QUEUED' && this.item().video.progress === 0,
  );
  protected readonly label = computed(() => {
    this.language.loaded();
    return this.selected()
      ? this.t.translate('library.selectedTile', { title: this.item().video.title })
      : this.item().video.title;
  });
  protected readonly hostClass = computed(() => {
    const list = this.layout() === 'list';
    // Not ready: nothing to open, only to pick, move or delete.
    const cursor = this.item().video.status === 'READY' ? 'cursor-pointer ' : 'cursor-default ';
    const base = 'group relative select-none text-left outline-none ' + cursor;
    const shape = list
      ? 'flex items-center gap-3 rounded-md border px-2 py-1.5 transition-colors hover:bg-surface-2 focus-visible:border-line ' +
        (this.selected() ? 'border-accent bg-accent-soft ' : 'border-transparent ')
      : 'block ';
    const drop =
      this.dropBefore() === 'before'
        ? 'before:absolute before:inset-y-0 before:-left-[6px] before:z-10 before:w-[3px] before:bg-accent before:content-[""] '
        : this.dropBefore() === 'after'
          ? 'after:absolute after:inset-y-0 after:-right-[6px] after:z-10 after:w-[3px] after:bg-accent after:content-[""] '
          : '';
    return base + shape + drop;
  });
}

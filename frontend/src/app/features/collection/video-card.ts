import { Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookmark,
  lucideCheck,
  lucideFilm,
  lucideLock,
  lucideTriangleAlert,
  lucideFolder,
} from '@ng-icons/lucide';

import { type CollectionItemDto, type PageLayout } from '../../api';
import { AuthStore } from '../../core/auth/auth.store';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { VisitorPreview } from '../../core/preview/visitor-preview.service';
import { VideoMorph } from '../../core/navigation/video-morph';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { QualityPipe } from '../../shared/pipes/quality.pipe';
import { aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';
import { videoLink, videoState } from '../../core/navigation/user-links';
import { BylinePipe } from '../../shared/pipes/byline.pipe';

/**
 * A video on someone's shelf: a picture in the mosaic in the video's own shape
 * whose name shows on hover; links to the video in this holder's context and grows
 * into its player on the way. Private videos a visitor may request can be
 * picked: in selection mode by a click, at any time by Ctrl/Shift-click.
 */
@Component({
  selector: 'app-video-card',
  imports: [
    BylinePipe,
    RouterLink,
    TranslocoPipe,
    NgIcon,
    DurationPipe,
    QualityPipe,
    ThumbScrubComponent,
  ],
  providers: [
    provideIcons({
      lucideLock,
      lucideBookmark,
      lucideFilm,
      lucideCheck,
      lucideTriangleAlert,
      lucideFolder,
    }),
  ],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="selectable() || restricted() ? null : videoLink(item().video.code)"
      [state]="videoState(username())"
      class="group relative cursor-pointer outline-none"
      [class]="
        layout() === 'list'
          ? 'flex items-center gap-3 rounded-md border px-2 py-1.5 transition-colors hover:bg-surface-2 focus-visible:border-line ' +
            (selected() ? 'border-accent bg-accent-soft' : 'border-transparent')
          : 'block'
      "
      [attr.role]="selectable() ? 'checkbox' : restricted() ? 'button' : null"
      [attr.aria-checked]="selectable() ? selected() : null"
      [attr.tabindex]="selectable() || restricted() ? 0 : null"
      [attr.data-video-id]="item().video.id"
      (click)="onClick($event)"
      (keydown.space)="onClick($event)"
      (keydown.enter)="onClick($event)"
    >
      @if (layout() === 'list') {
        <div class="relative h-12 w-20 shrink-0 overflow-hidden rounded-sm bg-surface-2" data-morph>
          <app-thumb-scrub
            [thumbnailUrl]="item().video.thumbnailUrl"
            [frameUrls]="item().video.frameUrls"
            [alt]="item().video.title"
            [restricted]="restricted()"
          >
            <ng-icon name="lucideFilm" size="18" />
          </app-thumb-scrub>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex items-center gap-2 text-sm font-medium">
            <span class="truncate">{{ item().video.title }}</span>
            @if (context(); as where) {
              <span class="label-mono shrink-0 font-normal text-muted" data-testid="tile-context">{{
                where
              }}</span>
            }
            @if (fresh()) {
              <span
                class="h-2 w-2 shrink-0 rounded-full bg-accent"
                role="img"
                [attr.aria-label]="'collection.freshHint' | transloco"
                data-testid="fresh-dot"
              ></span>
            }
          </span>
          @if (item().section === 'OTHERS') {
            <span class="label-mono truncate text-faint">{{
              (item().video.author | byline) || ('common.anonymous' | transloco)
            }}</span>
          }
        </div>
        <span class="label-mono flex shrink-0 items-center gap-2 text-muted">
          @if (item().video.visibility === 'PRIVATE') {
            <ng-icon
              name="lucideLock"
              size="14"
              [attr.aria-label]="'videos.visibility.PRIVATE' | transloco"
            />
          }
          @if (item().source === 'PUBLIC_ADD') {
            <ng-icon
              name="lucideBookmark"
              size="14"
              [attr.aria-label]="'collection.bookmark' | transloco"
            />
          }
          @if (item().video.durationSec !== null) {
            <span class="w-12 text-right">{{ item().video.durationSec | duration }}</span>
          }
        </span>
        @if (selected()) {
          <span
            class="pointer-events-none absolute top-1/2 -left-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-fg"
            aria-hidden="true"
          >
            <ng-icon name="lucideCheck" size="14" strokeWidth="3" />
          </span>
        }
      } @else {
        <!-- The picture is the tile: the video's own shape, square corners;
             its name and length show on hover (always on touch screens). -->
        <div class="relative overflow-hidden bg-surface-2" [style.height.px]="height()" data-morph>
          <div
            class="h-full w-full transition-transform duration-300 ease-out"
            [class.scale-[0.92]]="selected()"
          >
            <app-thumb-scrub
              [thumbnailUrl]="item().video.thumbnailUrl"
              [frameUrls]="item().video.frameUrls"
              [alt]="item().video.title"
              [restricted]="restricted()"
            >
              <ng-icon name="lucideFilm" size="28" />
            </app-thumb-scrub>
          </div>
          <span
            class="pointer-events-none absolute inset-0 opacity-0 ring-2 ring-ink ring-inset group-focus-visible:opacity-100"
            aria-hidden="true"
          ></span>
          @if (selected()) {
            <span
              class="pointer-events-none absolute inset-0 ring-[3px] ring-accent ring-inset"
              aria-hidden="true"
            ></span>
            <span
              class="pointer-events-none absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg"
              aria-hidden="true"
            >
              <ng-icon name="lucideCheck" size="14" strokeWidth="3" />
            </span>
          } @else if (selectable()) {
            <span
              class="pointer-events-none absolute top-2 right-2 z-10 h-6 w-6 rounded-full border-2 border-white bg-black/25"
              aria-hidden="true"
            ></span>
          } @else if (fresh()) {
            <!-- Added since this visitor's last visit: a quiet dot, nothing more. -->
            <span
              class="pointer-events-none absolute top-2 right-2 z-10 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-white/80"
              role="img"
              [attr.aria-label]="'collection.freshHint' | transloco"
              [attr.title]="'collection.freshHint' | transloco"
              data-testid="fresh-dot"
            ></span>
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
            [class.top-9]="!!context()"
          >
            @if (item().source === 'PUBLIC_ADD') {
              <span class="tile-chip" [attr.title]="'collection.bookmark' | transloco">
                <ng-icon name="lucideBookmark" size="12" />
              </span>
            }
            <!-- Only for viewers who have not said yes to sensitive content. -->
            @if (item().video.sensitive && !restricted() && !sensitive.allowed()) {
              <span class="tile-chip" [attr.title]="'sensitive.label' | transloco">
                <ng-icon name="lucideTriangleAlert" size="12" />
              </span>
            }
          </div>
          <div class="tile-caption">
            <span class="min-w-0 flex-1 truncate text-[12.5px] leading-4 font-medium">{{
              item().video.title
            }}</span>
            @if (item().section === 'OTHERS') {
              <span class="max-w-[35%] shrink-0 truncate font-mono text-[10.5px] text-white/75">{{
                (item().video.author | byline) || ('common.anonymous' | transloco)
              }}</span>
            }
            <!-- The quality as YouTube names it, beside the length. -->
            @if (!restricted() && (item().video | quality); as q) {
              <span
                class="shrink-0 rounded-[3px] bg-white/90 px-1 font-mono text-[9.5px] leading-[14px] font-bold text-black"
                data-testid="tile-quality"
                >{{ q }}</span
              >
            }
            @if (item().video.durationSec !== null && !restricted()) {
              <span class="shrink-0 font-mono text-[10.5px] text-white/85">{{
                item().video.durationSec | duration
              }}</span>
            }
          </div>
        </div>
      }
    </a>
  `,
})
export class VideoCardComponent {
  protected readonly videoLink = videoLink;
  protected readonly videoState = videoState;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly morph = inject(VideoMorph);
  protected readonly sensitive = inject(SensitiveContentService);

  readonly item = input.required<CollectionItemDto>();
  /** Where a search found it: the category's name, or null. */
  readonly context = input<string | null>(null);
  readonly username = input.required<string>();
  readonly layout = input<PageLayout>('grid');
  /** Height of the picture in the mosaic, px. */
  readonly height = input<number | null>(null);
  /** Selection mode (visitor picks videos to request): click toggles instead of opening. */
  readonly selectable = input(false);
  /** This video may be picked for a request (Ctrl/Shift-click works outside selection mode too). */
  readonly requestable = input(false);
  readonly selected = input(false);
  /** New to this visitor since their last visit. */
  readonly fresh = input(false);
  readonly toggled = output<string>();
  private readonly auth = inject(AuthStore);
  /**
   * Blurred until the viewer agrees — unless it is the viewer's own shelf: what they
   * hold they may watch, and that is never blurred.
   */
  protected readonly restricted = computed(() => {
    const own = !this.preview.active() && this.auth.user()?.username === this.username();
    return !own && this.sensitive.blurs(this.item().video);
  });
  private readonly preview = inject(VisitorPreview);

  protected onClick(e: Event): void {
    const id = this.item().video.id;
    const mouse = e instanceof MouseEvent ? e : null;
    const modified = !!mouse && (mouse.ctrlKey || mouse.metaKey || mouse.shiftKey);
    if (this.selectable() || (modified && this.requestable())) {
      e.preventDefault();
      this.toggled.emit(id);
      return;
    }
    // A blurred sensitive tile has no link (RouterLink would navigate regardless): only the question opens.
    if (this.restricted() && (!mouse || (!modified && mouse.button === 0))) {
      e.preventDefault();
      void this.sensitive.ensure();
      return;
    }
    if (mouse && !modified && mouse.button === 0) {
      this.morph.from(this.picture(), {
        code: this.item().video.code,
        poster: this.item().video.thumbnailUrl,
        aspect: aspectOf(this.item().video.width, this.item().video.height),
      });
    }
  }

  private picture(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('[data-morph]');
  }
}

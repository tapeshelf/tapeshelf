import { Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { VideoCardDto } from '../../api/models/video-card-dto';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { videoLink } from '../../core/navigation/user-links';
import { Lightbox } from '../../shared/ui/lightbox/lightbox';
import { aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { previewItems, videoMeta } from '../deals/deal-gallery';

const MIN_WIDTH = 160;

/**
 * The videos of an offer in a thread: their frame previews in their own shapes, big enough
 * to judge, full screen on a click — the page of a guest's video does not exist, so a click never
 * leads to a 404; a video with a page is a link away from the full view.
 */
@Component({
  selector: 'app-offer-videos',
  imports: [TranslocoPipe, SensitiveBlurDirective],
  template: `
    <div class="flex flex-wrap gap-3">
      @for (v of videos(); track v.id; let i = $index) {
        <figure class="min-w-0" [style.width.px]="widthOf(v)" data-testid="offer-video">
          <button
            type="button"
            class="block w-full cursor-zoom-in overflow-hidden rounded-md border-2 border-line bg-screen"
            [style.height.px]="height()"
            [attr.aria-label]="'deals.gallery.open' | transloco: { title: v.title }"
            (click)="open(i)"
          >
            @if (v.contactSheetUrl ?? v.thumbnailUrl; as src) {
              <img
                [src]="src"
                [appSensitiveBlur]="v.sensitive && blur()"
                alt=""
                class="h-full w-full object-contain"
                loading="lazy"
              />
            }
          </button>
          <figcaption class="mt-1 min-w-0">
            <span class="block truncate text-xs font-semibold" [title]="v.title">{{
              v.title
            }}</span>
            <span class="label-mono block truncate text-muted">{{ meta(v) }}</span>
          </figcaption>
        </figure>
      }
    </div>
  `,
})
export class OfferVideosComponent {
  private readonly lightbox = inject(Lightbox);

  readonly videos = input.required<readonly VideoCardDto[]>();
  /** Height of a preview, px: its width follows the video's shape. */
  readonly height = input(132);
  /** Blur the sensitive ones until agreed (one's own are never blurred). */
  readonly blur = input(true);

  protected readonly meta = videoMeta;

  /** The video's shape; a tall one sits in a wider dark frame, room for its caption. */
  protected widthOf(v: VideoCardDto): number {
    return Math.max(MIN_WIDTH, Math.round(this.height() * aspectOf(v.width, v.height)));
  }

  protected open(index: number): void {
    void this.lightbox.open(
      previewItems(this.videos(), (v) => (v.author.guest ? null : videoLink(v.code))),
      index,
    );
  }
}

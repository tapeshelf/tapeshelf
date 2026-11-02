import { Injectable, signal } from '@angular/core';

/** The view-transition name shared by a clicked tile's picture and the video page's frame. */
export const VIDEO_MORPH = 'vs-video';

export interface MorphSource {
  /** The short code the video page opens at. */
  code: string;
  poster: string | null;
  /** Width over height of the picture (`aspectOf`): the page's frame takes this shape at once. */
  aspect: number;
}

/**
 * Opening a video grows the clicked tile's picture into the player: right before
 * the navigation the tile's picture gets the shared view-transition name, and the video page draws
 * its frame with that poster on its very first render, so the browser can morph one into the other.
 */
@Injectable({ providedIn: 'root' })
export class VideoMorph {
  /** The video being opened, its poster and shape, for the frame's first paint. */
  readonly pending = signal<MorphSource | null>(null);
  /**
   * The page's frame carries the shared name only while it grows out of a tile: on the way back
   * the tiles are not there yet, and a named frame with nowhere to land would fly over the page.
   */
  readonly growing = signal(false);
  private source: HTMLElement | null = null;

  from(el: HTMLElement | null, video: MorphSource): void {
    this.release();
    if (el) {
      el.style.viewTransitionName = VIDEO_MORPH;
      this.source = el;
    }
    this.pending.set(video);
    this.growing.set(!!el);
  }

  /** The name must not linger: a second named element would cancel the next transition. */
  release(): void {
    if (this.source) this.source.style.viewTransitionName = '';
    this.source = null;
    this.growing.set(false);
  }
}

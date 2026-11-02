import { Component, computed, input } from '@angular/core';

import { COVER_H, COVER_W, coverDesign, coverSeed } from './cover-lines';

let nextId = 0;

/**
 * The cover a page shows until its owner uploads a picture: the page's
 * colour (chosen in settings, or picked from the palette by user id) with generated line work that
 * is different for every user and redrawn when the owner asks for a new pattern. Decorative.
 */
@Component({
  selector: 'app-cover',
  host: { class: 'block h-full w-full', 'aria-hidden': 'true' },
  template: `
    <svg
      class="block h-full w-full"
      [attr.viewBox]="'0 0 ' + w + ' ' + h"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" [attr.stop-color]="design().lighter" />
          <stop offset="1" [attr.stop-color]="design().darker" />
        </linearGradient>
      </defs>
      <rect [attr.width]="w" [attr.height]="h" [attr.fill]="'url(#' + gradientId + ')'" />
      @for (line of design().lines; track $index) {
        <path
          [attr.d]="line.d"
          fill="none"
          [attr.stroke]="line.accent ? design().accent : design().ink"
          [attr.stroke-opacity]="line.opacity"
          [attr.stroke-width]="line.width"
          vector-effect="non-scaling-stroke"
        />
      }
    </svg>
  `,
})
export class CoverComponent {
  /** Stable per user (the user id): the same page always draws the same lines. */
  readonly seed = input.required<string>();
  /** The owner's chosen pattern; null derives it from the id. */
  readonly pattern = input<number | null>(null);
  /** The owner's colour; null picks one from the palette. */
  readonly color = input<string | null>(null);

  protected readonly w = COVER_W;
  protected readonly h = COVER_H;
  protected readonly gradientId = `cover-shade-${nextId++}`;
  protected readonly design = computed(() =>
    coverDesign(coverSeed(this.seed(), this.pattern()), this.color(), this.seed()),
  );
}

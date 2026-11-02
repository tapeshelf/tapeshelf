import { Component, computed, inject, input } from '@angular/core';

import { IN_PANEL } from '../../../core/navigation/panels';

import { StrokeComponent, hashString } from '../stroke/stroke';

/**
 * The head every page and panel starts with: an optional mono kicker with the orange dot,
 * a big display title underlined by a short brush stroke, actions on the right. One look across
 * pages, so moving between them feels like one app.
 */
@Component({
  selector: 'app-page-head',
  imports: [StrokeComponent],
  host: {
    class: 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
    '[class]': "panel ? 'mb-7' : 'mb-8 sm:mb-10'",
  },
  template: `
    <div class="min-w-0">
      @if (kicker()) {
        <p class="label-mono mb-3 flex items-center gap-2 text-muted uppercase">
          <span class="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
          {{ kicker() }}
        </p>
      }
      <h1
        class="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display leading-[1.05] font-bold tracking-tight wrap-anywhere"
        [class]="panel ? 'text-2xl sm:text-[1.75rem]' : 'text-3xl sm:text-[2.6rem]'"
      >
        {{ title() }}
        <ng-content select="[pageHeadBadge]" />
      </h1>
      <app-stroke
        [class]="panel ? 'mt-2.5 w-24' : 'mt-3 w-36 sm:w-48'"
        [seed]="seed()"
        [height]="panel ? 9 : 12"
        [thickness]="panel ? 4 : 5.5"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class PageHeadComponent {
  readonly title = input.required<string>();
  readonly kicker = input<string | null>(null);
  /** Inside the side panel: a smaller head, clear of the close button. */
  protected readonly panel = inject(IN_PANEL, { optional: true }) ?? false;
  /** The same page draws the same stroke; different pages differ a little. */
  protected readonly seed = computed(() => hashString(this.title()));
}

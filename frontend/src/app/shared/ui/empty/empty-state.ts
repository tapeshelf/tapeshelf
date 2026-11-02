import { Component, input } from '@angular/core';

import { StrokeComponent } from '../stroke/stroke';

/**
 * "Nothing here yet": a tiny still life from the brand mark — a tape leaning on a
 * play button, standing on a brush-stroke shelf — and the message; actions go in the content.
 */
@Component({
  selector: 'app-empty-state',
  imports: [StrokeComponent],
  host: {
    class: 'flex flex-col items-center rounded-xl bg-surface-2/60 px-6 py-12 text-center',
  },
  template: `
    <div class="relative h-[4.5rem] w-40" aria-hidden="true">
      <span
        class="absolute bottom-3 left-[2.6rem] h-12 w-[0.95rem] origin-bottom -rotate-[14deg] rounded-[4px] border-2 border-line bg-shelf"
      ></span>
      <span
        class="absolute bottom-3 left-[3.9rem] h-0 w-0 border-y-[1.6rem] border-l-[2.6rem] border-y-transparent border-l-line"
      ></span>
      <span
        class="absolute bottom-[1.05rem] left-[4.05rem] h-0 w-0 border-y-[1.35rem] border-l-[2.2rem] border-y-transparent border-l-accent"
      ></span>
      <span
        class="absolute bottom-3 left-[6.9rem] h-8 w-[0.8rem] rounded-[4px] border-2 border-line bg-surface"
      ></span>
      <app-stroke
        class="absolute inset-x-0 bottom-0"
        [seed]="seed()"
        [height]="12"
        [thickness]="5"
      />
    </div>
    <p class="mt-4 max-w-md text-muted">{{ text() }}</p>
    <div class="mt-5 empty:hidden"><ng-content /></div>
  `,
})
export class EmptyStateComponent {
  readonly text = input.required<string>();
  readonly seed = input(3);
}

import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Brand mark: an ink tile with an orange play button standing on a paper shelf, a
 * mint tape leaning on it — video first, the shelf still there. Fixed colours, the same in both
 * themes (it is an app icon); hovering it nudges the play button and tips the tape. Plus the
 * lowercase wordmark.
 */
@Component({
  selector: 'app-logo',
  imports: [TranslocoPipe],
  host: { class: 'group/logo inline-flex' },
  template: `
    <span class="inline-flex items-center gap-2.5 select-none">
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        viewBox="0 0 32 32"
        aria-hidden="true"
        class="shrink-0 overflow-visible"
      >
        <rect width="32" height="32" rx="8" fill="#171717" class="dark:stroke-white/15" />
        <polygon
          points="13,6.6 25.6,14.6 13,22.6"
          fill="#fc753e"
          stroke="#fc753e"
          stroke-width="2.4"
          stroke-linejoin="round"
          class="transition-transform duration-200 group-hover/logo:translate-x-[1.2px]"
        />
        <g
          class="origin-[9.1px_22.8px] transition-transform duration-200 group-hover/logo:-rotate-[7deg]"
        >
          <rect
            x="7.2"
            y="9.6"
            width="3.8"
            height="13.2"
            rx="0.9"
            fill="#d1e4db"
            transform="rotate(-11 9.1 22.8)"
          />
        </g>
        <polygon
          points="6,23.9 27.4,23.9 26.1,26.3 4.7,26.3"
          fill="#f4f3ee"
          stroke="#f4f3ee"
          stroke-width="0.6"
          stroke-linejoin="round"
        />
      </svg>
      @if (wordmark()) {
        <span class="font-display text-[15px] font-semibold tracking-tight lowercase">{{
          'app.name' | transloco
        }}</span>
      }
    </span>
  `,
})
export class LogoComponent {
  readonly size = input(30);
  readonly wordmark = input(true);
}

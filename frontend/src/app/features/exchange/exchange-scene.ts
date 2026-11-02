import { Component, input } from '@angular/core';

import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';

export interface SceneCover {
  thumbnailUrl: string | null;
  sensitive: boolean;
}

/** How long the scene lasts (no longer than a second); the styles below say the same. */
export const SCENE_MS = 900;

/**
 * The exchange scene: the two covers swap places along arcs, once, when an
 * exchange is done. Decorative; the page leaves it out under prefers-reduced-motion.
 */
@Component({
  selector: 'app-exchange-scene',
  imports: [SensitiveBlurDirective],
  host: {
    class: 'pointer-events-none fixed inset-0 z-50 flex items-center justify-center',
    'aria-hidden': 'true',
    'data-testid': 'exchange-scene',
  },
  styles: `
    .stage {
      position: relative;
      width: 22rem;
      height: 7rem;
      animation: scene-fade 900ms ease-out both;
    }
    .cover {
      position: absolute;
      top: 0.75rem;
      width: 9.5rem;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border: 2px solid var(--vs-line);
      border-radius: var(--radius-md);
      background: var(--vs-surface-2);
      box-shadow: 4px 4px 0 0 var(--vs-shadow-color);
    }
    .give {
      left: 0;
      animation: arc-over 900ms cubic-bezier(0.6, 0, 0.3, 1) both;
    }
    .get {
      right: 0;
      animation: arc-under 900ms cubic-bezier(0.6, 0, 0.3, 1) both;
    }
    @keyframes arc-over {
      0% {
        transform: translate(0, 0) rotate(-4deg);
      }
      50% {
        transform: translate(6.25rem, -3.5rem) rotate(6deg);
      }
      100% {
        transform: translate(12.5rem, 0) rotate(-2deg);
      }
    }
    @keyframes arc-under {
      0% {
        transform: translate(0, 0) rotate(4deg);
      }
      50% {
        transform: translate(-6.25rem, 3.5rem) rotate(-6deg);
      }
      100% {
        transform: translate(-12.5rem, 0) rotate(2deg);
      }
    }
    @keyframes scene-fade {
      0% {
        opacity: 0;
      }
      12% {
        opacity: 1;
      }
      80% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
  `,
  template: `
    <div class="stage">
      <div class="cover give">
        @if (give().thumbnailUrl; as url) {
          <img
            [src]="url"
            alt=""
            class="h-full w-full object-cover"
            [appSensitiveBlur]="give().sensitive"
          />
        }
      </div>
      <div class="cover get">
        @if (get().thumbnailUrl; as url) {
          <img
            [src]="url"
            alt=""
            class="h-full w-full object-cover"
            [appSensitiveBlur]="get().sensitive"
          />
        }
      </div>
    </div>
  `,
})
export class ExchangeSceneComponent {
  /** What I gave and what I got: the first of each. */
  readonly give = input.required<SceneCover>();
  readonly get = input.required<SceneCover>();
}

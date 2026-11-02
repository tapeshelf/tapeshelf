import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { StrokeComponent } from '../../shared/ui/stroke/stroke';
import { THUMB_ART, type ThumbArt } from '../../shared/ui/thumb-art';

/** Sprocket holes down both edges of a strip. */
const HOLE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='26'%3E%3Crect x='4' y='6' width='8' height='13' rx='2' fill='%23f4f3ee' fill-opacity='.85'/%3E%3C/svg%3E\")";

const STRIPS: { frames: ThumbArt[]; seconds: number; reverse: boolean }[] = [
  { frames: ['dusk', 'bars', 'sea', 'city', 'sunset', 'grid'], seconds: 38, reverse: false },
  { frames: ['moon', 'stripes', 'hills', 'waves', 'dusk', 'sea'], seconds: 46, reverse: true },
  { frames: ['sunset', 'grid', 'city', 'bars', 'moon', 'hills'], seconds: 34, reverse: false },
];

/**
 * The poster beside the sign-in and sign-up forms: three strips of film, tilted,
 * drifting past at different speeds — frames of other people's tapes — with the promise of the
 * site over them. Still for reduced motion.
 */
@Component({
  selector: 'app-film-poster',
  imports: [TranslocoPipe, StrokeComponent],
  host: {
    class: 'relative block overflow-hidden rounded-2xl border-2 border-line bg-screen shadow-hard',
    'aria-hidden': 'true',
  },
  template: `
    <div
      class="absolute -top-[30%] -right-[10%] -bottom-[30%] flex w-[66%] rotate-[-9deg] gap-[4%]"
    >
      @for (strip of strips; track $index) {
        <div
          class="relative flex-1 overflow-hidden bg-screen-deep px-5"
          [style.background-image]="holes"
          style="background-repeat: repeat-y; background-position: left top, right top"
        >
          <div
            class="reel flex flex-col gap-3 py-1.5"
            [class.reverse]="strip.reverse"
            [style.animation-duration.s]="strip.seconds"
          >
            @for (frame of strip.frames.concat(strip.frames); track $index) {
              <div
                class="aspect-[4/3] w-full shrink-0 rounded-[3px]"
                [style.background]="art[frame]"
              ></div>
            }
          </div>
        </div>
      }
    </div>
    <div
      class="absolute inset-0 bg-[linear-gradient(100deg,#171717_0%,#171717_38%,rgb(23_23_23/0.55)_55%,transparent_75%)]"
    ></div>
    <div class="absolute bottom-12 left-10 max-w-[42%]">
      <p class="label-mono flex items-center gap-2 text-on-screen/60 uppercase">
        <span class="h-2 w-2 rounded-full bg-accent"></span>
        {{ 'home.kicker' | transloco }}
      </p>
      <p
        class="mt-4 font-display text-[2.5rem] leading-[1.02] font-bold tracking-tight text-on-screen"
      >
        {{ 'home.title' | transloco }}
      </p>
      <app-stroke class="mt-4 w-44" [seed]="41" [height]="12" [thickness]="5.5" color="#fc753e" />
      <p class="mt-5 text-[15px] leading-relaxed text-on-screen/70">
        {{ 'home.subtitle' | transloco }}
      </p>
    </div>
  `,
  styles: `
    .reel {
      animation: reel-scroll linear infinite;
    }
    .reel.reverse {
      animation-direction: reverse;
    }
    @keyframes reel-scroll {
      to {
        transform: translateY(calc(-50% - 0.375rem));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .reel {
        animation: none;
      }
    }
  `,
})
export class FilmPosterComponent {
  protected readonly strips = STRIPS;
  protected readonly art = THUMB_ART;
  protected readonly holes = `${HOLE}, ${HOLE}`;
}

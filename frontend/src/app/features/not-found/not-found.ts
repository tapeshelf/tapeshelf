import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { StrokeComponent } from '../../shared/ui/stroke/stroke';

/** Brand colour bars, like a test card on a channel with nothing on it. */
const BARS = ['#f4f3ee', '#d1e4db', '#fc753e', '#a9c9bb', '#ee6128', '#171717', '#ebeae3'];

/** 404 as a dead channel: colour bars, "no signal", a tracking line rolling down. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TranslocoPipe, StrokeComponent],
  template: `
    <section class="mx-auto flex max-w-2xl flex-col items-center py-10 text-center sm:py-16">
      <div
        class="relative aspect-video w-full max-w-md overflow-hidden rounded-xl border-2 border-line shadow-hard"
        aria-hidden="true"
      >
        <div class="absolute inset-x-0 top-0 grid h-3/4 grid-cols-7">
          @for (c of bars; track $index) {
            <span [style.background]="c"></span>
          }
        </div>
        <div class="absolute inset-x-0 bottom-0 grid h-1/4 grid-cols-7">
          @for (c of reversed; track $index) {
            <span [style.background]="c"></span>
          }
        </div>
        <span class="tracking-line absolute inset-x-0 h-6 bg-white/35 mix-blend-overlay"></span>
        <span
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-2 rounded-md border-2 border-line bg-screen px-4 py-2 font-mono text-sm font-bold tracking-[0.2em] text-on-screen uppercase shadow-[4px_4px_0_0_#fc753e]"
        >
          404 · {{ 'notFound.noSignal' | transloco }}
        </span>
      </div>
      <h1 class="mt-10 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {{ 'notFound.title' | transloco }}
      </h1>
      <app-stroke class="mt-3 w-40" [seed]="404" [height]="12" [thickness]="5.5" />
      <p class="mt-4 text-muted">{{ 'notFound.text' | transloco }}</p>
      <a
        routerLink="/"
        class="mt-8 inline-flex h-11 items-center rounded-full border-2 border-accent-edge bg-accent px-6 font-semibold text-accent-fg transition-[transform,box-shadow] duration-100 lift-hitbox hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm"
      >
        {{ 'notFound.home' | transloco }}
      </a>
    </section>
  `,
})
export class NotFoundPage {
  protected readonly bars = BARS;
  protected readonly reversed = [...BARS].reverse();
}

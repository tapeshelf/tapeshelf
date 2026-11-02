import { Component, input } from '@angular/core';

import { StrokeComponent, hashString } from '../../shared/ui/stroke/stroke';
import { FilmPosterComponent } from './film-poster';

/**
 * Frame of the auth pages: the form card, and on wide screens a poster next
 * to it — strips of film drifting past — so signing in feels like the same app.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [StrokeComponent, FilmPosterComponent],
  template: `
    <section
      class="mx-auto grid w-full max-w-5xl gap-8 pt-2 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-12"
    >
      <app-film-poster class="hidden min-h-[34rem] lg:block" />
      <div
        class="w-full max-w-md self-center justify-self-center rounded-xl border-2 border-line bg-surface p-6 shadow-hard sm:p-8 lg:max-w-none"
      >
        <h1 class="font-display text-2xl leading-tight font-bold tracking-tight">{{ title() }}</h1>
        <app-stroke class="mt-2 mb-6 w-32" [seed]="seed(title())" [height]="12" [thickness]="5" />
        <ng-content />
      </div>
    </section>
  `,
})
export class AuthLayoutComponent {
  readonly title = input.required<string>();
  protected readonly seed = hashString;
}

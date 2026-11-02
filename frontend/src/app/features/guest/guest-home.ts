import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { FRAME } from '../../core/layout/frame';
import { SiteConfig } from '../../core/site/site-config';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { LogoComponent } from '../../shared/ui/logo/logo';

/**
 * The app's front page: the mark, the instance name, one line about the service and the way in.
 * Signed-in visitors never see it — homeGuard sends them to their shelf. tapeshelf.com serves its
 * own site at / instead.
 */
@Component({
  selector: 'app-guest-home',
  imports: [RouterLink, TranslocoPipe, ButtonDirective, LogoComponent],
  host: { class: 'block' },
  template: `
    <section
      class="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-16 text-center"
      [class]="frame"
    >
      <app-logo [size]="64" [wordmark]="false" />
      <p class="label-mono text-muted" data-testid="guest-site-name">{{ site.name() }}</p>
      <h1 class="font-display max-w-2xl text-4xl font-semibold sm:text-5xl">
        {{ 'guest.title' | transloco }}
      </h1>
      <p class="max-w-xl text-lg text-muted">{{ 'guest.lead' | transloco }}</p>
      <div class="mt-2 flex flex-wrap justify-center gap-3">
        @if (site.registrationOpen()) {
          <a appButton routerLink="/register">{{ 'guest.register' | transloco }}</a>
        }
        <a appButton variant="secondary" routerLink="/login">{{ 'guest.login' | transloco }}</a>
      </div>
    </section>
  `,
})
export class GuestHomePage {
  protected readonly frame = FRAME;
  protected readonly site = inject(SiteConfig);
}

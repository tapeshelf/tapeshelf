import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { FRAME } from '../../core/layout/frame';
import { SiteConfig } from '../../core/site/site-config';

/** The public demo (DEMO_MODE): everything is erased daily; the shared account to try it. */
@Component({
  selector: 'app-demo-banner',
  imports: [TranslocoPipe],
  template: `
    @if (site.demo(); as demo) {
      <div class="bg-accent text-sm text-accent-fg" role="note" data-testid="demo-banner">
        <p class="py-2" [class]="frame">
          {{ 'demo.banner' | transloco: { email: demo.email, password: demo.password } }}
        </p>
      </div>
    }
  `,
})
export class DemoBannerComponent {
  protected readonly site = inject(SiteConfig);
  protected readonly frame = FRAME;
}

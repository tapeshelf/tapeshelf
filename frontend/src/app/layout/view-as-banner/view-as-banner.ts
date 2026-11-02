import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye } from '@ng-icons/lucide';

import { ViewAsService } from '../../core/admin/view-as.service';
import { AuthStore } from '../../core/auth/auth.store';
import { FRAME } from '../../core/layout/frame';
import { ButtonDirective } from '../../shared/ui/button/button.directive';

/** While an admin looks at the site as someone else (read-only): who, and the way back. */
@Component({
  selector: 'app-view-as-banner',
  imports: [TranslocoPipe, NgIcon, ButtonDirective],
  providers: [provideIcons({ lucideEye })],
  template: `
    @if (viewAs.target(); as target) {
      <div class="bg-inverse text-sm text-on-inverse" data-testid="view-as-banner">
        <div class="flex flex-wrap items-center justify-between gap-2 py-2" [class]="frame">
          <span class="flex items-center gap-2">
            <ng-icon name="lucideEye" size="16" />
            {{ 'admin.viewAs.banner' | transloco: { name: target.username } }}
          </span>
          <button type="button" appButton size="sm" (click)="exit()" data-testid="view-as-exit">
            {{ 'admin.viewAs.exit' | transloco }}
          </button>
        </div>
      </div>
    }
  `,
})
export class ViewAsBannerComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly viewAs = inject(ViewAsService);
  protected readonly frame = FRAME;

  async exit(): Promise<void> {
    const back = this.viewAs.target()?.returnTo ?? '/admin';
    this.viewAs.clear();
    await this.auth.load();
    await this.router.navigateByUrl(back);
  }
}

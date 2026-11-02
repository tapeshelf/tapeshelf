import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye } from '@ng-icons/lucide';

import { FRAME } from '../../core/layout/frame';
import { VisitorPreview } from '../../core/preview/visitor-preview.service';

/** While the owner looks at their page the way a visitor sees it: a reminder above the header, and the way back. */
@Component({
  selector: 'app-visitor-banner',
  imports: [TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideEye })],
  template: `
    @if (preview.shown()) {
      <div class="bg-accent text-sm text-accent-fg" data-testid="visitor-banner">
        <div class="flex flex-wrap items-center justify-between gap-2 py-2" [class]="frame">
          <span class="flex items-center gap-2 font-medium">
            <ng-icon name="lucideEye" size="16" />
            {{ 'preview.banner' | transloco }}
          </span>
          <button
            type="button"
            class="font-semibold underline decoration-2 underline-offset-4 hover:no-underline"
            data-testid="visitor-exit"
            (click)="preview.stop()"
          >
            {{ 'preview.exit' | transloco }}
          </button>
        </div>
      </div>
    }
  `,
})
export class VisitorBannerComponent {
  protected readonly preview = inject(VisitorPreview);
  protected readonly frame = FRAME;
}

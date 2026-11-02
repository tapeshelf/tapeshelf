import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';

import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { AuthStore } from '../auth/auth.store';

/**
 * The one question about sensitive content: asked the first time, never again
 * after a yes. A guest also confirms being an adult; an account is for adults only by the terms.
 */
@Component({
  selector: 'app-sensitive-dialog',
  imports: [TranslocoPipe, ButtonDirective, NgIcon],
  providers: [provideIcons({ lucideTriangleAlert })],
  template: `
    <div
      class="w-[min(440px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="alertdialog"
      [attr.aria-label]="'sensitive.title' | transloco"
      data-testid="sensitive-dialog"
    >
      <div class="flex items-center gap-3">
        <span
          class="flex h-10 w-10 shrink-0 -rotate-3 items-center justify-center rounded-md border-2 border-accent-edge bg-accent text-accent-fg"
          aria-hidden="true"
          ><ng-icon name="lucideTriangleAlert" size="20"
        /></span>
        <h2 class="font-display text-lg leading-tight font-bold tracking-tight">
          {{ 'sensitive.title' | transloco }}
        </h2>
      </div>
      <p class="mt-3 text-sm leading-relaxed text-muted">
        {{ (guest ? 'sensitive.textGuest' : 'sensitive.text') | transloco }}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(false)">
          {{ 'sensitive.decline' | transloco }}
        </button>
        <button type="button" appButton cdkFocusInitial (click)="ref.close(true)">
          {{ (guest ? 'sensitive.confirmGuest' : 'sensitive.confirm') | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class SensitiveDialogComponent {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly guest = !inject(AuthStore).isAuthenticated();
}

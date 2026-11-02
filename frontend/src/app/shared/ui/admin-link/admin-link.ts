import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShield } from '@ng-icons/lucide';

import { AuthStore } from '../../../core/auth/auth.store';
import { VisitorPreview } from '../../../core/preview/visitor-preview.service';

/**
 * A quiet way from a page of the site to the same person or video in the admin panel:
 * admins only, and not while they look at the site as someone else or as a visitor.
 */
@Component({
  selector: 'app-admin-link',
  imports: [RouterLink, TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideShield })],
  template: `
    @if (shown()) {
      <a
        [routerLink]="to()"
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted/70 transition-colors hover:bg-surface-2 hover:text-text"
        [attr.aria-label]="'admin.openInAdmin' | transloco"
        [title]="'admin.openInAdmin' | transloco"
        data-testid="admin-link"
        ><ng-icon name="lucideShield" size="14"
      /></a>
    }
  `,
})
export class AdminLinkComponent {
  private readonly auth = inject(AuthStore);
  private readonly preview = inject(VisitorPreview);

  /** The admin panel's page, as router commands. */
  readonly to = input.required<readonly unknown[]>();
  protected readonly shown = computed(() => this.auth.isAdmin() && !this.preview.active());
}

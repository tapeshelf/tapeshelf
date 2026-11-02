import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { SiteConfig } from '../../core/site/site-config';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import {
  SIDE_LAYOUT,
  SIDE_NAV,
  SIDE_NAV_ACTIVE,
  SIDE_NAV_ITEM,
} from '../../shared/ui/side-nav/side-nav';

const ALL_TABS = [
  'profile',
  'page',
  'notifications',
  'blocked',
  'account',
  'plan',
  'security',
] as const;

@Component({
  selector: 'app-settings-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe, PageHeadComponent],
  template: `
    <!-- The title stays at the top of the panel; the settings scroll under it. The panel's own
         side padding is taken back, so nothing shows past its edges. -->
    <div class="sticky top-0 z-10 -mx-5 bg-canvas px-5 pb-7 sm:-mx-10 sm:px-10">
      <app-page-head class="mb-0!" [title]="'settings.title' | transloco" />
    </div>
    <div [class]="layout">
      <nav [class]="nav" [attr.aria-label]="'settings.title' | transloco">
        @for (tab of tabs(); track tab) {
          <a [routerLink]="tab" [routerLinkActive]="active" [class]="item">
            {{ 'settings.tabs.' + tab | transloco }}
          </a>
        }
      </nav>
      <section class="min-w-0"><router-outlet /></section>
    </div>
  `,
})
export class SettingsLayout {
  protected readonly layout = SIDE_LAYOUT;
  protected readonly nav = SIDE_NAV;
  protected readonly item = SIDE_NAV_ITEM;
  protected readonly active = SIDE_NAV_ACTIVE;
  private readonly site = inject(SiteConfig);
  /** The plan tab only where there are plans: not on a self-hosted instance. */
  protected readonly tabs = computed(() =>
    ALL_TABS.filter((tab) => tab !== 'plan' || this.site.hasTiers()),
  );
}

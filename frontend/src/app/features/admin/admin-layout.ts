import { Component, Injectable, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideFilm,
  lucideFlag,
  lucideLayoutDashboard,
  lucideLifeBuoy,
  lucideScrollText,
  lucideSettings,
  lucideTrash2,
  lucideUsers,
} from '@ng-icons/lucide';

import { Api, adminDashboard } from '../../api';
import { SiteConfig } from '../../core/site/site-config';
import { WsService } from '../../core/ws/ws.service';
import { PageHeadComponent } from '../../shared/ui/page-head/page-head';
import {
  SIDE_LAYOUT,
  SIDE_NAV,
  SIDE_NAV_ACTIVE,
  SIDE_NAV_ITEM,
} from '../../shared/ui/side-nav/side-nav';

/**
 * The counters in the admin navigation: open reports, and support tickets waiting for support
 * (kept live by the server's push). Pages refresh them after acting.
 */
@Injectable({ providedIn: 'root' })
export class AdminCounters {
  private readonly api = inject(Api);
  readonly openReports = signal(0);
  readonly openSupport = signal(0);

  constructor() {
    inject(WsService).on<{ open: number }>('support.queue', ({ open }) =>
      this.openSupport.set(open),
    );
  }

  async refresh(): Promise<void> {
    try {
      const d = await this.api.invoke(adminDashboard);
      this.openReports.set(d.openReports);
      this.openSupport.set(d.openSupport);
    } catch {
      // the badges just stay as they were
    }
  }
}

const SECTIONS = [
  { path: 'dashboard', key: 'dashboard', icon: 'lucideLayoutDashboard' },
  { path: 'reports', key: 'reports', icon: 'lucideFlag' },
  { path: 'support', key: 'support', icon: 'lucideLifeBuoy' },
  { path: 'users', key: 'users', icon: 'lucideUsers' },
  { path: 'videos', key: 'videos', icon: 'lucideFilm' },
  { path: 'trash', key: 'trash', icon: 'lucideTrash2' },
  { path: 'requests', key: 'requests', icon: 'lucideArrowLeftRight' },
  { path: 'settings', key: 'settings', icon: 'lucideSettings' },
  { path: 'audit', key: 'audit', icon: 'lucideScrollText' },
] as const;

/** /admin: one page with a section list, like settings. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe, NgIcon, PageHeadComponent],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideFilm,
      lucideFlag,
      lucideLayoutDashboard,
      lucideLifeBuoy,
      lucideScrollText,
      lucideSettings,
      lucideTrash2,
      lucideUsers,
    }),
  ],
  template: `
    <app-page-head [title]="'admin.title' | transloco">
      <span
        pageHeadBadge
        class="label-mono -rotate-3 self-center rounded-sm bg-inverse px-1.5 py-0.5 text-on-inverse"
        >{{ 'admin.chip' | transloco }}</span
      >
    </app-page-head>
    <div [class]="layout">
      <nav [class]="nav" data-testid="admin-nav">
        @for (s of sections; track s.path) {
          <a [routerLink]="s.path" [routerLinkActive]="active" [class]="item">
            <span class="flex items-center gap-2.5">
              <ng-icon [name]="s.icon" size="16" class="shrink-0 opacity-80" />{{
                'admin.nav.' + s.key | transloco
              }}
            </span>
            @if (s.key === 'reports' && counters.openReports() > 0) {
              <span
                class="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
                data-testid="admin-reports-badge"
                >{{ counters.openReports() }}</span
              >
            }
            @if (s.key === 'support' && counters.openSupport() > 0) {
              <span
                class="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
                data-testid="admin-support-badge"
                >{{ counters.openSupport() }}</span
              >
            }
          </a>
        }
      </nav>
      <section class="min-w-0"><router-outlet /></section>
    </div>
  `,
})
export class AdminLayout {
  protected readonly layout = SIDE_LAYOUT;
  protected readonly nav = SIDE_NAV;
  protected readonly item = SIDE_NAV_ITEM;
  protected readonly active = SIDE_NAV_ACTIVE;
  protected readonly counters = inject(AdminCounters);
  private readonly site = inject(SiteConfig);
  /** No support on the demo. */
  protected readonly sections = SECTIONS.filter((s) => s.key !== 'support' || !this.site.demo());

  constructor() {
    void this.counters.refresh();
  }
}

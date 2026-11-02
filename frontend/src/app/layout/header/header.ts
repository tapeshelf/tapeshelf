import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideChevronDown,
  lucideCrown,
  lucideLifeBuoy,
  lucideLink2,
  lucideLogOut,
  lucideMessageCircle,
  lucideMoon,
  lucideSettings,
  lucideShieldCheck,
  lucideRss,
  lucideSun,
  lucideUser,
} from '@ng-icons/lucide';

import { AuthStore } from '../../core/auth/auth.store';
import { ChatStore } from '../../core/chat/chat.store';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { SupportStore } from '../../core/support/support.store';
import { WhatsNewStore } from '../../core/whats-new/whats-new.store';
import { LayoutFrame } from '../../core/layout/frame';
import { SiteConfig } from '../../core/site/site-config';
import { ThemeService } from '../../core/theme/theme.service';
import { LogoComponent } from '../../shared/ui/logo/logo';
import { NotificationBellComponent } from './notification-bell';
import { profileLink } from '../../core/navigation/user-links';
import { panelLink } from '../../core/navigation/panels';

/**
 * No bar: the logo on the left and the two things that matter on the right (bell, account
 * capsule), in the same frame as every page. Once the page scrolls, a hard ink line
 * appears under it. Language lives in settings, the theme also in the account menu (a switch);
 * messages, requests and support sit in the account menu, each item with its own counter.
 * The capsule shows no counter: the bell tells of the same events, once is enough.
 */
@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    TranslocoPipe,
    NgIcon,
    LogoComponent,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    NotificationBellComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideChevronDown,
      lucideCrown,
      lucideLifeBuoy,
      lucideLink2,
      lucideLogOut,
      lucideMessageCircle,
      lucideMoon,
      lucideSettings,
      lucideShieldCheck,
      lucideRss,
      lucideSun,
      lucideUser,
    }),
  ],
  template: `
    <header
      class="vt-header sticky top-0 z-30 border-b bg-canvas transition-colors duration-200"
      [class]="scrolled() ? 'border-border' : 'border-transparent'"
    >
      <div
        class="frame-glide flex h-16 items-center justify-between gap-4 sm:h-[4.5rem]"
        [class]="layout.frame()"
      >
        <!-- signed in, the logo leads home: the user's own page, without a detour via the landing;
             signed out on the cloud, to the site's home page with a full load, as after signing out -->
        @if (!auth.user() && siteHome(); as home) {
          <a
            [href]="home"
            class="vt-logo -mx-1 flex items-center rounded-md px-1 py-1"
            [attr.aria-label]="'app.name' | transloco"
          >
            <app-logo [size]="34" />
          </a>
        } @else {
          <a
            [routerLink]="auth.user() ? profileLink(auth.user()!.username) : '/'"
            class="vt-logo -mx-1 flex items-center rounded-md px-1 py-1"
            [attr.aria-label]="'app.name' | transloco"
          >
            <app-logo [size]="34" />
          </a>
        }

        <nav class="vt-header-nav flex items-center gap-2.5 sm:gap-3">
          @if (auth.user(); as user) {
            <app-notification-bell />
            <button
              type="button"
              class="relative flex h-10 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium transition-colors hover:bg-surface-2 sm:pr-3"
              [cdkMenuTriggerFor]="menu"
              [attr.aria-label]="'nav.userMenu' | transloco"
              (cdkMenuOpened)="whatsNew.refresh()"
            >
              <span
                class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-bold text-accent-fg"
              >
                @if (user.avatarUrl) {
                  <img [src]="user.avatarUrl" alt="" class="h-full w-full object-cover" />
                } @else {
                  {{ initials() }}
                }
              </span>
              <span class="hidden max-w-36 truncate sm:inline">{{ user.displayName }}</span>
              <ng-icon name="lucideChevronDown" size="14" class="hidden text-muted sm:block" />
            </button>
            <ng-template #menu>
              <div
                cdkMenu
                class="mt-2 flex w-60 flex-col rounded-xl border border-border bg-surface p-1.5 text-sm text-text shadow-float"
              >
                <div class="px-3 pt-2 pb-2.5">
                  <p class="truncate font-semibold">{{ user.displayName }}</p>
                  <p class="label-mono truncate text-muted">&#64;{{ user.username }}</p>
                </div>
                <div class="mx-2 mb-1 border-t border-line/15" role="separator"></div>
                <a
                  cdkMenuItem
                  [routerLink]="profileLink(user.username)"
                  class="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-surface-2"
                  ><ng-icon name="lucideUser" size="16" class="shrink-0 text-muted" />{{
                    'nav.myPage' | transloco
                  }}</a
                >
                <!-- New videos of the people I follow; the red dot while there is news. -->
                <a
                  cdkMenuItem
                  [routerLink]="panelLink('whats-new')"
                  [queryParamsHandling]="'merge'"
                  class="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-2"
                  data-testid="nav-whats-new"
                >
                  <span class="flex items-center gap-2.5"
                    ><ng-icon name="lucideRss" size="16" class="shrink-0 text-muted" />{{
                      'whatsNew.nav' | transloco
                    }}</span
                  >
                  @if (whatsNew.hasNew()) {
                    <span
                      class="h-2.5 w-2.5 rounded-full bg-danger"
                      role="img"
                      [attr.aria-label]="'whatsNew.hasNew' | transloco"
                      data-testid="whats-new-dot"
                    ></span>
                  }
                </a>
                <a
                  cdkMenuItem
                  [routerLink]="panelLink('messages')"
                  [queryParamsHandling]="'merge'"
                  class="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-2"
                  data-testid="nav-messages"
                >
                  <span class="flex items-center gap-2.5"
                    ><ng-icon name="lucideMessageCircle" size="16" class="shrink-0 text-muted" />{{
                      'chat.nav' | transloco
                    }}</span
                  >
                  @if (chat.unread() > 0) {
                    <span
                      class="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
                      data-testid="messages-badge"
                      >{{ chat.unread() > 99 ? '99+' : chat.unread() }}</span
                    >
                  }
                </a>
                <a
                  cdkMenuItem
                  [routerLink]="panelLink('exchange')"
                  [queryParamsHandling]="'merge'"
                  class="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-2"
                  data-testid="nav-exchange"
                >
                  <span class="flex items-center gap-2.5"
                    ><ng-icon name="lucideArrowLeftRight" size="16" class="shrink-0 text-muted" />{{
                      'exchange.nav' | transloco
                    }}</span
                  >
                  @if (exchange.awaitingMe() > 0) {
                    <span
                      class="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
                      data-testid="exchange-badge"
                      >{{ exchange.awaitingMe() }}</span
                    >
                  }
                </a>
                <!-- Temporary links (everyone's since). -->
                <a
                  cdkMenuItem
                  [routerLink]="panelLink('links')"
                  [queryParamsHandling]="'merge'"
                  class="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-surface-2"
                  data-testid="nav-links"
                  ><ng-icon name="lucideLink2" size="16" class="shrink-0 text-muted" />{{
                    'links.nav' | transloco
                  }}</a
                >
                <!-- Support: between the requests and the settings, the unread answers counted; none on the demo. -->
                @if (!site.demo()) {
                  <a
                    cdkMenuItem
                    [routerLink]="panelLink('support')"
                    [queryParamsHandling]="'merge'"
                    class="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-2"
                    data-testid="nav-support"
                  >
                    <span class="flex items-center gap-2.5"
                      ><ng-icon name="lucideLifeBuoy" size="16" class="shrink-0 text-muted" />{{
                        'support.nav' | transloco
                      }}</span
                    >
                    @if (support.unread() > 0) {
                      <span
                        class="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-fg"
                        data-testid="support-badge"
                        >{{ support.unread() }}</span
                      >
                    }
                  </a>
                }
                <a
                  cdkMenuItem
                  [routerLink]="panelLink('settings')"
                  [queryParamsHandling]="'merge'"
                  class="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-surface-2"
                  ><ng-icon name="lucideSettings" size="16" class="shrink-0 text-muted" />{{
                    'nav.settings' | transloco
                  }}</a
                >
                <!-- The theme at a flick: a switch that leaves the menu open. Not a menu item
                     (an item closes the menu); "as the device" stays in settings. -->
                <button
                  type="button"
                  role="switch"
                  class="group/theme flex items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-surface-2"
                  [attr.aria-checked]="theme.resolved() === 'dark'"
                  data-testid="theme-switch"
                  (click)="toggleTheme($event)"
                >
                  <ng-icon
                    [name]="theme.resolved() === 'dark' ? 'lucideMoon' : 'lucideSun'"
                    size="16"
                    class="shrink-0 text-muted"
                  />
                  <span class="flex-1">{{ 'nav.darkTheme' | transloco }}</span>
                  <span
                    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200"
                    [class]="
                      theme.resolved() === 'dark'
                        ? 'border-accent-edge bg-accent'
                        : 'border-line/40 bg-surface-3'
                    "
                    aria-hidden="true"
                    data-theme-knob
                  >
                    <span
                      class="absolute top-1/2 left-0.5 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-text shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                      [class.translate-x-5]="theme.resolved() === 'dark'"
                    >
                      <ng-icon
                        [name]="theme.resolved() === 'dark' ? 'lucideMoon' : 'lucideSun'"
                        size="10"
                      />
                    </span>
                  </span>
                </button>
                @if (site.hasTiers() && user.plan.tier !== 'PREMIUM' && !auth.isAdmin()) {
                  <a
                    cdkMenuItem
                    [routerLink]="panelLink('pro')"
                    [queryParamsHandling]="'merge'"
                    class="flex items-center gap-2.5 rounded-md px-3 py-2 font-semibold hover:bg-surface-2"
                    data-testid="nav-pro"
                    ><ng-icon name="lucideCrown" size="16" class="shrink-0 text-accent-text" />{{
                      'nav.pro' | transloco
                    }}</a
                  >
                }
                @if (auth.isAdmin()) {
                  <a
                    cdkMenuItem
                    routerLink="/admin"
                    class="flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-2"
                    data-testid="nav-admin"
                  >
                    <span class="flex items-center gap-2.5"
                      ><ng-icon name="lucideShieldCheck" size="16" class="shrink-0 text-muted" />{{
                        'nav.admin' | transloco
                      }}</span
                    >
                    <span class="label-mono rounded-sm bg-inverse px-1.5 py-0.5 text-on-inverse">{{
                      'admin.chip' | transloco
                    }}</span>
                  </a>
                }
                <div class="mx-2 my-1 border-t border-line/15" role="separator"></div>
                <button
                  cdkMenuItem
                  type="button"
                  class="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-danger hover:bg-surface-2"
                  (click)="logout()"
                >
                  <ng-icon name="lucideLogOut" size="16" class="shrink-0" />{{
                    'nav.logout' | transloco
                  }}
                </button>
              </div>
            </ng-template>
          } @else if (auth.status() === 'anonymous') {
            <a
              routerLink="/login"
              class="px-2 text-sm font-semibold underline-offset-4 hover:underline"
              >{{ 'nav.login' | transloco }}</a
            >
            @if (site.registrationOpen()) {
              <a
                routerLink="/register"
                class="flex h-11 items-center rounded-full border-2 border-accent-edge bg-accent px-5 text-sm font-semibold text-accent-fg transition-[transform,box-shadow] duration-100 lift-hitbox hover:-translate-y-0.5 hover:shadow-hard-sm"
                >{{ 'nav.register' | transloco }}</a
              >
            }
          }
        </nav>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  protected readonly panelLink = panelLink;
  protected readonly profileLink = profileLink;
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthStore);
  /** Pro is offered in the account menu on the cloud, never self-hosted, nor to an admin. */
  protected readonly site = inject(SiteConfig);
  protected readonly exchange = inject(ExchangeStore);
  protected readonly chat = inject(ChatStore);
  protected readonly support = inject(SupportStore);
  protected readonly whatsNew = inject(WhatsNewStore);
  protected readonly layout = inject(LayoutFrame);
  protected readonly theme = inject(ThemeService);
  /** Past the top, a hard ink line separates the header from the content scrolling under it. */
  protected readonly scrolled = signal(false);
  protected readonly initials = computed(() =>
    (this.auth.user()?.displayName ?? '?').trim().slice(0, 1).toUpperCase(),
  );

  /** The site's home page in front of the app: on the cloud only, null self-hosted. */
  protected readonly siteHome = computed(() => {
    const site = this.site.hasTiers() ? this.site.siteUrl() : null;
    return site ? `${site.replace(/\/$/, '')}/` : null;
  });

  /** The new theme spreads from the switch itself, whether clicked or pressed. */
  protected toggleTheme(e: Event): void {
    const knob = (e.currentTarget as HTMLElement).querySelector('[data-theme-knob]');
    const r = (knob ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    this.theme.toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  constructor() {
    // On the window and passive, by hand: as a host binding, every scrolled frame checked the
    // header and everything under it — on a big shelf, all its tiles.
    const onScroll = () => {
      const scrolled = window.scrollY > 4;
      if (scrolled !== this.scrolled()) this.scrolled.set(scrolled);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', onScroll));
  }

  /** On the cloud the site's home page, with a full load; self-hosted, the app's own. */
  async logout(): Promise<void> {
    await this.auth.logout();
    const home = this.siteHome();
    if (home) location.assign(home);
    else await this.router.navigate(['/']);
  }
}

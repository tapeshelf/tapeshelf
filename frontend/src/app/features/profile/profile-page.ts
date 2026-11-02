import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  type Type,
  computed,
  effect,
  inject,
  input,
  resource,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Dialog } from '@angular/cdk/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideUserPlus } from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, usersGetPublicProfile } from '../../api';
import { AuthStore } from '../../core/auth/auth.store';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { VisitorPreview } from '../../core/preview/visitor-preview.service';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { CoverComponent } from '../../shared/ui/cover/cover';
import { NotFoundPage } from '../not-found/not-found';
import { ProfileActionsComponent } from '../social/profile-actions';
import { closingPanel } from '../../core/navigation/panels';
import { friendsLink, profileLink } from '../../core/navigation/user-links';
import { PageTitle } from '../../core/i18n/title.strategy';
import { ProWelcomeDialog } from '../pro/pro-welcome';
import { InviteDialog } from './invite-dialog';
import { AdminLinkComponent } from '../../shared/ui/admin-link/admin-link';
import { ExchangePrefsComponent } from '../deals/deal-parts';

/**
 * /@username: the videos are the page. A quiet line says whose they are (small
 * avatar, name, counts), the coloured cover only when the owner turns it on; owners get the file
 * manager, visitors the sectioned collection. /p/<code> is the same page through the owner's
 * anonymous link: seen as any visitor sees it — the owner too — without the nickname, the
 * people around them and the actions towards them.
 */
@Component({
  selector: 'app-profile-page',
  imports: [
    ExchangePrefsComponent,
    TranslocoPipe,
    AppDatePipe,
    RouterLink,
    NgIcon,
    ButtonDirective,
    NotFoundPage,
    ProfileActionsComponent,
    NgComponentOutlet,
    CoverComponent,
    AdminLinkComponent,
  ],
  providers: [provideIcons({ lucideEye, lucideEyeOff, lucideUserPlus })],
  template: `
    @if (profile.error()) {
      <app-not-found />
    } @else if (profile.value(); as user) {
      @if (user.pageSettings.showCover) {
        <div
          class="relative mb-8 h-32 overflow-hidden rounded-lg bg-surface-2 sm:h-44 lg:h-52"
          data-testid="profile-cover"
        >
          @if (user.coverUrl) {
            <img
              [src]="user.coverUrl"
              alt=""
              class="h-full w-full object-cover"
              data-testid="cover"
            />
          } @else {
            <app-cover [seed]="user.id" [pattern]="user.coverPattern" [color]="user.accentColor" />
          }
        </div>
      }
      <!-- Who this is: a portrait in the corner, the words beside it, the
           numbers and actions on the right — compact, the videos below are the page. Below a big
           screen the numbers and actions go under the words, as on a phone, so the words keep the
           width. -->
      <section
        class="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
        data-testid="profile-head"
      >
        <div class="flex min-w-0 flex-1 items-start gap-4 sm:gap-6">
          <div
            class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-display text-3xl font-bold text-accent-fg sm:h-24 sm:w-24 sm:text-4xl"
            data-testid="profile-avatar"
          >
            @if (user.avatarUrl) {
              <img
                [src]="user.avatarUrl"
                alt=""
                class="h-full w-full object-cover"
                data-testid="avatar"
              />
            } @else {
              {{ initials() }}
            }
          </div>
          <div class="min-w-0 flex-1 pt-1 sm:pt-2">
            <h1
              class="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-xl leading-tight font-semibold tracking-tight sm:text-2xl"
            >
              <span class="min-w-0 break-words">{{
                user.displayName || ('common.anonymous' | transloco)
              }}</span>
              @if (user.pro) {
                <!-- Has Pro right now (cloud only). -->
                <span
                  class="label-mono shrink-0 rounded-full bg-inverse px-1.5 py-px text-[10px] font-semibold tracking-normal text-on-inverse"
                  data-testid="profile-pro"
                  >{{ 'common.tier.PREMIUM' | transloco }}</span
                >
              }
            </h1>
            <p class="label-mono mt-1.5 text-muted">
              @if (anonymous()) {
                <!-- Through an anonymous link: no nickname and no address of the page. -->
              } @else if (user.pageHidden) {
                &#64;{{ user.username }}
              } @else {
                <!-- The shelf's own address, ready to send: a click on the name copies
                     it. A hidden page opens for nobody else, so it has none to send. -->
                <button
                  type="button"
                  class="-mx-1 rounded px-1 underline-offset-4 transition-colors hover:text-text hover:underline"
                  [title]="'profile.copyLink' | transloco"
                  [attr.aria-label]="'profile.copyLink' | transloco"
                  data-testid="copy-shelf-link"
                  (click)="copyShelfLink(user.username)"
                >
                  &#64;{{ user.username }}
                </button>
              }
              @if (!anonymous()) {
                ·
              }
              {{ 'profile.joined' | transloco: { date: (user.createdAt | appDate: 'mediumDate') } }}
              @if (user.pageHidden) {
                <!-- Only the owner and admins get a hidden page: the mark alone, no hint. -->
                <span
                  class="ml-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-text"
                  data-testid="profile-hidden"
                  ><ng-icon name="lucideEyeOff" size="12" />{{ 'profile.hidden' | transloco }}</span
                >
              }
              <app-admin-link
                class="-my-1 ml-1 inline-block align-middle"
                [to]="['/admin/users', user.id]"
              />
            </p>
            @if (user.bio) {
              <p
                class="mt-4 max-w-3xl text-[15px] leading-relaxed break-words whitespace-pre-line text-text/85 sm:max-lg:text-sm"
              >
                {{ user.bio }}
              </p>
            }
            <!-- What they look for in exchanges, when they show it on the shelf: wide
                 enough for both side by side on a big screen. On a middle-sized screen the
                 bio and these are a size smaller. -->
            <app-exchange-prefs
              class="mt-4 block max-w-4xl sm:max-lg:[&_dl]:text-[13px]"
              [wants]="user.exchangeWants"
              [avoid]="user.exchangeAvoid"
            />
          </div>
        </div>
        <div class="flex flex-col items-start gap-3 lg:items-end lg:pt-2">
          <nav
            class="flex flex-wrap items-baseline gap-x-5 gap-y-1 lg:justify-end"
            [attr.aria-label]="'social.countsLabel' | transloco"
            data-testid="profile-counts"
          >
            <span class="text-[13px]">
              <b class="font-semibold">{{ user.videoCount }}</b>
              <span class="label-mono ml-1 text-muted uppercase">{{
                'social.counts.videos' | transloco
              }}</span>
            </span>
            @for (c of anonymous() ? [] : countLinks; track c) {
              <a
                class="group text-[13px]"
                [routerLink]="friendsLink(user.username)"
                [queryParamsHandling]="'merge'"
                [queryParams]="{ list: c }"
              >
                <b class="font-semibold group-hover:text-accent-text">{{ user.counts[c] }}</b>
                <span
                  class="label-mono ml-1 text-muted uppercase underline-offset-4 group-hover:text-text group-hover:underline"
                  >{{ 'social.counts.' + c | transloco }}</span
                >
              </a>
            }
          </nav>
          @if (isOwn()) {
            <div class="flex flex-wrap items-center gap-2 lg:justify-end">
              <!-- A link that makes friends. -->
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                data-testid="invite-friend"
                (click)="invite()"
              >
                <ng-icon name="lucideUserPlus" size="14" />
                {{ 'invites.button' | transloco }}
              </button>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [attr.aria-pressed]="preview.active()"
                data-testid="view-as-visitor"
                (click)="preview.active() ? preview.stop() : preview.start()"
              >
                <ng-icon [name]="preview.active() ? 'lucideEyeOff' : 'lucideEye'" size="14" />
                {{
                  (preview.active() ? 'library.backToManager' : 'library.viewAsVisitor') | transloco
                }}
              </button>
            </div>
          } @else if (!anonymous()) {
            <app-profile-actions [user]="user" (changed)="profile.reload()" />
          }
        </div>
      </section>
      @if (shelf.value(); as s) {
        <ng-container
          *ngComponentOutlet="
            s.component;
            inputs: s.own
              ? { username: user.username }
              : { username: handle(), pageSettings: user.pageSettings, asVisitor: isOwn() }
          "
        />
      }
    }
  `,
})
export class ProfilePage {
  protected readonly friendsLink = friendsLink;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly clipboard = inject(ClipboardService);
  private readonly dialog = inject(Dialog);

  /** /@username */
  readonly username = input<string>();
  /** /p/<code>: an anonymous link. */
  readonly code = input<string>();
  /** Who the API is asked about: the username, or the link as `~<code>`. */
  protected readonly handle = computed(() => {
    const code = this.code();
    return code ? `~${code.toLowerCase()}` : (this.username() ?? '');
  });
  protected readonly anonymous = computed(() => !!this.code());
  /** `?welcome=pro`: Pro has just come on, the own shelf says what it brings, once. */
  readonly welcome = input<string>();
  private welcomed = false;
  /** Fetched again when the owner switches the visitor preview: the API answers as to a guest then. */
  protected readonly profile = resource({
    params: () => ({ username: this.handle(), asGuest: this.preview.active() }),
    loader: ({ params }) => this.api.invoke(usersGetPublicProfile, { username: params.username }),
  });
  /** Through an anonymous link the owner sees what anyone would. */
  protected readonly isOwn = computed(
    () => !this.anonymous() && this.auth.user()?.id === this.profile.value()?.id,
  );
  /** Whether the owner's file manager shows, as far as known: the address until the profile is in. */
  private readonly ownShelf = computed(() => {
    const me = this.auth.user();
    if (!me || this.preview.active() || this.anonymous()) return false;
    return this.profile.hasValue()
      ? me.id === this.profile.value().id
      : me.username === this.handle().toLowerCase();
  });
  /**
   * The shelf's code, fetched while the profile loads: a visitor no longer downloads the
   * owner's file manager (≈170 kB, drag and drop included), nor the owner the visitor's view.
   */
  protected readonly shelf = resource({
    params: () => ({ own: this.ownShelf() }),
    loader: async ({ params }) => ({
      own: params.own,
      component: (params.own
        ? (await import('../library/library')).LibraryComponent
        : (await import('../collection/collection-view')).CollectionViewComponent) as Type<unknown>,
    }),
  });
  protected readonly preview = inject(VisitorPreview);
  protected readonly countLinks = ['friends', 'followers', 'following'] as const;
  private readonly t = inject(TranslocoService);
  protected readonly initials = computed(() =>
    (this.profile.value()?.displayName || this.t.translate('common.anonymous') || '?')
      .trim()
      .slice(0, 1)
      .toUpperCase(),
  );

  constructor() {
    effect(() => {
      if (this.welcome() !== 'pro' || !this.isOwn() || this.welcomed) return;
      this.welcomed = true;
      untracked(() => {
        // The shelf may have stayed open under the Pro page: its badge and lists are read again.
        this.profile.reload();
        // The address without the flag, spelled out: the navigation that brought it may not have
        // finished yet, and one made from the current address would bring the Pro panel back.
        void this.router.navigate(closingPanel(profileLink(this.profile.value()!.username)), {
          replaceUrl: true,
        });
        if (this.auth.user()?.plan.tier === 'PREMIUM')
          this.dialog.open(ProWelcomeDialog, {
            backdropClass: 'vs-backdrop',
            autoFocus: '[cdkFocusInitial]',
          });
      });
    });
    // Settings open over the page: what the owner saves there — name, bio, avatar, cover,
    // what they look for in exchanges, how visitors see the page — shows on it at once, without
    // reloading by hand. Every save hands the account back to the auth store.
    let seen = this.auth.user();
    effect(() => {
      const me = this.auth.user();
      if (me === seen) return;
      seen = me;
      untracked(() => {
        if (me && this.isOwn()) this.profile.reload();
      });
    });
    // The tab reads "@ann · tapeshelf"; the canonical name once the page is loaded. Through an
    // anonymous link, the name the owner goes by there.
    inject(PageTitle).track(() => {
      if (!this.anonymous())
        return `@${this.profile.hasValue() ? this.profile.value().username : this.handle()}`;
      return this.profile.hasValue()
        ? this.profile.value().displayName || this.t.translate('common.anonymous')
        : null;
    });
    // Former usernames resolve to the canonical one: fix the URL without a history entry.
    effect(() => {
      if (!this.profile.hasValue() || this.anonymous()) return; // value() throws in the error state
      const canonical = this.profile.value().username;
      if (canonical !== this.handle())
        void this.router.navigate(profileLink(canonical), { replaceUrl: true });
    });
  }

  protected invite(): void {
    this.dialog.open(InviteDialog, { backdropClass: 'vs-backdrop', autoFocus: 'first-tabbable' });
  }

  protected async copyShelfLink(username: string): Promise<void> {
    await this.clipboard.copy(`${location.origin}/@${username}`, 'video.linkCopied');
  }
}

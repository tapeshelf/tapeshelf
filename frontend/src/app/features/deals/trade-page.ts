import { Location, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  type OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucideCheck,
  lucideCopy,
  lucideDownload,
  lucideHourglass,
  lucideLoader,
  lucidePlus,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { dealsAccept } from '../../api/fn/deals/deals-accept';
import { dealsAdopt } from '../../api/fn/deals/deals-adopt';
import { dealsCancel } from '../../api/fn/deals/deals-cancel';
import { dealsClaim } from '../../api/fn/deals/deals-claim';
import { dealsCounter } from '../../api/fn/deals/deals-counter';
import { dealsDecline } from '../../api/fn/deals/deals-decline';
import { dealsEmail } from '../../api/fn/deals/deals-email';
import { dealsInvite } from '../../api/fn/deals/deals-invite';
import { dealsPlayback } from '../../api/fn/deals/deals-playback';
import { dealsRemoveUpload } from '../../api/fn/deals/deals-remove-upload';
import { dealsSend } from '../../api/fn/deals/deals-send';
import { dealsSingle } from '../../api/fn/deals/deals-single';
import { dealsStart } from '../../api/fn/deals/deals-start';
import { dealsView } from '../../api/fn/deals/deals-view';
import { exchangeCreate } from '../../api/fn/exchange/exchange-create';
import { exchangeOfferable } from '../../api/fn/exchange/exchange-offerable';
import type { ExchangeInviteDto } from '../../api/models/exchange-invite-dto';
import type { GuestDealDto } from '../../api/models/guest-deal-dto';
import type { OfferVideoDto } from '../../api/models/offer-video-dto';
import type { PlaybackDto } from '../../api/models/playback-dto';
import type { VideoCardDto } from '../../api/models/video-card-dto';
import { LanguageService } from '../../core/i18n/language.service';
import { errorText, toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { isAnonymous, profileLink } from '../../core/navigation/user-links';
import { SiteConfig } from '../../core/site/site-config';
import { formatBytes } from '../../shared/pipes/bytes.pipe';
import { formatDuration } from '../../shared/pipes/duration.pipe';
import { EMAIL_MAX, REQUEST_MESSAGE_MAX } from '../../shared/forms/limits';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { CaptchaComponent } from '../../shared/ui/captcha/captcha';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { MosaicComponent } from '../../shared/ui/mosaic/mosaic';
import { PromptService } from '../../shared/ui/prompt/prompt-dialog';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { timeLeft } from '../links/links';
import type { TimelineFrame } from '../video/player-utils';
import { VideoPlayerComponent } from '../video/video-player';
import { DealGalleryComponent, videoMeta } from './deal-gallery';
import { ExchangePrefsComponent, FairExchangeComponent } from './deal-parts';
import { GuestUploader } from './guest-uploader';
import { exchangeLinkUrl } from './exchange-links';

interface Upload {
  file: File;
  sent: number;
  error: string | null;
}

type Phase =
  | 'loading'
  | 'gone'
  | 'own'
  | 'person'
  | 'signIn'
  | 'draft'
  | 'sent'
  | 'waiting'
  | 'myMove'
  | 'compose'
  | 'done'
  | 'over';

const POLL_MS = 6000;

/**
 * A fair exchange: /x/<code> (an exchange link), /x/v/<code>?h=<holder> (one private
 * video), /deal/<id> (a guest's deal). The videos are the page — big frame previews in their own
 * shapes on the left; the deal itself on the right, from the first look: a guest adds their videos
 * at once (the deal starts with the first file), a person picks theirs from their shelf.
 */
@Component({
  selector: 'app-trade-page',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    NgIcon,
    TranslocoPipe,
    AlertComponent,
    AvatarComponent,
    ButtonDirective,
    CaptchaComponent,
    InputDirective,
    MosaicComponent,
    SpinnerComponent,
    VideoPlayerComponent,
    DealGalleryComponent,
    ExchangePrefsComponent,
    FairExchangeComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideCheck,
      lucideCopy,
      lucideDownload,
      lucideHourglass,
      lucideLoader,
      lucidePlus,
      lucideX,
    }),
  ],
  template: `
    <div class="mx-auto w-full max-w-[110rem] py-4 lg:py-6">
      @if (phase() === 'loading') {
        <div class="flex justify-center py-24 text-muted"><app-spinner /></div>
      } @else if (phase() === 'gone') {
        <app-alert kind="error" class="mx-auto block max-w-xl" data-testid="trade-gone">{{
          (dealId()
            ? site.emailEnabled()
              ? 'deals.trade.dealGone'
              : 'deals.trade.dealGoneNoMail'
            : 'deals.trade.linkGone'
          ) | transloco
        }}</app-alert>
        @if (dealId(); as id) {
          <!-- A deal taken into an account is that account's request now. -->
          <p class="mx-auto mt-4 max-w-xl text-sm text-muted">
            {{ 'deals.trade.dealGoneAccount' | transloco }}
            <a
              routerLink="/login"
              [queryParams]="{ returnTo: '/exchange/' + id }"
              class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4"
              >{{ 'auth.login.title' | transloco }}</a
            >
          </p>
        }
      } @else {
        <div
          class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
        >
          <section class="min-w-0">
            <header class="mb-6">
              <h1 class="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                {{ 'deals.fair.title' | transloco }}
              </h1>
              @if (owner(); as o) {
                <p class="mt-2 flex items-center gap-2 text-sm">
                  <app-avatar [url]="o.avatarUrl" [name]="o.displayName" [size]="28" />
                  @if (o.pageHidden) {
                    <span class="min-w-0 font-semibold">{{ o.displayName }}</span>
                  } @else {
                    <a
                      [routerLink]="ownerLink()"
                      class="min-w-0 font-semibold hover:text-accent-text"
                      >{{ o.displayName }}</a
                    >
                  }
                </p>
              }
            </header>

            @if (board()) {
              <div
                class="rounded-xl border-2 border-line bg-surface p-4 sm:p-5"
                data-testid="trade-board"
              >
                <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6">
                  <section class="min-w-0">
                    <ng-container
                      *ngTemplateOutlet="
                        sideHead;
                        context: { title: 'deals.trade.youGet', videos: getVideos() }
                      "
                    />
                    <app-deal-gallery
                      [videos]="getVideos()"
                      [compact]="true"
                      [selected]="phase() === 'compose' ? want() : null"
                      (picked)="flip(want, $event)"
                      data-testid="trade-get"
                    />
                  </section>
                  <div class="flex items-center gap-3 md:flex-col" aria-hidden="true">
                    <span class="h-0.5 flex-1 rounded-full bg-line/15 md:w-0.5"></span>
                    <span
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-accent-edge bg-accent text-accent-fg"
                    >
                      <ng-icon
                        name="lucideArrowLeftRight"
                        size="20"
                        class="rotate-90 md:rotate-0"
                      />
                    </span>
                    <span class="h-0.5 flex-1 rounded-full bg-line/15 md:w-0.5"></span>
                  </div>
                  <section class="min-w-0">
                    <ng-container
                      *ngTemplateOutlet="
                        sideHead;
                        context: { title: 'deals.trade.youGive', videos: giveVideos() }
                      "
                    />
                    @if (giveVideos().length) {
                      <app-deal-gallery
                        [videos]="giveVideos()"
                        [compact]="true"
                        [selected]="phase() === 'compose' ? give() : null"
                        (picked)="flip(give, $event)"
                        data-testid="trade-give"
                      />
                    } @else {
                      <p
                        class="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-line/30 px-4 text-center text-sm text-muted"
                      >
                        {{ 'deals.trade.giveEmpty' | transloco }}
                      </p>
                    }
                  </section>
                </div>
              </div>
            } @else {
              <h2 class="label-mono mb-2 text-muted">
                {{ (phase() === 'done' ? 'deals.trade.youGot' : 'deals.trade.youGet') | transloco }}
              </h2>
              @if (phase() === 'done') {
                @if (received().length) {
                  <app-mosaic
                    [items]="received()"
                    [key]="videoKey"
                    [aspect]="aspect"
                    [itemTemplate]="player"
                    [gap]="16"
                  />
                } @else {
                  <p class="text-sm text-muted">{{ 'deals.trade.accessOver' | transloco }}</p>
                }
              } @else {
                <app-deal-gallery [videos]="getVideos()" data-testid="trade-get" />
              }
              @if (phase() === 'done' && giveVideos().length) {
                <h2 class="label-mono mt-10 mb-2 text-muted">
                  {{ 'deals.trade.youGave' | transloco }}
                </h2>
                <app-deal-gallery
                  [videos]="giveVideos()"
                  [compact]="true"
                  data-testid="trade-give"
                />
              }
            }
          </section>

          <aside class="flex flex-col gap-4 lg:sticky lg:top-20" data-testid="trade-panel">
            <app-exchange-prefs [wants]="owner()?.exchangeWants" [avoid]="owner()?.exchangeAvoid" />

            <div class="rounded-xl border-2 border-line bg-surface p-5">
              <p class="text-base font-semibold" data-testid="trade-state">{{ stateTitle() }}</p>
              @if (stateText(); as text) {
                <p class="mt-1 text-sm text-muted">{{ text }}</p>
              }
              @if (left(); as l) {
                <p class="mt-3 flex items-center gap-2 text-sm" data-testid="trade-timer">
                  <ng-icon name="lucideHourglass" size="16" class="shrink-0 text-accent-text" />
                  <span class="font-mono font-semibold">
                    @if (l.days) {
                      {{ 'links.page.days' | transloco: { d: l.days } }}
                    }
                    {{ l.clock }}
                  </span>
                </p>
              }
              @if (declineComment(); as c) {
                <!-- What the holder said when declining, as a person sees it in the thread. -->
                <p
                  class="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-line"
                  data-testid="trade-decline-comment"
                >
                  {{ c }}
                </p>
              }
              @if (theirMessage(); as m) {
                <p class="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">
                  {{ m }}
                </p>
              }

              @switch (phase()) {
                @case ('own') {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    class="mt-4 w-full"
                    (click)="copyOwnLink()"
                  >
                    <ng-icon name="lucideCopy" size="15" />{{ 'deals.trade.copyLink' | transloco }}
                  </button>
                }
                @case ('signIn') {
                  <div class="mt-4 flex gap-2">
                    <a
                      appButton
                      class="flex-1"
                      routerLink="/login"
                      [queryParams]="{ returnTo: here() }"
                      >{{ 'auth.login.title' | transloco }}</a
                    >
                    <a
                      appButton
                      variant="secondary"
                      class="flex-1"
                      routerLink="/register"
                      [queryParams]="{ returnTo: here() }"
                      >{{ 'auth.login.register' | transloco }}</a
                    >
                  </div>
                }
                @case ('person') {
                  @if (mine.isLoading()) {
                    <div class="flex justify-center py-6 text-muted"><app-spinner /></div>
                  } @else if (!(mine.value()?.mine ?? []).length) {
                    <p class="mt-4 text-sm text-muted">
                      {{ 'deals.trade.nothingToGive' | transloco }}
                    </p>
                  } @else {
                    <ul
                      class="mt-4 flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                      data-testid="trade-mine"
                    >
                      @for (v of mine.value()!.mine; track v.id) {
                        <li>
                          <button
                            type="button"
                            class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                            [class.bg-accent-soft]="give().has(v.id)"
                            [attr.aria-pressed]="give().has(v.id)"
                            data-testid="trade-pick"
                            (click)="flip(give, v.id)"
                          >
                            <span
                              class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-line"
                              [class.bg-accent]="give().has(v.id)"
                              aria-hidden="true"
                            >
                              @if (give().has(v.id)) {
                                <ng-icon name="lucideCheck" size="13" />
                              }
                            </span>
                            <span class="h-9 w-14 shrink-0 overflow-hidden rounded bg-surface-2">
                              @if (v.thumbnailUrl) {
                                <img
                                  [src]="v.thumbnailUrl"
                                  alt=""
                                  class="h-full w-full object-cover"
                                />
                              }
                            </span>
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-sm">{{ v.title }}</span>
                              <span class="label-mono block truncate text-muted">{{
                                meta(v)
                              }}</span>
                            </span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                  <ng-container *ngTemplateOutlet="messageBox" />
                  <button
                    type="button"
                    appButton
                    class="mt-4 w-full"
                    [disabled]="busy() || !give().size"
                    data-testid="trade-send"
                    (click)="sendAsPerson()"
                  >
                    {{ 'deals.trade.send' | transloco }}
                  </button>
                }
                @case ('draft') {
                  <ng-container *ngTemplateOutlet="uploader" />
                  <ng-container *ngTemplateOutlet="messageBox" />
                  <!-- News of the deal go by mail: not offered where none goes out. -->
                  @if (site.emailEnabled()) {
                    <label class="mt-3 block text-sm">
                      <span class="label-mono mb-1 block text-muted">{{
                        'deals.trade.email' | transloco
                      }}</span>
                      <input
                        appInput
                        type="email"
                        autocomplete="email"
                        [maxlength]="emailMax"
                        [(ngModel)]="email"
                        data-testid="trade-email"
                      />
                    </label>
                  }
                  <button
                    type="button"
                    appButton
                    class="mt-4 w-full"
                    [disabled]="busy() || !readyToSend()"
                    data-testid="trade-send"
                    (click)="sendAsGuest()"
                  >
                    {{ 'deals.trade.send' | transloco }}
                  </button>
                  <!-- Consent as at sign-up: the terms apply to guests too. A new tab,
                       so the uploads under way go on. -->
                  <p class="mt-3 text-xs leading-relaxed text-muted" data-testid="trade-terms">
                    {{ 'deals.trade.agreeBefore' | transloco }}
                    <a
                      href="/terms"
                      target="_blank"
                      class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
                      >{{ 'auth.register.agreeTerms' | transloco }}</a
                    >
                    {{ 'auth.register.agreeAnd' | transloco }}
                    <a
                      href="/privacy"
                      target="_blank"
                      class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
                      >{{ 'auth.register.agreePrivacy' | transloco }}</a
                    >{{ 'auth.register.agreeAfter' | transloco }}
                  </p>
                  @if (sendHint(); as hint) {
                    <p
                      class="mt-2 flex items-center gap-2 text-sm text-muted"
                      data-testid="trade-send-hint"
                    >
                      @if (hint === 'deals.trade.notReady') {
                        <ng-icon name="lucideLoader" size="14" class="shrink-0 animate-spin" />
                      }
                      {{ hint | transloco }}
                    </p>
                  }
                }
                @case ('myMove') {
                  <div class="mt-4 flex flex-col gap-2">
                    @if (actions().includes('accept')) {
                      <button
                        type="button"
                        appButton
                        [disabled]="busy()"
                        data-testid="trade-accept"
                        (click)="accept()"
                      >
                        {{ 'deals.trade.accept' | transloco }}
                      </button>
                    }
                    @if (actions().includes('counter')) {
                      <button
                        type="button"
                        appButton
                        variant="secondary"
                        [disabled]="busy()"
                        (click)="compose()"
                      >
                        {{ 'deals.trade.counter' | transloco }}
                      </button>
                    }
                    @if (actions().includes('decline')) {
                      <button
                        type="button"
                        appButton
                        variant="ghost"
                        [disabled]="busy()"
                        (click)="decline()"
                      >
                        {{ 'deals.trade.decline' | transloco }}
                      </button>
                    }
                  </div>
                }
                @case ('compose') {
                  <ng-container *ngTemplateOutlet="uploader" />
                  <ng-container *ngTemplateOutlet="messageBox" />
                  <div class="mt-4 flex gap-2">
                    <button
                      type="button"
                      appButton
                      class="flex-1"
                      [disabled]="busy() || !want().size || !give().size || uploads().length > 0"
                      (click)="counter()"
                    >
                      {{ 'deals.trade.sendCounter' | transloco }}
                    </button>
                    <button type="button" appButton variant="ghost" (click)="composing.set(false)">
                      {{ 'common.cancel' | transloco }}
                    </button>
                  </div>
                }
              }

              @if (captchaNeeded() && site.captchaSiteKey(); as key) {
                <div class="mt-4">
                  <p class="mb-2 text-sm text-muted">{{ 'deals.trade.captcha' | transloco }}</p>
                  <app-captcha [siteKey]="key" (token)="onCaptcha($event)" />
                </div>
              }
              @if (error(); as e) {
                <app-alert kind="error" class="mt-4 block">{{ e }}</app-alert>
              }
              @if (canCancel()) {
                <button
                  type="button"
                  class="mt-4 text-xs text-muted underline-offset-4 hover:text-danger hover:underline"
                  [disabled]="busy()"
                  data-testid="trade-cancel"
                  (click)="cancel()"
                >
                  {{ 'deals.trade.cancel' | transloco }}
                </button>
              }
            </div>

            @if (deal(); as v) {
              <div
                class="flex flex-col gap-3 rounded-xl border-2 border-line bg-surface p-5 text-sm"
              >
                @if (phase() !== 'draft' && site.emailEnabled()) {
                  @if (v.email && !changingEmail()) {
                    <p data-testid="trade-email-set">
                      {{ 'deals.trade.emailOn' | transloco: { email: v.email } }}
                      <button
                        type="button"
                        class="ml-1 text-muted underline"
                        (click)="changingEmail.set(true)"
                      >
                        {{ 'deals.trade.emailChange' | transloco }}
                      </button>
                    </p>
                  } @else {
                    <div>
                      <p class="label-mono mb-1 text-muted">
                        {{ 'deals.trade.email' | transloco }}
                      </p>
                      <div class="flex gap-2">
                        <input
                          appInput
                          type="email"
                          [maxlength]="emailMax"
                          autocomplete="email"
                          class="min-w-0 flex-1"
                          [(ngModel)]="email"
                        />
                        <button
                          type="button"
                          appButton
                          variant="secondary"
                          [disabled]="busy() || !email.trim()"
                          (click)="saveEmail()"
                        >
                          {{ 'common.save' | transloco }}
                        </button>
                      </div>
                    </div>
                  }
                }
                @if (guestKey) {
                  <button
                    type="button"
                    class="flex items-center gap-2 text-left text-muted hover:text-text"
                    (click)="copyDealLink()"
                  >
                    <ng-icon name="lucideCopy" size="14" />{{ 'deals.trade.copyDeal' | transloco }}
                  </button>
                  @if (!site.emailEnabled()) {
                    <!-- No mail brings this link later: it is the only way back from elsewhere. -->
                    <p class="text-muted" data-testid="trade-keep-link">
                      {{ 'deals.trade.keepLink' | transloco }}
                    </p>
                  }
                }
                <p class="text-muted">
                  {{ 'deals.trade.account' | transloco }}
                  <a
                    routerLink="/login"
                    [queryParams]="{ returnTo: here() }"
                    class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4"
                    >{{ 'auth.login.title' | transloco }}</a
                  >
                  ·
                  <a
                    routerLink="/register"
                    [queryParams]="{ returnTo: here() }"
                    class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4"
                    >{{ 'auth.login.register' | transloco }}</a
                  >
                </p>
              </div>
            }

            <details class="group rounded-xl border-2 border-line bg-surface" [open]="!deal()">
              <summary class="cursor-pointer px-5 py-3 text-sm font-semibold">
                {{ 'deals.trade.how' | transloco }}
              </summary>
              <app-fair-exchange
                class="block px-5 pb-5"
                [guest]="!auth.isAuthenticated()"
                [bare]="true"
              />
            </details>
          </aside>
        </div>
      }
    </div>

    <ng-template #uploader>
      <div class="mt-4" data-testid="trade-uploads">
        @if (myUploads().length || uploads().length) {
          <ul
            class="mb-3 flex flex-col divide-y divide-line/15 rounded-lg border-2 border-line text-sm"
          >
            @for (u of myUploads(); track u.id) {
              <li class="flex items-center gap-3 px-3 py-2" data-testid="trade-upload">
                <span class="min-w-0 flex-1 truncate" [title]="u.title">{{ u.title }}</span>
                <span class="label-mono shrink-0 text-muted">
                  @if (u.status === 'READY') {
                    {{ bytes(u.sizeBytes) }}
                  } @else if (u.status === 'FAILED') {
                    <span class="text-danger">{{ 'deals.trade.failed' | transloco }}</span>
                  } @else {
                    {{ 'deals.trade.processing' | transloco: { pct: u.progress } }}
                  }
                </span>
                @if (phase() === 'draft' || !u.inOffer) {
                  <button
                    type="button"
                    class="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                    [attr.aria-label]="'deals.trade.remove' | transloco"
                    [disabled]="busy()"
                    (click)="remove(u.id)"
                  >
                    <ng-icon name="lucideX" size="14" />
                  </button>
                }
              </li>
            }
            @for (p of uploads(); track p.file) {
              <li class="px-3 py-2">
                <div class="flex items-center gap-3">
                  <span class="min-w-0 flex-1 truncate">{{ p.file.name }}</span>
                  <span class="label-mono shrink-0 text-muted">{{ pct(p) }}%</span>
                </div>
                <div
                  class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  [attr.aria-valuenow]="pct(p)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    class="h-full rounded-full bg-accent transition-[width] duration-300"
                    [style.width.%]="pct(p)"
                  ></div>
                </div>
                @if (p.error) {
                  <p class="mt-1 text-xs text-danger">{{ p.error }}</p>
                }
              </li>
            }
          </ul>
        }
        @if (myUploads().length + uploads().length < maxUploads()) {
          <label
            class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-line px-4 py-5 text-center text-sm hover:border-accent hover:bg-surface-2"
            [class.border-accent]="dragging()"
            (dragover)="$event.preventDefault(); dragging.set(true)"
            (dragleave)="dragging.set(false)"
            (drop)="drop($event)"
          >
            <span class="flex items-center gap-1.5 font-semibold"
              ><ng-icon name="lucidePlus" size="16" />{{ 'deals.trade.add' | transloco }}</span
            >
            <span class="text-xs text-muted">{{
              (fileMax() ? 'deals.trade.addHint' : 'deals.trade.addHintAny')
                | transloco: { max: maxUploads(), size: bytes(fileMax()) }
            }}</span>
            <input
              type="file"
              accept="video/*"
              multiple
              class="sr-only"
              data-testid="trade-file"
              (change)="pick($event)"
            />
          </label>
        }
      </div>
    </ng-template>

    <ng-template #sideHead let-title="title" let-videos="videos">
      <h2 class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span class="text-base font-semibold">{{ title | transloco }}</span>
        @if (videos.length) {
          <span class="label-mono text-muted">{{ total(videos) }}</span>
        }
      </h2>
    </ng-template>

    <ng-template #messageBox>
      <label class="mt-3 block text-sm">
        <span class="label-mono mb-1 block text-muted">{{ 'deals.message' | transloco }}</span>
        <textarea
          appInput
          rows="2"
          [maxlength]="messageMax"
          [(ngModel)]="message"
          data-testid="trade-message"
        ></textarea>
      </label>
    </ng-template>

    <ng-template #player let-v let-h="height">
      <figure class="mb-1" data-testid="trade-received">
        <div
          class="relative overflow-hidden rounded-lg bg-black"
          [style.height.px]="h"
          [style.aspect-ratio]="h === null ? aspect(v) : null"
        >
          <app-video-player
            class="absolute inset-0 h-full"
            [videoId]="v.id"
            [frames]="framesOf(v)"
            [poster]="v.thumbnailUrl"
            [source]="sourceOf(v)"
          />
        </div>
        <figcaption class="mt-1.5 flex items-center gap-3 px-0.5">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold">{{ v.title }}</span>
            <span class="label-mono block truncate text-muted">{{ meta(v) }}</span>
          </span>
          <a appButton variant="secondary" size="sm" [href]="downloadUrl(v)">
            <ng-icon name="lucideDownload" size="14" />{{ 'links.page.download' | transloco }}
          </a>
        </figcaption>
      </figure>
    </ng-template>
  `,
})
export class TradePage implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly confirm = inject(ConfirmService);
  private readonly prompt = inject(PromptService);
  private readonly uploader = inject(GuestUploader);
  protected readonly auth = inject(AuthStore);
  protected readonly site = inject(SiteConfig);

  /** /x/<code> or /x/v/<code>: the link's code, or the video's. */
  readonly code = input<string>();
  /** /x/v/<code>?h=<holder>: the shelf the video is on. */
  readonly h = input<string>();
  /** /deal/<id> */
  readonly id = input<string>();
  /** A mail's link: the guest's key, let in and then dropped from the address. */
  readonly k = input<string>();

  private readonly captcha = viewChild(CaptchaComponent);
  protected readonly invite = signal<ExchangeInviteDto | null>(null);
  protected readonly deal = signal<GuestDealDto | null>(null);
  protected readonly dealId = signal<string | null>(null);
  protected readonly gone = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly uploads = signal<Upload[]>([]);
  protected readonly composing = signal(false);
  protected readonly changingEmail = signal(false);
  protected readonly captchaNeeded = signal(false);
  protected readonly dragging = signal(false);
  protected readonly want = signal<ReadonlySet<string>>(new Set());
  protected readonly give = signal<ReadonlySet<string>>(new Set());
  protected message = '';
  protected email = '';
  /** The guest's key while it is at hand (right after the start): to keep the deal's link. */
  protected guestKey: string | null =
    (history.state as { dealKey?: string } | null)?.dealKey ?? null;
  private captchaToken: string | null = null;
  private waitingFiles: File[] = [];
  private readonly now = signal(Date.now());
  private loadedAt = Date.now();
  private readonly frames = new Map<string, TimelineFrame[]>();
  private readonly sources = new Map<string, () => Promise<PlaybackDto>>();

  protected readonly videoKey = (v: VideoCardDto) => v.id;
  protected readonly aspect = (v: VideoCardDto) => aspectOf(v.width, v.height);
  protected readonly meta = videoMeta;
  protected readonly bytes = formatBytes;
  protected readonly messageMax = REQUEST_MESSAGE_MAX;
  protected readonly emailMax = EMAIL_MAX;

  /** A person's own videos to give, on a link's or a video's page. */
  protected readonly mine = {
    value: signal<{ mine: OfferVideoDto[] } | null>(null),
    isLoading: signal(false),
  };

  protected readonly owner = computed(() => {
    const d = this.deal()?.deal.holder;
    const o = d
      ? {
          username: d.username,
          displayName: d.displayName,
          avatarUrl: d.avatarUrl,
          pageHidden: d.pageHidden,
          exchangeWants: d.exchangeWants,
          exchangeAvoid: d.exchangeAvoid,
        }
      : (this.invite()?.owner ?? null);
    // Known by an anonymous link without a name of its own: "Anonymous".
    if (o && !o.displayName && isAnonymous(o.username)) {
      this.language.loaded();
      return { ...o, displayName: this.t.translate('common.anonymous') };
    }
    return o;
  });
  protected readonly ownerLink = computed(() => profileLink(this.owner()?.username ?? ''));

  protected readonly current = computed(() => {
    const d = this.deal()?.deal;
    if (!d) return null;
    return d.offers.find((o) => o.id === d.currentOfferId) ?? d.offers[0] ?? null;
  });
  protected readonly actions = computed(() => this.deal()?.deal.actions ?? []);

  protected readonly phase = computed<Phase>(() => {
    if (this.gone()) return 'gone';
    const v = this.deal();
    if (v) {
      const s = v.deal.status;
      if (s === 'DRAFT') return v.sent ? 'sent' : 'draft';
      if (s === 'OPEN')
        return this.composing() ? 'compose' : v.deal.awaitingMe ? 'myMove' : 'waiting';
      if (s === 'ACCEPTED') return 'done';
      return 'over';
    }
    if (this.dealId()) return 'loading';
    const inv = this.invite();
    if (!inv) return 'loading';
    if (inv.own) return 'own';
    if (this.auth.isAuthenticated()) return 'person';
    return inv.guestExchange ? 'draft' : 'signIn';
  });

  protected readonly getVideos = computed<VideoCardDto[]>(() => {
    if (this.phase() === 'compose') return this.deal()?.holderVideos ?? [];
    const cur = this.current();
    if (cur) return cur.items.filter((i) => i.givingSide === 'HOLDER').map((i) => i.video);
    return this.invite()?.videos ?? [];
  });
  protected readonly myUploads = computed(() => this.deal()?.uploads ?? []);
  protected readonly giveVideos = computed<VideoCardDto[]>(() => {
    const p = this.phase();
    if (p === 'compose') return this.myUploads().filter((u) => u.status === 'READY');
    if (p === 'person') {
      const picked = this.give();
      return (this.mine.value()?.mine ?? []).filter((v) => picked.has(v.id));
    }
    const cur = this.current();
    if (cur) return cur.items.filter((i) => i.givingSide === 'REQUESTER').map((i) => i.video);
    return [];
  });
  protected readonly received = computed(() => this.deal()?.received ?? []);
  protected readonly maxUploads = computed(() => this.deal()?.maxUploads ?? 5);
  /** A Free account's file size, from the server: 0 = no limit (self-hosted). */
  protected readonly fileMax = computed(
    () => this.deal()?.maxFileBytes ?? this.invite()?.guestFileBytes ?? 0,
  );
  /** Sent only when everything is ready to change hands: every file uploaded and processed. */
  protected readonly readyToSend = computed(() => {
    const mine = this.myUploads();
    return (
      mine.length > 0 && this.uploads().length === 0 && mine.every((u) => u.status === 'READY')
    );
  });
  protected readonly sendHint = computed(() => {
    if (this.phase() !== 'draft' || this.readyToSend()) return null;
    const mine = this.myUploads();
    if (mine.some((u) => u.status === 'FAILED')) return 'deals.trade.removeFailed';
    return mine.length || this.uploads().length ? 'deals.trade.notReady' : null;
  });
  /**
   * The exchange under way: both sides side by side and small, the exchange itself is the
   * main thing; before it, the videos on offer are.
   */
  protected readonly board = computed(() => {
    if (!['person', 'draft', 'sent', 'waiting', 'myMove', 'compose', 'over'].includes(this.phase()))
      return false;
    return !!this.dealId() || this.uploads().length > 0 || this.giveVideos().length > 0;
  });
  protected readonly canCancel = computed(
    () => ['draft', 'sent', 'waiting', 'myMove'].includes(this.phase()) && !!this.deal(),
  );
  protected readonly theirMessage = computed(() => {
    const cur = this.current();
    const v = this.deal();
    if (!cur || !v || v.deal.status !== 'OPEN' || cur.proposedBy.id !== v.deal.holder.id)
      return null;
    return cur.message;
  });
  protected readonly declineComment = computed(() => {
    const d = this.deal()?.deal;
    return d?.status === 'DECLINED' ? d.declineComment : null;
  });
  protected readonly left = computed(() => {
    const v = this.deal();
    const sec = v?.deal.status === 'ACCEPTED' ? v.accessInSec : v?.expiresInSec;
    if (sec === null || sec === undefined) return null;
    return timeLeft(this.loadedAt + sec * 1000 - this.now());
  });
  protected readonly stateTitle = computed(() => {
    const p = this.phase();
    const v = this.deal();
    const key =
      p === 'over' && v
        ? `deals.trade.state.${v.deal.status.toLowerCase()}`
        : `deals.trade.state.${p}`;
    return this.t.translate(key, { name: this.owner()?.displayName ?? '' });
  });
  protected readonly stateText = computed(() => {
    const p = this.phase();
    const key = `deals.trade.hint.${p}`;
    const text = this.t.translate(key, {
      name: this.owner()?.displayName ?? '',
      count: this.getVideos().length,
    });
    return text === key ? null : text;
  });

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    const poll = setInterval(() => {
      const s = this.deal()?.deal.status;
      if ((s === 'DRAFT' || s === 'OPEN') && !this.busy()) void this.loadDeal(true);
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(poll);
    });
    // A guest's language picked here reaches their letters at once: the deal is read again in it
    // and its own texts come back in it too.
    const language = inject(LanguageService);
    effect(() => {
      language.current();
      untracked(() => {
        if (this.deal() && !this.busy()) void this.loadDeal(true);
      });
    });
  }

  ngOnInit(): void {
    void this.open();
  }

  private async open(): Promise<void> {
    const id = this.id();
    if (id) {
      const key = this.k();
      if (key) {
        const claimed = await this.api
          .invoke(dealsClaim, { body: { key } })
          .then(() => true)
          .catch(() => false);
        await this.auth.ready();
        if (claimed && this.auth.isAuthenticated()) {
          // Opened signed in: the deal moves into the account, as on signing in.
          await this.api.invoke(dealsAdopt).catch(() => undefined);
          void this.router.navigate(['/exchange', id], { replaceUrl: true });
          return;
        }
        this.guestKey = key;
        void this.router.navigate([], {
          queryParams: { k: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
      this.dealId.set(id);
      await this.loadDeal();
      return;
    }
    try {
      const code = this.code() ?? '';
      const holder = this.h();
      const inv = holder
        ? await this.api.invoke(dealsSingle, { holder, code })
        : await this.api.invoke(dealsInvite, { code });
      // A deal already going on from here — this browser's guest's, or the signed-in person's own
      // (started as a guest and taken into the account, or asked for before): straight to it.
      if (inv.guestDeal) {
        void this.router.navigate(['/deal', inv.guestDeal], { replaceUrl: true });
        return;
      }
      if (inv.request) {
        void this.router.navigate(['/exchange', inv.request], { replaceUrl: true });
        return;
      }
      this.invite.set(inv);
      if (!inv.own && this.auth.isAuthenticated()) void this.loadMine(inv.owner.username);
    } catch {
      this.gone.set(true);
    }
  }

  private async loadMine(username: string): Promise<void> {
    this.mine.isLoading.set(true);
    try {
      this.mine.value.set(await this.api.invoke(exchangeOfferable, { username }));
    } catch {
      this.mine.value.set({ mine: [] });
    } finally {
      this.mine.isLoading.set(false);
    }
  }

  private async loadDeal(quiet = false): Promise<void> {
    const id = this.dealId();
    if (!id) return;
    try {
      this.setDeal(await this.api.invoke(dealsView, { id }));
    } catch (e) {
      if (toApiError(e).statusCode !== 404) {
        if (!quiet) this.error.set(errorText(e));
        return;
      }
      // Signed in meanwhile: the deal is the account's now, an ordinary request.
      await this.auth.ready();
      if (this.auth.isAuthenticated()) void this.router.navigate(['/exchange', id]);
      else this.gone.set(true);
    }
  }

  private setDeal(v: GuestDealDto): void {
    this.loadedAt = Date.now();
    this.deal.set(v);
  }

  // ---------------------------------------------------------------- a guest's uploads

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    void this.add(files);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.add(
      [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('video/')),
    );
  }

  /** The deal starts with the first file: no separate step. */
  private async add(files: File[]): Promise<void> {
    const room = this.maxUploads() - this.myUploads().length - this.uploads().length;
    const take = files.slice(0, Math.max(0, room));
    if (!take.length) return;
    if (!(await this.ensureDeal(take))) return;
    await this.uploadAll(take);
  }

  private async ensureDeal(files: File[]): Promise<boolean> {
    if (this.dealId()) return true;
    const inv = this.invite();
    if (!inv) return false;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invoke(dealsStart, {
        body: inv.code
          ? { link: inv.code, captchaToken: this.captchaToken ?? undefined }
          : {
              videoId: inv.videos[0]!.id,
              holder: inv.owner.username,
              captchaToken: this.captchaToken ?? undefined,
            },
      });
      this.captchaNeeded.set(false);
      this.guestKey = res.key;
      this.dealId.set(res.id);
      // The page stays; its address becomes the deal's, to come back to.
      this.location.replaceState(`/deal/${res.id}`, '', { dealKey: res.key });
      await this.loadDeal();
      return true;
    } catch (e) {
      const code = toApiError(e).code;
      if (code === 'captchaRequired' || code === 'captchaFailed') {
        this.captchaToken = null;
        this.captcha()?.reset();
        this.captchaNeeded.set(true);
        this.waitingFiles = files;
      } else this.error.set(errorText(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected onCaptcha(token: string | null): void {
    this.captchaToken = token;
    if (token && this.waitingFiles.length) {
      const files = this.waitingFiles;
      this.waitingFiles = [];
      void this.add(files);
    }
  }

  private async uploadAll(files: File[]): Promise<void> {
    const id = this.dealId();
    if (!id) return;
    const rows = files.map((file) => ({ file, sent: 0, error: null }) as Upload);
    this.uploads.update((all) => [...all, ...rows]);
    for (const row of rows) {
      try {
        const title = row.file.name.replace(/\.[^.]+$/, '');
        this.setDeal(
          await this.uploader.upload(id, row.file, title, false, (sent) => {
            row.sent = sent;
            this.uploads.update((all) => [...all]);
          }),
        );
        this.uploads.update((all) => all.filter((r) => r !== row));
      } catch (e) {
        row.error = toApiError(e).message || this.t.translate('errors.network');
        this.uploads.update((all) => [...all]);
        setTimeout(() => this.uploads.update((all) => all.filter((r) => r !== row)), 6000);
      }
    }
  }

  protected pct(u: Upload): number {
    return u.file.size ? Math.min(100, Math.floor((u.sent / u.file.size) * 100)) : 0;
  }

  protected remove(videoId: string): Promise<void> {
    return this.act(() => this.api.invoke(dealsRemoveUpload, { id: this.dealId()!, videoId }));
  }

  // ---------------------------------------------------------------- moves

  protected async sendAsGuest(): Promise<void> {
    const id = this.dealId();
    if (!id) return;
    const email = this.email.trim();
    await this.act(async () => {
      if (email) await this.api.invoke(dealsEmail, { id, body: { email } });
      return this.api.invoke(dealsSend, {
        id,
        body: { message: this.message.trim() || undefined },
      });
    });
  }

  /** A person: an ordinary request for these videos with theirs in return. */
  protected async sendAsPerson(): Promise<void> {
    const inv = this.invite();
    if (!inv || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invoke(exchangeCreate, {
        body: {
          holderUsername: inv.owner.username,
          videoIds: inv.videos.map((v) => v.id),
          offerVideoIds: [...this.give()],
          message: this.message.trim() || undefined,
          exchangeLink: inv.code ?? undefined,
        },
      });
      await this.router.navigate(['/exchange', res.request.id]);
    } catch (e) {
      this.error.set(
        toApiError(e).code === 'nothingToRequest'
          ? this.t.translate('deals.trade.nothingToRequest')
          : errorText(e),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected accept(): Promise<void> {
    const offerId = this.deal()?.deal.currentOfferId;
    if (!offerId) return Promise.resolve();
    return this.act(() => this.api.invoke(dealsAccept, { id: this.dealId()!, body: { offerId } }));
  }

  protected async decline(): Promise<void> {
    const comment = await this.prompt.prompt({
      title: this.t.translate('deals.trade.declineTitle'),
      label: this.t.translate('deals.trade.declineComment'),
      confirmLabel: this.t.translate('deals.trade.decline'),
      danger: true,
      multiline: true,
      maxLength: REQUEST_MESSAGE_MAX,
    });
    if (comment === null) return;
    await this.act(() =>
      this.api.invoke(dealsDecline, {
        id: this.dealId()!,
        body: { comment: comment || undefined },
      }),
    );
  }

  protected compose(): void {
    const items = this.current()?.items ?? [];
    this.want.set(new Set(items.filter((i) => i.givingSide === 'HOLDER').map((i) => i.video.id)));
    this.give.set(
      new Set(items.filter((i) => i.givingSide === 'REQUESTER').map((i) => i.video.id)),
    );
    this.message = '';
    this.composing.set(true);
  }

  protected flip(set: typeof this.want, id: string): void {
    set.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async counter(): Promise<void> {
    await this.act(() =>
      this.api.invoke(dealsCounter, {
        id: this.dealId()!,
        body: {
          holderGives: [...this.want()],
          requesterGives: [...this.give()],
          message: this.message.trim() || undefined,
        },
      }),
    );
    if (!this.error()) {
      this.composing.set(false);
      this.message = '';
    }
  }

  protected async cancel(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('deals.trade.cancelTitle'),
      message: this.t.translate('deals.trade.cancelText'),
      confirmLabel: this.t.translate('deals.trade.cancel'),
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const v = await this.api.invoke(dealsCancel, { id: this.dealId()! });
      if (v) this.setDeal(v);
      else {
        this.toast.success(this.t.translate('deals.trade.cancelled'));
        void this.router.navigate(['/']);
      }
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveEmail(): Promise<void> {
    const email = this.email.trim();
    await this.act(() => this.api.invoke(dealsEmail, { id: this.dealId()!, body: { email } }));
    if (!this.error()) {
      this.changingEmail.set(false);
      this.toast.success(this.t.translate('deals.trade.emailSaved'));
    }
  }

  protected copyDealLink(): void {
    void this.clipboard.copy(
      `${location.origin}/deal/${this.dealId()}?k=${this.guestKey}`,
      'deals.trade.dealCopied',
    );
  }

  protected copyOwnLink(): void {
    const code = this.invite()?.code;
    void this.clipboard.copy(code ? exchangeLinkUrl(code) : location.href, 'deals.linkCopied');
  }

  /** "3 videos · 12:40 · 1.2 GB": one side of the exchange at a glance. */
  protected total(videos: readonly VideoCardDto[]): string {
    const sec = videos.reduce((sum, v) => sum + (v.durationSec ?? 0), 0);
    const size = videos.reduce((sum, v) => sum + (v.sizeBytes ?? 0), 0);
    return [
      this.t.translate('video.videoCount', { count: videos.length }),
      sec ? formatDuration(sec) : null,
      size ? formatBytes(size) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /**
   * Where signing in comes back to: the address as it is now — after the first file it is the
   * deal's (`replaceState`, which the router does not see), so the deal is found again.
   */
  protected readonly here = () => this.location.path();

  protected downloadUrl(v: VideoCardDto): string {
    return `/api/guest/deals/${this.dealId()}/videos/${v.id}/download`;
  }

  protected framesOf(v: VideoCardDto): TimelineFrame[] {
    let frames = this.frames.get(v.id);
    if (!frames) {
      const duration = v.durationSec ?? 0;
      frames = v.frameUrls.map((url, i, all) => ({
        url,
        timestampSec: ((i + 0.5) * duration) / all.length,
      }));
      this.frames.set(v.id, frames);
    }
    return frames;
  }

  protected sourceOf(v: VideoCardDto): () => Promise<PlaybackDto> {
    let source = this.sources.get(v.id);
    if (!source) {
      source = () => this.api.invoke(dealsPlayback, { id: this.dealId()!, videoId: v.id });
      this.sources.set(v.id, source);
    }
    return source;
  }

  private async act(call: () => Promise<GuestDealDto>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.setDeal(await call());
    } catch (e) {
      this.error.set(errorText(e));
      void this.loadDeal(true);
    } finally {
      this.busy.set(false);
    }
  }
}

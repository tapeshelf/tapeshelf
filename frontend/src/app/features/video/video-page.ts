import { Location } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideTriangleAlert,
  lucideBookmark,
  lucideCheck,
  lucideDownload,
  lucideEyeOff,
  lucideFlag,
  lucideLink,
  lucideLink2,
  lucideLock,
  lucidePencil,
  lucideScissors,
  lucideTrash2,
} from '@ng-icons/lucide';
import { Dialog } from '@angular/cdk/dialog';

import {
  Api,
  collectionVideo,
  myCollectionRemoveVideos,
  videosAddToCollection,
  videosByCode,
  videosUpdateHolding,
  type VideoCardDto,
} from '../../api';
import { FormsModule } from '@angular/forms';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { CategoriesStore } from '../../core/categories/categories.store';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { LanguageService } from '../../core/i18n/language.service';
import { VisitorPreview } from '../../core/preview/visitor-preview.service';
import { AdminLinkComponent } from '../../shared/ui/admin-link/admin-link';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { NavigationHistory } from '../../core/navigation/navigation-history';
import { PanelState, panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { VIDEO_MORPH, VideoMorph } from '../../core/navigation/video-morph';
import { VideosStore } from '../../core/videos/videos.store';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { DEFAULT_ASPECT, aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { StrokeComponent, hashString } from '../../shared/ui/stroke/stroke';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { NotFoundPage } from '../not-found/not-found';
import {
  type HoldingText,
  HoldingTextDialog,
  type HoldingTextDialogData,
} from '../videos/holding-text-dialog';
import { TemporaryLinks } from '../links/temporary-links';
import { VideoEditDialog } from '../videos/video-edit-dialog';
import { RequestButtonComponent } from '../exchange/request-button';
import { ReportService } from '../reports/report-dialog';
import { previewItems } from '../deals/deal-gallery';
import { ExchangePrefsComponent } from '../deals/deal-parts';
import { Lightbox } from '../../shared/ui/lightbox/lightbox';
import { VideoPlayerComponent } from './video-player';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import {
  holderOf,
  isAnonymous,
  profileLink,
  videoLink,
  videoState,
} from '../../core/navigation/user-links';
import { PageTitle } from '../../core/i18n/title.strategy';

/**
 * /@username/v/:videoId — a video in the context of the page holder. Two
 * columns: what you came for — the player, or the video preview (contact sheet)
 * when you cannot play it — then what it is and whose; next to it what you can do (the request,
 * prominent, for a private video), the specs, report/delete. The frame is drawn on the first
 * render with the tile's picture so the tile can grow into it; a big back button and Esc return
 * to where the viewer came from.
 */
@Component({
  selector: 'app-video-page',
  imports: [
    ExchangePrefsComponent,
    SelectComponent,
    OptionComponent,
    TranslocoPipe,
    FormsModule,
    RouterLink,
    AppDatePipe,
    NgIcon,
    BytesPipe,
    DurationPipe,
    ButtonDirective,
    SpinnerComponent,
    NotFoundPage,
    VideoPlayerComponent,
    RequestButtonComponent,
    StrokeComponent,
    AdminLinkComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideLock,
      lucideDownload,
      lucideBookmark,
      lucideCheck,
      lucidePencil,
      lucideScissors,
      lucideTrash2,
      lucideEyeOff,
      lucideLink,
      lucideLink2,
      lucideFlag,
      lucideTriangleAlert,
    }),
  ],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @if (notFound()) {
      <app-not-found />
    } @else {
      <article>
        <div class="mb-5 flex items-center gap-3">
          <button
            type="button"
            class="group inline-flex h-10 max-w-full items-center gap-2.5 rounded-full py-1 pr-4 pl-1 text-sm font-medium transition-colors hover:bg-surface-2"
            data-testid="video-back"
            (click)="back()"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-inverse text-on-inverse transition-transform duration-150 group-hover:-translate-x-0.5"
            >
              <ng-icon name="lucideArrowLeft" size="16" />
            </span>
            <span class="truncate">{{ backLabel() }}</span>
          </button>
          <kbd
            class="label-mono hidden rounded-sm border border-border px-1.5 py-0.5 text-faint sm:inline"
            >Esc</kbd
          >
        </div>

        <!-- A wide video spreads over the page with the actions beside it; a tall one stands at
             full height and its story fills the space next to it. -->
        <div
          class="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-8"
          [class]="
            tall()
              ? 'lg:grid-cols-[minmax(0,var(--frame-width))_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr]'
              : 'lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_auto_1fr]'
          "
          [style.--frame-aspect]="aspect()"
          [style.--frame-width]="frameWidth()"
        >
          <!-- 1. What you came for: the player, or the preview when you cannot play it -->
          <section class="min-w-0 lg:col-start-1 lg:row-start-1" [class.lg:row-span-3]="tall()">
            @if (page.value(); as p) {
              @if (gated()) {
                <!-- Marked sensitive: the picture stays blurred until the viewer agrees -->
                <!-- on a phone the box grows around the card; from sm it keeps the player's 16:9 -->
                <div
                  class="relative mx-auto overflow-hidden rounded-lg bg-black sm:[aspect-ratio:var(--frame-aspect)]"
                  [style.width]="frameWidth()"
                  [style.view-transition-name]="growing() ? morphName : null"
                  data-testid="sensitive-gate"
                >
                  @if (p.video.thumbnailUrl; as src) {
                    <img
                      [src]="src"
                      alt=""
                      class="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
                    />
                  }
                  <div class="relative flex items-center justify-center p-4 sm:absolute sm:inset-0">
                    <div
                      class="w-[min(26rem,100%)] rounded-xl bg-surface p-5 text-text shadow-[0_24px_48px_-16px_rgb(0_0_0/0.45)]"
                    >
                      <div class="flex items-center gap-3">
                        <span
                          class="flex h-10 w-10 shrink-0 -rotate-3 items-center justify-center rounded-md bg-accent text-accent-fg"
                          aria-hidden="true"
                          ><ng-icon name="lucideTriangleAlert" size="20"
                        /></span>
                        <h2 class="font-display text-lg leading-tight font-bold tracking-tight">
                          {{ 'sensitive.title' | transloco }}
                        </h2>
                      </div>
                      <p class="mt-3 text-sm leading-relaxed text-muted">
                        {{
                          (auth.isAuthenticated() ? 'sensitive.text' : 'sensitive.textGuest')
                            | transloco
                        }}
                      </p>
                      <div class="mt-5 flex flex-wrap gap-2">
                        <button type="button" appButton (click)="sensitive.agree()">
                          {{
                            (auth.isAuthenticated()
                              ? 'sensitive.confirm'
                              : 'sensitive.confirmGuest'
                            ) | transloco
                          }}
                        </button>
                        <button type="button" appButton variant="ghost" (click)="back()">
                          {{ 'sensitive.decline' | transloco }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              } @else if (p.viewer.canStream) {
                <div
                  class="mx-auto overflow-hidden rounded-lg bg-black [aspect-ratio:var(--frame-aspect)]"
                  [style.width]="frameWidth()"
                  [style.view-transition-name]="growing() ? morphName : null"
                >
                  <app-video-player
                    class="h-full"
                    [videoId]="p.video.id"
                    [frames]="p.video.frames"
                    [poster]="playerPoster(p.video)"
                  />
                </div>
              } @else {
                <figure data-testid="private-preview">
                  <!-- The sheet is a 4×4 grid of the video's frames: it has the video's shape. -->
                  <div
                    class="relative mx-auto overflow-hidden rounded-lg bg-screen [aspect-ratio:var(--frame-aspect)]"
                    [style.width]="frameWidth()"
                    [style.view-transition-name]="growing() ? morphName : null"
                  >
                    @if (p.video.contactSheetUrl) {
                      <!-- Full screen on a click. -->
                      <button
                        type="button"
                        class="block h-full w-full cursor-zoom-in"
                        [attr.aria-label]="'lightbox.zoom' | transloco"
                        (click)="openSheet(p.video)"
                      >
                        <img
                          [src]="p.video.contactSheetUrl"
                          [alt]="'video.preview' | transloco"
                          class="block h-full w-full object-contain"
                          data-testid="contact-sheet"
                        />
                      </button>
                    } @else {
                      <div class="relative h-full w-full">
                        @if (p.video.thumbnailUrl) {
                          <img
                            [src]="p.video.thumbnailUrl"
                            alt=""
                            class="h-full w-full scale-110 object-cover opacity-70 blur-md"
                          />
                        }
                        <span
                          class="absolute inset-0 flex items-center justify-center text-on-screen"
                        >
                          <ng-icon name="lucideLock" size="32" />
                        </span>
                      </div>
                    }
                  </div>
                  <figcaption
                    class="mx-auto mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    [style.width]="frameWidth()"
                  >
                    <h2 class="font-display text-lg font-bold tracking-tight">
                      {{ 'video.preview' | transloco }}
                    </h2>
                    <span class="label-mono text-muted">{{ 'video.previewHint' | transloco }}</span>
                  </figcaption>
                </figure>
              }
            } @else {
              <div
                class="relative mx-auto overflow-hidden rounded-lg bg-black [aspect-ratio:var(--frame-aspect)]"
                [style.width]="frameWidth()"
                [style.view-transition-name]="growing() ? morphName : null"
              >
                @if (poster(); as src) {
                  <img [src]="src" alt="" class="h-full w-full object-cover" />
                }
                <div class="absolute inset-0 flex items-center justify-center text-white/90">
                  @if (loadError()) {
                    <span class="rounded-md bg-canvas px-3 py-1 text-sm text-text">{{
                      errorMessage()
                    }}</span>
                  } @else {
                    <app-spinner />
                  }
                </div>
              </div>
            }
          </section>

          @if (page.value(); as p) {
            <!-- 2. What it is and whose -->
            <header
              class="min-w-0"
              [class]="
                tall() ? 'lg:col-start-2 lg:row-start-1 lg:pt-2' : 'lg:col-start-1 lg:row-start-2'
              "
            >
              <h1
                class="font-display text-2xl leading-[1.1] font-bold tracking-tight break-words sm:text-3xl"
                [class.lg:text-4xl]="tall()"
              >
                {{ p.video.title }}
              </h1>
              @if (p.original && p.holding.customTitle) {
                <!-- The holder's own name: the author's stays in sight, small. -->
                <p class="mt-1.5 text-sm text-muted" data-testid="original-title">
                  {{
                    (anonymousAuthor(p.author) ? 'video.originalAnonymous' : 'video.original')
                      | transloco
                        : {
                            title: p.original.title,
                            author: anonymousAuthor(p.author)
                              ? authorName(p.author)
                              : p.author.username,
                          }
                  }}
                </p>
              }
              <app-stroke class="mt-3 w-28" [seed]="seed()" [height]="9" [thickness]="4" />
              <div class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
                <!-- An author who hid their page: the name stays, the link does not. -->
                <a
                  [routerLink]="p.author.pageVisible ? profileLink(p.author.username) : null"
                  class="inline-flex items-center gap-2 rounded-full py-0.5 pr-3 pl-0.5 font-semibold text-text transition-colors"
                  [class.hover:bg-surface-2]="p.author.pageVisible"
                  data-testid="video-author"
                >
                  <span
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg"
                    aria-hidden="true"
                    >{{ initialOf(authorName(p.author)) }}</span
                  >
                  {{ authorName(p.author) }}
                  <span class="font-normal text-muted"
                    >({{ 'video.videoCount' | transloco: { count: p.author.videoCount } }})</span
                  >
                </a>
                @if (p.holder.id !== p.author.id) {
                  <span>
                    {{ 'video.inCollectionOf' | transloco }}
                    <a
                      [routerLink]="profileLink(p.holder.username)"
                      class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4"
                      >{{ p.holder.displayName || ('common.anonymous' | transloco) }}</a
                    >
                  </span>
                }
                @if (p.video.visibility === 'PRIVATE') {
                  <span
                    class="label-mono inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-text uppercase"
                  >
                    <ng-icon name="lucideLock" size="12" />{{
                      'videos.visibility.PRIVATE' | transloco
                    }}
                  </span>
                }
                @if (p.holding.hidden) {
                  <span
                    class="label-mono inline-flex items-center gap-1 rounded-full bg-inverse px-2 py-0.5 text-on-inverse uppercase"
                  >
                    <ng-icon name="lucideEyeOff" size="12" />{{ 'video.hiddenBadge' | transloco }}
                  </span>
                }
                <app-admin-link [to]="['/admin/videos', p.video.id]" />
              </div>
            </header>

            <!-- 3. What you can do: next to the picture on wide screens -->
            <aside
              class="flex flex-col gap-5 self-start"
              [class]="
                tall()
                  ? 'max-w-sm lg:col-start-2 lg:row-start-2'
                  : 'lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1'
              "
            >
              @if (!p.viewer.canStream) {
                <section
                  class="rounded-xl bg-inverse p-5 text-on-inverse"
                  data-testid="request-area"
                >
                  <div class="flex items-center gap-3">
                    <span
                      class="flex h-10 w-10 shrink-0 -rotate-6 items-center justify-center rounded-lg bg-accent text-accent-fg"
                    >
                      <ng-icon name="lucideLock" size="20" />
                    </span>
                    <p class="font-display text-lg leading-tight font-bold">
                      {{ 'video.privateTitle' | transloco }}
                    </p>
                  </div>
                  <p class="mt-4 text-sm leading-relaxed text-on-inverse/75">
                    {{
                      (p.viewer.requestBlocker === 'bookmark'
                        ? 'video.privateBookmark'
                        : 'video.privateText'
                      ) | transloco
                    }}
                  </p>
                  <div class="mt-5">
                    @if (p.viewer.guestExchange) {
                      <!-- A guest offers their own videos for it, no account needed. -->
                      <a
                        appButton
                        class="h-12 w-full text-[15px]"
                        data-testid="guest-exchange"
                        [routerLink]="['/x/v', p.video.code]"
                        [queryParams]="{ h: p.holder.username }"
                      >
                        {{ 'deals.video.offer' | transloco }}
                      </a>
                      <p class="mt-2 text-center text-xs text-on-inverse/75">
                        {{ 'deals.video.offerHint' | transloco }}
                      </p>
                    } @else if (p.viewer.requestBlocker === 'bookmark' && p.author.pageVisible) {
                      <!-- The author's page must open: not hidden, their anonymous link
                           not deleted. -->
                      <button
                        type="button"
                        appButton
                        class="h-12 w-full text-[15px]"
                        (click)="openAt(p.author.username)"
                      >
                        {{ 'exchange.askAuthor' | transloco: { name: authorName(p.author) } }}
                      </button>
                    } @else {
                      <app-request-button
                        [viewer]="p.viewer"
                        [holderUsername]="p.holder.username"
                        [videoId]="p.video.id"
                        (sent)="page.reload()"
                      />
                    }
                  </div>
                </section>
                <!-- What the holder looks for, always beside the request. -->
                <app-exchange-prefs
                  [wants]="p.holder.exchangeWants"
                  [avoid]="p.holder.exchangeAvoid"
                />
              } @else {
                <section class="flex flex-col gap-2" data-testid="video-actions">
                  @if (p.viewer.canDownload) {
                    @if (downloadLimited()) {
                      <a
                        appButton
                        class="h-11"
                        [routerLink]="['/download', p.video.code]"
                        data-testid="video-download"
                      >
                        <ng-icon name="lucideDownload" size="16" />{{
                          'video.download' | transloco
                        }}
                      </a>
                      @if (isAuthor() && downloadsLeft()) {
                        <p
                          class="label-mono -mt-0.5 text-center text-muted"
                          data-testid="downloads-left"
                        >
                          {{ 'video.ownDownloadFree' | transloco }}
                        </p>
                      } @else if (downloadsLeft(); as d) {
                        <p
                          class="label-mono -mt-0.5 text-center text-muted"
                          data-testid="downloads-left"
                        >
                          {{ 'video.downloadsLeft' | transloco: d }}
                        </p>
                      }
                    } @else {
                      <a
                        appButton
                        class="h-11"
                        [href]="'/api/videos/' + p.video.id + '/download'"
                        data-testid="video-download"
                      >
                        <ng-icon name="lucideDownload" size="16" />{{
                          'video.download' | transloco
                        }}
                      </a>
                    }
                  }
                  @if (p.viewer.canAddToCollection) {
                    <button
                      type="button"
                      appButton
                      class="h-11"
                      [disabled]="busy()"
                      (click)="addToCollection()"
                    >
                      <ng-icon name="lucideBookmark" size="16" />{{
                        'video.addToCollection' | transloco
                      }}
                    </button>
                  } @else if (p.viewer.inCollection && !p.viewer.isHolder) {
                    <span
                      class="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-shelf px-3 text-sm font-semibold text-ink"
                    >
                      <ng-icon name="lucideCheck" size="16" />{{
                        'video.inYourCollection' | transloco
                      }}
                    </span>
                  }
                  <div class="grid grid-cols-2 gap-2">
                    @if (p.viewer.canManage && isAuthor()) {
                      <button type="button" appButton variant="secondary" (click)="edit()">
                        <ng-icon name="lucidePencil" size="16" />{{ 'video.edit' | transloco }}
                      </button>
                    }
                    <button
                      type="button"
                      appButton
                      variant="secondary"
                      [class.col-span-2]="!(p.viewer.canManage && isAuthor())"
                      (click)="copyLink()"
                    >
                      <ng-icon name="lucideLink" size="16" />{{ 'video.copyLink' | transloco }}
                    </button>
                    @if (p.viewer.canSendLink) {
                      <!-- A temporary link to this video. -->
                      <button
                        type="button"
                        appButton
                        variant="secondary"
                        class="col-span-2"
                        data-testid="video-temporary-link"
                        (click)="sendLink(p.video)"
                      >
                        <ng-icon name="lucideLink2" size="16" />{{ 'links.action' | transloco }}
                      </button>
                    }
                    @if (canEdit()) {
                      <a
                        appButton
                        variant="secondary"
                        class="col-span-2"
                        [routerLink]="['/edit', p.video.id]"
                        data-testid="edit-video"
                      >
                        <ng-icon name="lucideScissors" size="16" />{{
                          'video.editVideo' | transloco
                        }}
                      </a>
                    } @else if (offerEditor()) {
                      <a
                        appButton
                        variant="secondary"
                        class="col-span-2"
                        [routerLink]="panelLink('pro')"
                        [queryParamsHandling]="'merge'"
                        data-testid="edit-video-pro"
                      >
                        <ng-icon name="lucideScissors" size="16" />{{
                          'video.editVideoPro' | transloco
                        }}
                      </a>
                    }
                    @if (p.viewer.canHide && p.holding.source !== 'AUTHOR') {
                      <button
                        type="button"
                        appButton
                        variant="secondary"
                        class="col-span-2"
                        data-testid="own-name"
                        (click)="ownName()"
                      >
                        <ng-icon name="lucidePencil" size="16" />{{ 'video.ownName' | transloco }}
                      </button>
                    }
                    @if (p.viewer.canHide) {
                      <button
                        type="button"
                        appButton
                        variant="secondary"
                        class="col-span-2"
                        [disabled]="busy()"
                        (click)="toggleHidden()"
                      >
                        <ng-icon name="lucideEyeOff" size="16" />{{
                          (p.holding.hidden ? 'video.show' : 'video.hide') | transloco
                        }}
                      </button>
                    }
                  </div>
                </section>
              }

              <dl
                class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-border pt-5 text-sm"
                data-testid="video-specs"
              >
                @if (p.video.durationSec) {
                  <dt class="label-mono pt-0.5 text-muted uppercase">
                    {{ 'video.specs.duration' | transloco }}
                  </dt>
                  <dd class="font-mono text-[13px]">{{ p.video.durationSec | duration }}</dd>
                }
                @if (p.video.width && p.video.height) {
                  <dt class="label-mono pt-0.5 text-muted uppercase">
                    {{ 'video.specs.resolution' | transloco }}
                  </dt>
                  <dd class="font-mono text-[13px]">{{ p.video.width }}×{{ p.video.height }}</dd>
                }
                <dt class="label-mono pt-0.5 text-muted uppercase">
                  {{ 'video.specs.size' | transloco }}
                </dt>
                <dd class="font-mono text-[13px]">{{ p.video.sizeBytes | bytes }}</dd>
                <dt class="label-mono pt-0.5 text-muted uppercase">
                  {{ 'video.specs.added' | transloco }}
                </dt>
                <dd class="font-mono text-[13px]">
                  {{ p.video.createdAt | appDate: 'mediumDate' }}
                </dd>
                <!-- Where the browser extension saved it from: the author's alone. -->
                @if (p.sourceUrl; as source) {
                  <dt class="label-mono pt-0.5 text-muted uppercase">
                    {{ 'video.specs.source' | transloco }}
                  </dt>
                  <dd class="truncate">
                    <a
                      [href]="source"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="underline decoration-accent decoration-2 underline-offset-2 hover:text-accent-text"
                      [title]="source"
                      data-testid="video-source"
                      >{{ sourceHost(source) }}</a
                    >
                  </dd>
                }
                @if (p.viewer.isHolder) {
                  <dt class="label-mono self-center text-muted uppercase">
                    <label for="video-category">{{ 'video.specs.category' | transloco }}</label>
                  </dt>
                  <dd>
                    <app-select
                      [inputId]="'video-category'"
                      size="sm"
                      [ngModel]="p.holding.categoryId ?? ''"
                      (ngModelChange)="setCategory($event || null)"
                      [disabled]="busy()"
                    >
                      <app-option [value]="''">{{
                        'videos.edit.noCategory' | transloco
                      }}</app-option>
                      @for (c of categories.items(); track c.id) {
                        <app-option [value]="c.id">{{ c.name }}</app-option>
                      }
                    </app-select>
                  </dd>
                } @else if (p.holding.category; as category) {
                  <dt class="label-mono pt-0.5 text-muted uppercase">
                    {{ 'video.specs.category' | transloco }}
                  </dt>
                  <dd class="truncate">{{ category.name }}</dd>
                }
              </dl>

              <div class="flex flex-wrap items-center gap-1">
                @if (!isAuthor()) {
                  <button
                    type="button"
                    appButton
                    variant="ghost"
                    size="sm"
                    (click)="report(p.video.id, p.video.title)"
                    data-testid="report-video"
                  >
                    <ng-icon name="lucideFlag" size="14" />{{ 'reports.button' | transloco }}
                  </button>
                }
                <!-- The author deletes the video; a holder deletes only their own copy. An
                     admin removes someone else's video in the admin panel, with the rule and the
                     audit. -->
                @if ((p.viewer.canManage && isAuthor()) || ownCopy()) {
                  @if (confirmDelete()) {
                    <span
                      class="flex w-full flex-col gap-2 rounded-xl border border-danger p-3 text-sm"
                    >
                      {{ (isAuthor() ? 'video.confirmDelete' : 'video.confirmRemove') | transloco }}
                      <span class="flex gap-2">
                        <button
                          type="button"
                          appButton
                          variant="danger"
                          size="sm"
                          [disabled]="busy()"
                          (click)="remove()"
                          data-testid="confirm-delete-video"
                        >
                          {{ 'video.confirmDeleteYes' | transloco }}
                        </button>
                        <button
                          type="button"
                          appButton
                          variant="ghost"
                          size="sm"
                          (click)="confirmDelete.set(false)"
                        >
                          {{ 'common.cancel' | transloco }}
                        </button>
                      </span>
                    </span>
                  } @else {
                    <button
                      type="button"
                      appButton
                      variant="ghost"
                      size="sm"
                      class="text-danger"
                      (click)="confirmDelete.set(true)"
                    >
                      <ng-icon name="lucideTrash2" size="14" />{{ 'video.delete' | transloco }}
                    </button>
                  }
                }
              </div>
            </aside>

            <!-- 4. The rest of the story -->
            @if (p.video.description || (p.holding.customDescription && p.original?.description)) {
              <div
                class="max-w-3xl"
                [class]="tall() ? 'lg:col-start-2 lg:row-start-3' : 'lg:col-start-1 lg:row-start-3'"
              >
                @if (p.video.description) {
                  <p class="text-[15px] leading-relaxed whitespace-pre-line">
                    {{ p.video.description }}
                  </p>
                }
                @if (p.holding.customDescription && p.original?.description) {
                  <!-- The holder wrote their own: the author's is a click away. -->
                  <details class="mt-4 text-sm text-muted" data-testid="original-description">
                    <summary class="cursor-pointer font-semibold hover:text-text">
                      {{ 'video.originalDescription' | transloco }}
                    </summary>
                    <p class="mt-2 leading-relaxed whitespace-pre-line">
                      {{ p.original?.description }}
                    </p>
                  </details>
                }
              </div>
            }
          }
        </div>
      </article>
    }
  `,
})
export class VideoPage {
  /** The host of a source link, without "www.": what the specs list shows of it. */
  protected sourceHost(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  protected readonly profileLink = profileLink;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  private readonly lightbox = inject(Lightbox);
  private readonly language = inject(LanguageService);
  protected readonly auth = inject(AuthStore);
  private readonly videos = inject(VideosStore);
  private readonly reports = inject(ReportService);
  private readonly history = inject(NavigationHistory);
  private readonly location = inject(Location);
  private readonly morph = inject(VideoMorph);
  private readonly panel = inject(PanelState);
  protected readonly categories = inject(CategoriesStore);
  protected readonly sensitive = inject(SensitiveContentService);
  private readonly preview = inject(VisitorPreview);

  /** The short code from the URL, /k3x9ab2; a typed link may come in capitals. */
  readonly code = input.required<string>();
  private readonly ref = computed(() => this.code().toLowerCase());
  /**
   * Downloads go through the wait page when the plan limits them; admins and plans
   * without limits get the file at once.
   */
  protected readonly downloadLimited = computed(() => {
    const me = this.auth.user();
    if (!me || this.auth.isAdmin()) return false;
    const l = me.plan.limits;
    return l.downloadsPerMonth > 0 || l.downloadSpeedBytesPerSec > 0 || l.downloadConcurrency > 0;
  });
  protected readonly downloadsLeft = computed(() => {
    const plan = this.auth.user()?.plan;
    if (!plan || plan.limits.downloadsPerMonth === 0) return null;
    return {
      left: Math.max(0, plan.limits.downloadsPerMonth - plan.usage.downloadsThisMonth),
      limit: plan.limits.downloadsPerMonth,
    };
  });
  /**
   * Whose shelf it was opened from inside the app (navigation state); else the server decides.
   * Taken once per video: a panel opened over the page (messages, the bell) is a navigation without
   * that state, and the page used to switch to another holder's copy and restart the player.
   */
  private readonly holderHint = signal<string | null>(null);
  private readonly target = resource({
    params: () => ({ code: this.ref(), asGuest: this.preview.active() }),
    loader: ({ params }) => this.api.invoke(videosByCode, { code: params.code }),
  });
  /** The video and the page it is shown in (the holder whose copy this is). */
  readonly videoId = computed(() => (this.target.hasValue() ? this.target.value().id : ''));
  readonly username = computed(
    () => this.holderHint() ?? (this.target.hasValue() ? this.target.value().username : ''),
  );

  /** Fetched again when the owner switches the visitor preview: a guest's view then. */
  /** The frame preview full screen. */
  protected openSheet(v: VideoCardDto): void {
    void this.lightbox.open(previewItems([v]));
  }

  /**
   * A guest who uploaded it in an exchange is "Guest"; an author known here by their
   * anonymous link goes by its name, or "Anonymous".
   */
  protected authorName(a: { guest: boolean; displayName: string }): string {
    if (a.guest) return this.t.translate('common.guest');
    return a.displayName || this.t.translate('common.anonymous');
  }

  protected anonymousAuthor(a: { username: string }): boolean {
    return isAnonymous(a.username);
  }

  protected readonly page = resource({
    params: () =>
      this.target.hasValue()
        ? { username: this.username(), videoId: this.videoId(), asGuest: this.preview.active() }
        : undefined,
    loader: ({ params }) =>
      this.api.invoke(collectionVideo, { username: params.username, videoId: params.videoId }),
  });
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly loadError = computed(() => this.target.error() ?? this.page.error());
  protected readonly notFound = computed(() => {
    const e = this.loadError();
    return !!e && toApiError(e).statusCode === 404;
  });
  protected readonly errorMessage = computed(() => {
    this.language.loaded();
    return toApiError(this.loadError()).message || this.t.translate('errors.unknown');
  });
  protected readonly isAuthor = computed(
    () => !this.preview.active() && this.page.value()?.author.id === this.auth.user()?.id,
  );
  /** A copy of someone else's video on my own shelf: deleting it takes only my copy. */
  protected readonly ownCopy = computed(() => {
    const p = this.page.value();
    return !this.preview.active() && !!p && p.viewer.canHide && p.holding.source !== 'AUTHOR';
  });
  protected readonly panelLink = panelLink;
  private readonly site = inject(SiteConfig);
  private readonly temporaryLinks = inject(TemporaryLinks);
  /** The video editor: Pro, one's own; an admin, any. */
  protected readonly canEdit = computed(
    () => !this.preview.active() && !!this.page.value()?.viewer.canEdit,
  );
  /** A Free author in the cloud: the way to it is Pro. */
  protected readonly offerEditor = computed(
    () =>
      this.isAuthor() &&
      this.site.hasTiers() &&
      this.auth.user()?.plan.tier !== 'PREMIUM' &&
      this.page.value()?.video.status === 'READY',
  );
  /** Marked sensitive and not yet agreed to: the gate stands in for the player or preview. */
  protected readonly gated = computed(() => {
    const p = this.page.value();
    // What the viewer holds they may watch: never behind the gate.
    return !!p && !p.viewer.inCollection && !p.viewer.isHolder && this.sensitive.blurs(p.video);
  });
  protected readonly morphName = VIDEO_MORPH;
  /** The shape of the picture: the video's own; while it loads, the clicked tile's. */
  protected readonly aspect = computed(() => {
    const v = this.page.value()?.video;
    if (v?.width && v.height) return aspectOf(v.width, v.height);
    const pending = this.morph.pending();
    return pending?.code === this.ref() ? pending.aspect : DEFAULT_ASPECT;
  });
  protected readonly tall = computed(() => this.aspect() < 1);
  /** As wide as the column allows, but never taller than the screen under the header. */
  protected readonly frameWidth = computed(
    () => `min(100%, calc((100svh - 9.5rem) * ${this.aspect()}))`,
  );
  /** The frame is named only while it grows out of the clicked tile (see VideoMorph.growing). */
  protected readonly growing = computed(
    () => this.morph.growing() && this.morph.pending()?.code === this.ref(),
  );
  /**
   * A phone's player gets the 640 px picture the tiles use: the full-size JPEG (up to 1280 px, about
   * 100 KB) was the page's largest paint there and arrived seconds late (perf audit: LCP 4.1 s).
   */
  protected playerPoster(video: { posterUrl: string | null; thumbnailUrl: string | null }) {
    return narrowScreen()
      ? (video.thumbnailUrl ?? video.posterUrl)
      : (video.posterUrl ?? video.thumbnailUrl);
  }
  /** The tile's picture while the page loads, so the morph lands on the same image. */
  protected readonly poster = computed(() => {
    const pending = this.morph.pending();
    return pending?.code === this.ref() ? pending.poster : null;
  });
  protected readonly seed = computed(() => hashString(this.videoId()));
  /**
   * Back always leads to the shelf of whoever has this video on it: the page it
   * was opened from, or the author's when it was opened by a link — never back into an open stack.
   */
  protected readonly backLabel = computed(() => {
    this.language.loaded();
    // A shelf seen through an anonymous link names nobody.
    return isAnonymous(this.shelfOwner())
      ? this.t.translate('video.backToShelfAnonymous')
      : this.t.translate('video.backToShelf', { username: this.shelfOwner() });
  });
  private readonly shelfOwner = computed(
    () => this.page.value()?.holder.username ?? this.username(),
  );

  constructor() {
    effect(() => {
      this.ref();
      untracked(() =>
        this.holderHint.set(
          holderOf(this.router.lastSuccessfulNavigation()?.extras.state ?? history.state),
        ),
      );
    });
    inject(PageTitle).track(() => (this.page.hasValue() ? this.page.value().video.title : null));
    // A code typed in capitals still works; the address bar shows it the way links write it.
    effect(() => {
      if (this.code() !== this.ref())
        void this.router.navigate(videoLink(this.ref()), {
          replaceUrl: true,
          state: videoState(this.holderHint()),
        });
    });
  }

  /** The same video in someone else's context (the bookmark's author); same URL, new state. */
  protected openAt(holder: string): void {
    this.holderHint.set(holder);
    void this.router.navigate(videoLink(this.ref()), {
      state: videoState(holder),
      onSameUrlNavigation: 'reload',
    });
  }

  /**
   * Back to the holder's shelf. When the viewer came from it, with its folder or category in
   * the address, step back: the shelf opens as it was. From its stack window, go to the shelf
   * with the same folder but without the window; from anywhere else, to the shelf itself.
   */
  protected back(): void {
    const shelf = this.router.serializeUrl(
      this.router.createUrlTree(profileLink(this.shelfOwner())),
    );
    const previous = this.history.previous();
    const came = previous ? this.router.parseUrl(previous) : null;
    if (!came || this.router.serializeUrl(new UrlTree(came.root)) !== shelf) {
      void this.router.navigateByUrl(shelf);
      return;
    }
    const { stack, ...query } = came.queryParams;
    if (stack === undefined) this.location.back();
    else
      void this.router.navigateByUrl(
        this.router.createUrlTree(profileLink(this.shelfOwner()), { queryParams: query }),
      );
  }

  /** Esc leaves the video, unless it closes something else first (a dialog, a menu, a field). */
  protected onEscape(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (
      e.defaultPrevented ||
      this.panel.open() ||
      this.dialog.openDialogs.length ||
      document.fullscreenElement ||
      target?.closest('input, textarea, select, [contenteditable="true"], [cdkMenu]')
    )
      return;
    this.back();
  }

  protected initialOf(name: string): string {
    return name.trim().slice(0, 1).toUpperCase();
  }

  async addToCollection(): Promise<void> {
    await this.run(async () => {
      // The code the page goes by: seen through an anonymous link, the copy keeps the owner masked.
      await this.api.invoke(videosAddToCollection, {
        id: this.videoId(),
        body: { code: this.page.value()?.video.code },
      });
      this.toast.success(this.t.translate('video.added'));
      this.page.reload();
    });
  }

  async setCategory(categoryId: string | null): Promise<void> {
    await this.run(async () => {
      await this.api.invoke(videosUpdateHolding, { id: this.videoId(), body: { categoryId } });
      this.page.reload();
    });
  }

  async toggleHidden(): Promise<void> {
    const hidden = !this.page.value()?.holding.hidden;
    await this.run(async () => {
      await this.api.invoke(videosUpdateHolding, { id: this.videoId(), body: { hidden } });
      this.page.reload();
    });
  }

  /** The holder's own name and description for someone else's video. */
  ownName(): void {
    const p = this.page.value();
    if (!p) return;
    const ref = this.dialog.open<HoldingText>(HoldingTextDialog, {
      data: {
        videoId: this.videoId(),
        title: p.holding.customTitle,
        description: p.holding.customDescription,
        originalTitle: p.original?.title ?? p.video.title,
        originalDescription: p.original ? p.original.description : p.video.description,
      } satisfies HoldingTextDialogData,
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    ref.closed.subscribe((saved) => {
      if (saved) this.page.reload();
    });
  }

  edit(): void {
    const ref = this.dialog.open(VideoEditDialog, {
      data: { id: this.videoId() },
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    ref.closed.subscribe(() => this.page.reload());
  }

  async remove(): Promise<void> {
    await this.run(async () => {
      if (this.isAuthor()) {
        await this.videos.remove(this.videoId());
        this.toast.success(this.t.translate('video.deleted'));
      } else {
        await this.api.invoke(myCollectionRemoveVideos, { body: { videoIds: [this.videoId()] } });
        this.toast.success(this.t.translate('video.removed'));
      }
      const me = this.auth.user();
      await this.router.navigate(me ? profileLink(me.username) : ['/']);
    });
  }

  report(id: string, title: string): Promise<void> {
    return this.reports.open({ targetType: 'VIDEO', targetId: id, name: title });
  }

  protected sendLink(video: { id: string; title: string; thumbnailUrl: string | null }): void {
    void this.temporaryLinks.offer([
      { id: video.id, title: video.title, thumbnailUrl: video.thumbnailUrl },
    ]);
  }

  async copyLink(): Promise<void> {
    await this.clipboard.copy(`${location.origin}/${this.ref()}`, 'video.linkCopied');
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Screens that never show the player wider than the 640 px picture. */
function narrowScreen(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
}

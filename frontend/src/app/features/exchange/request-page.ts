import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideBan,
  lucideCheck,
  lucideGift,
  lucideRepeat,
  lucideX,
} from '@ng-icons/lucide';

import {
  Api,
  type OfferDto,
  type RequestDetailDto,
  type VideoCardDto,
  exchangeAccept,
  exchangeBlock,
  exchangeCancel,
  exchangeCounter,
  exchangeDecline,
  exchangeDetail,
  exchangeShare,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { toApiError } from '../../core/api/api-error';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ExchangePrefsComponent } from '../deals/deal-parts';
import { OfferVideosComponent } from './offer-videos';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { NotFoundPage } from '../not-found/not-found';
import { ExchangeSceneComponent, SCENE_MS, type SceneCover } from './exchange-scene';
import { type OfferDraft, OfferBuilderComponent } from './offer-builder';
import { isAnonymous, nameless, profileLink } from '../../core/navigation/user-links';
import { panelLink } from '../../core/navigation/panels';

interface OfferView {
  offer: OfferDto;
  current: boolean;
  mine: boolean;
  /** Videos the viewer receives / gives in this offer. */
  get: VideoCardDto[];
  give: VideoCardDto[];
}

/** /exchange/:id — the negotiation thread with the current offer and the viewer's actions. */
@Component({
  selector: 'app-request-page',
  imports: [
    ExchangePrefsComponent,
    OfferVideosComponent,
    TranslocoPipe,
    AppDatePipe,
    FormsModule,
    RouterLink,
    NgIcon,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    FieldComponent,
    SpinnerComponent,
    NotFoundPage,
    OfferBuilderComponent,
    ExchangeSceneComponent,
  ],
  providers: [
    provideIcons({ lucideArrowLeft, lucideCheck, lucideX, lucideRepeat, lucideGift, lucideBan }),
  ],
  template: `
    @if (scene(); as s) {
      <app-exchange-scene [give]="s.give" [get]="s.get" />
    }
    @if (notFound()) {
      <app-not-found />
    } @else if (error(); as error) {
      <app-alert kind="error">{{ error }}</app-alert>
    } @else if (request(); as r) {
      <article data-testid="request-thread">
        <a
          [routerLink]="panelLink('exchange')"
          [queryParamsHandling]="'merge'"
          class="label-mono mb-4 inline-flex items-center gap-1.5 text-muted hover:text-text"
        >
          <ng-icon name="lucideArrowLeft" size="14" />{{ 'exchange.back' | transloco }}
        </a>
        <header class="mb-6 flex flex-wrap items-center gap-3">
          <h1
            class="max-w-full min-w-0 font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
          >
            {{
              (r.role === 'holder' ? 'exchange.thread.from' : 'exchange.thread.to')
                | transloco
                  : {
                      name: r.counterpart.guest
                        ? ('common.guest' | transloco)
                        : r.counterpart.displayName || (nameless(r.counterpart) | transloco),
                    }
            }}
          </h1>
          <!-- No page to open once they hid it; a guest has none; someone known by
               their anonymous link has no nickname to show. -->
          @if (!r.counterpart.guest && !isAnonymous(r.counterpart.username)) {
            <a
              [routerLink]="r.counterpart.pageHidden ? null : profileLink(r.counterpart.username)"
              class="text-sm text-muted"
              [class.hover:underline]="!r.counterpart.pageHidden"
              >&#64;{{ r.counterpart.username }}</a
            >
          }
          <span
            class="rounded px-2 py-0.5 text-xs"
            [class]="statusClass()"
            data-testid="request-status"
          >
            {{
              (r.status === 'OPEN'
                ? r.awaitingMe
                  ? 'exchange.status.awaitingMe'
                  : 'exchange.status.awaitingThem'
                : 'exchange.status.' + r.status
              ) | transloco
            }}
          </span>
        </header>
        @if (r.counterpart.guest && r.status === 'OPEN' && r.expiresAt) {
          <!-- A deal with a guest runs out after three quiet days. -->
          <app-alert kind="info" class="mb-4 block" data-testid="request-expires">{{
            'deals.thread.expires' | transloco: { date: r.expiresAt | appDate: 'd MMMM, HH:mm' }
          }}</app-alert>
        }
        @if (r.anonymousLink; as via) {
          <!-- To the holder: the requester knows them only by their anonymous link. -->
          <app-alert kind="info" class="mb-4 block" data-testid="request-anonymous">{{
            (via.note ? 'exchange.thread.viaAnonymousNote' : 'exchange.thread.viaAnonymous')
              | transloco: { note: via.note }
          }}</app-alert>
        }
        <!-- What the other side looks for, always in an exchange. -->
        <app-exchange-prefs
          class="mb-4 block"
          [wants]="r.counterpart.exchangeWants"
          [avoid]="r.counterpart.exchangeAvoid"
        />
        @if (r.resetAt) {
          <app-alert kind="warning" class="mb-4 block">{{
            'exchange.thread.reset' | transloco
          }}</app-alert>
        }
        @if (r.status === 'DECLINED' && r.declineComment) {
          <app-alert kind="info" class="mb-4 block">{{
            'exchange.thread.declineComment' | transloco: { comment: r.declineComment }
          }}</app-alert>
        }

        <ol class="flex flex-col gap-3">
          @for (v of offers(); track v.offer.id) {
            <li
              class="rounded-xl border-2 bg-surface p-4"
              [class]="
                v.current && r.status === 'OPEN'
                  ? 'border-accent shadow-[4px_4px_0_0_var(--vs-accent)]'
                  : 'border-line/25'
              "
              [attr.data-testid]="'offer-' + v.offer.round"
            >
              <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium">
                  {{
                    (v.offer.round === 0 ? 'exchange.thread.request' : 'exchange.thread.offer')
                      | transloco: { n: v.offer.round }
                  }}
                </span>
                <span class="text-muted">
                  {{
                    (v.mine ? 'exchange.thread.byYou' : 'exchange.thread.by')
                      | transloco
                        : {
                            name: v.offer.proposedBy.guest
                              ? ('common.guest' | transloco)
                              : v.offer.proposedBy.displayName ||
                                (nameless(v.offer.proposedBy) | transloco),
                          }
                  }}
                  · {{ v.offer.createdAt | appDate: 'medium' }}
                </span>
                <span class="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                  {{ 'exchange.offerStatus.' + v.offer.status | transloco }}
                </span>
              </div>
              @if (v.offer.message) {
                <p class="mb-3 rounded-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-line">
                  {{ v.offer.message }}
                </p>
              }
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 class="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                    {{ 'exchange.thread.youGet' | transloco }} ({{ v.get.length }})
                  </h3>
                  <app-offer-videos [videos]="v.get" />
                </div>
                <div>
                  <h3 class="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                    {{ 'exchange.thread.youGive' | transloco }} ({{ v.give.length }})
                  </h3>
                  @if (v.give.length === 0) {
                    <p class="text-xs text-faint">
                      {{ 'exchange.thread.nothingForFree' | transloco }}
                    </p>
                  }
                  <app-offer-videos [videos]="v.give" [blur]="false" />
                </div>
              </div>
            </li>
          }
        </ol>

        @if (r.actions.length) {
          <section
            class="mt-4 rounded-xl border-2 border-line bg-surface p-4 shadow-hard-sm"
            data-testid="request-actions"
          >
            @if (mode() === 'counter') {
              <h2 class="mb-3 text-sm font-semibold">{{ 'exchange.builder.title' | transloco }}</h2>
              <app-offer-builder
                [requestId]="r.id"
                [initialTheirs]="currentGet()"
                [initialMine]="currentGive()"
                (offerSubmit)="counter($event)"
                (offerCancel)="mode.set('idle')"
              />
            } @else if (mode() === 'decline') {
              <app-field optional [label]="'exchange.declineComment' | transloco">
                <textarea appInput rows="2" maxlength="1000" [(ngModel)]="comment"></textarea>
              </app-field>
              <div class="mt-3 flex gap-2">
                <button
                  type="button"
                  appButton
                  variant="danger"
                  [disabled]="busy()"
                  (click)="decline()"
                >
                  {{ 'exchange.actions.decline' | transloco }}
                </button>
                <button type="button" appButton variant="ghost" (click)="mode.set('idle')">
                  {{ 'common.cancel' | transloco }}
                </button>
              </div>
            } @else {
              <div class="flex flex-wrap gap-2">
                @if (has('accept')) {
                  <button
                    type="button"
                    appButton
                    [disabled]="busy()"
                    data-testid="accept"
                    (click)="accept()"
                  >
                    <ng-icon name="lucideCheck" size="16" />{{
                      (r.round === 0 && !offerAttached()
                        ? 'exchange.actions.share'
                        : 'exchange.actions.accept'
                      ) | transloco
                    }}
                  </button>
                }
                <!-- Sharing for free stays open on every round; on a plain round 0 "accept"
                     is it. A request with an offer from the start can be either. -->
                @if (has('share') && !(has('accept') && r.round === 0 && !offerAttached())) {
                  <button
                    type="button"
                    appButton
                    [disabled]="busy()"
                    data-testid="share"
                    (click)="share()"
                  >
                    <ng-icon name="lucideGift" size="16" />{{
                      'exchange.actions.share' | transloco
                    }}
                  </button>
                }
                @if (has('counter')) {
                  <!-- On round 0 "share" and "offer an exchange" weigh the same. -->
                  <button
                    type="button"
                    appButton
                    [variant]="r.round === 0 ? 'primary' : 'secondary'"
                    data-testid="counter"
                    (click)="mode.set('counter')"
                  >
                    <ng-icon name="lucideRepeat" size="16" />{{
                      'exchange.actions.counter' | transloco
                    }}
                  </button>
                }
                @if (has('decline')) {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    data-testid="decline"
                    (click)="mode.set('decline')"
                  >
                    <ng-icon name="lucideX" size="16" />{{ 'exchange.actions.decline' | transloco }}
                  </button>
                }
                @if (has('cancel')) {
                  <button
                    type="button"
                    appButton
                    variant="ghost"
                    [disabled]="busy()"
                    data-testid="cancel"
                    (click)="cancel()"
                  >
                    {{ 'exchange.actions.cancel' | transloco }}
                  </button>
                }
                @if (has('block')) {
                  <button
                    type="button"
                    appButton
                    variant="ghost"
                    class="ml-auto text-danger"
                    [disabled]="busy()"
                    data-testid="block"
                    (click)="block()"
                  >
                    <ng-icon name="lucideBan" size="16" />{{ 'exchange.actions.block' | transloco }}
                  </button>
                }
              </div>
            }
          </section>
        }
      </article>
    } @else {
      <div class="flex justify-center py-16 text-muted"><app-spinner /></div>
    }
  `,
})
export class RequestPage {
  protected readonly isAnonymous = isAnonymous;
  protected readonly nameless = nameless;
  protected readonly panelLink = panelLink;
  protected readonly profileLink = profileLink;
  private readonly api = inject(Api);
  private readonly notifications = inject(NotificationsStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly confirm = inject(ConfirmService);
  private readonly exchange = inject(ExchangeStore);

  readonly id = input.required<string>();

  protected readonly request = signal<RequestDetailDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly mode = signal<'idle' | 'counter' | 'decline'>('idle');
  protected comment = '';

  protected readonly offers = computed<OfferView[]>(() => {
    const r = this.request();
    if (!r) return [];
    return r.offers.map((offer) => {
      const iAmHolder = r.role === 'holder';
      const holderGives = offer.items.filter((i) => i.givingSide === 'HOLDER').map((i) => i.video);
      const requesterGives = offer.items
        .filter((i) => i.givingSide === 'REQUESTER')
        .map((i) => i.video);
      return {
        offer,
        current: offer.id === r.currentOfferId,
        mine: offer.proposedBy.id === (iAmHolder ? r.holder.id : r.requester.id),
        get: iAmHolder ? requesterGives : holderGives,
        give: iAmHolder ? holderGives : requesterGives,
      };
    });
  });
  protected readonly currentGet = computed(
    () =>
      this.offers()
        .find((v) => v.current)
        ?.get.map((v) => v.id) ?? [],
  );
  protected readonly currentGive = computed(
    () =>
      this.offers()
        .find((v) => v.current)
        ?.give.map((v) => v.id) ?? [],
  );
  protected readonly statusClass = computed(() => {
    const r = this.request();
    if (!r) return '';
    if (r.status === 'OPEN')
      return r.awaitingMe ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted';
    if (r.status === 'ACCEPTED') return 'bg-success/15 text-success';
    if (r.status === 'DECLINED') return 'bg-danger/15 text-danger';
    return 'bg-surface-2 text-muted';
  });

  /** The two covers swapping places, for a moment after an exchange is done. */
  protected readonly scene = signal<{ give: SceneCover; get: SceneCover } | null>(null);
  /** Loads numbered: a late answer for a request left meanwhile is dropped. */
  private loads = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      this.exchange.version();
      untracked(() => {
        // Another request (a notification's link): the last one does not stand in while it loads.
        if (this.request()?.id !== id) this.request.set(null);
        void this.load();
      });
    });
    // Watched here, the scene plays for an accept on this page and for the other side's, live.
    let last: { id: string; status: string } | null = null;
    effect(() => {
      const r = this.request();
      if (!r) return;
      const before = last?.id === r.id ? last.status : null;
      last = { id: r.id, status: r.status };
      if (before === 'OPEN' && r.status === 'ACCEPTED') untracked(() => this.playScene());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.sceneTimer));
  }

  private sceneTimer: ReturnType<typeof setTimeout> | undefined;

  /** Only for an exchange (both sides gave), never under reduced motion. */
  private playScene(): void {
    const current = this.offers().find((v) => v.current);
    const give = current?.give[0];
    const get = current?.get[0];
    if (!give || !get || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.scene.set({ give, get });
    clearTimeout(this.sceneTimer);
    this.sceneTimer = setTimeout(() => this.scene.set(null), SCENE_MS);
  }

  protected has(action: string): boolean {
    return this.request()?.actions.includes(action as RequestDetailDto['actions'][number]) ?? false;
  }

  private async load(): Promise<void> {
    const seq = ++this.loads;
    const id = this.id();
    try {
      const request = await this.api.invoke(exchangeDetail, { id });
      // Another request was opened meanwhile: this answer is not its.
      if (seq !== this.loads) return;
      this.request.set(request);
      this.notFound.set(false);
      void this.notifications.markRequestRead(id);
    } catch (e) {
      if (seq !== this.loads) return;
      const err = toApiError(e);
      if (err.statusCode === 404) this.notFound.set(true);
      else this.error.set(err.message || this.t.translate('errors.unknown'));
    }
  }

  /** The requester offered something in return from the start. */
  protected readonly offerAttached = computed(() => {
    const r = this.request();
    return !!r && r.round === 0 && (r.role === 'holder' ? r.deal.get : r.deal.give) > 0;
  });

  protected accept(): void {
    const r = this.request();
    if (!r?.currentOfferId) return;
    // Round 0 is a gift, unless the requester offered something from the start.
    const exchange = r.round > 0 || this.offerAttached();
    void this.run(
      () => this.api.invoke(exchangeAccept, { id: r.id, body: { offerId: r.currentOfferId! } }),
      exchange ? 'exchange.toast.accepted' : 'exchange.toast.shared',
      // An exchange brings videos: "See" leads to them, in "From others" of the own shelf.
      exchange,
    );
  }

  protected share(): void {
    const r = this.request();
    if (!r) return;
    void this.run(() => this.api.invoke(exchangeShare, { id: r.id }), 'exchange.toast.shared');
  }

  protected decline(): void {
    const r = this.request();
    if (!r) return;
    void this.run(
      () =>
        this.api.invoke(exchangeDecline, {
          id: r.id,
          body: { comment: this.comment.trim() || undefined },
        }),
      'exchange.toast.declined',
    );
  }

  protected counter(draft: OfferDraft): void {
    const r = this.request();
    if (!r) return;
    const iAmHolder = r.role === 'holder';
    void this.run(
      () =>
        this.api.invoke(exchangeCounter, {
          id: r.id,
          body: {
            holderGives: iAmHolder ? draft.mine : draft.theirs,
            requesterGives: iAmHolder ? draft.theirs : draft.mine,
            message: draft.message.trim() || undefined,
          },
        }),
      'exchange.toast.countered',
    );
  }

  protected async cancel(): Promise<void> {
    const r = this.request();
    if (!r) return;
    if (
      !(await this.confirm.confirm({
        title: this.t.translate('exchange.confirmCancel'),
        confirmLabel: this.t.translate('exchange.actions.cancel'),
        danger: true,
      }))
    )
      return;
    void this.run(() => this.api.invoke(exchangeCancel, { id: r.id }), 'exchange.toast.cancelled');
  }

  protected async block(): Promise<void> {
    const r = this.request();
    if (!r) return;
    if (
      !(await this.confirm.confirm({
        title: this.t.translate('exchange.confirmBlock', { name: r.counterpart.displayName }),
        message: this.t.translate('exchange.confirmBlockText'),
        confirmLabel: this.t.translate('exchange.actions.block'),
        danger: true,
      }))
    )
      return;
    void this.run(() => this.api.invoke(exchangeBlock, { id: r.id }), 'exchange.toast.blocked');
  }

  private async run(
    fn: () => Promise<RequestDetailDto>,
    toastKey: string,
    received = false,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.request.set(await fn());
      this.mode.set('idle');
      this.comment = '';
      if (received)
        this.toast.withAction(
          this.t.translate(toastKey),
          {
            label: this.t.translate('notifications.see'),
            run: () => void this.router.navigate(['/'], { queryParams: { folder: 'others' } }),
          },
          'success',
        );
      else this.toast.success(this.t.translate(toastKey));
      this.exchange.changed();
    } catch (e) {
      const err = toApiError(e);
      this.toast.error(err.message || this.t.translate('errors.unknown'));
      if (err.statusCode === 409) await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigate(panelLink('exchange'), { queryParamsHandling: 'merge' });
  }
}

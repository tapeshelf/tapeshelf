import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideSend } from '@ng-icons/lucide';

import { Api, type ViewerCapabilitiesDto, exchangeCreate } from '../../api';
import { AuthStore } from '../../core/auth/auth.store';
import { toApiError } from '../../core/api/api-error';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { MAX_VIDEOS_PER_REQUEST } from './exchange-limits';
import { type OfferPickData, OfferPickDialog } from './offer-pick-dialog';
import { RequestGate } from './request-dialogs';
import { panelLink } from '../../core/navigation/panels';

/**
 * "Request this video" with its states: send, requested, cooldown, limit,
 * guest. Drawn for the ink request card of the video page: a big orange button.
 */
@Component({
  selector: 'app-request-button',
  imports: [TranslocoPipe, FormsModule, RouterLink, NgIcon, ButtonDirective, InputDirective],
  providers: [provideIcons({ lucideSend, lucideCheck })],
  template: `
    @switch (state()) {
      @case ('requested') {
        <a
          [routerLink]="panelLink('exchange', viewer().request?.openRequestId ?? '')"
          [queryParamsHandling]="'merge'"
          class="flex h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-on-inverse/40 px-4 text-[15px] font-semibold text-on-inverse transition-colors hover:border-on-inverse hover:bg-on-inverse/10"
          data-testid="requested-badge"
        >
          <ng-icon name="lucideCheck" size="18" class="text-accent" />{{
            'exchange.requested' | transloco
          }}
        </a>
      }
      @case ('cooldown') {
        <p class="rounded-md border-2 border-on-inverse/25 px-4 py-3 text-sm text-on-inverse/80">
          {{ 'exchange.cooldown' | transloco: { days: cooldownDays() } }}
        </p>
      }
      @case ('limit') {
        <p class="rounded-md border-2 border-on-inverse/25 px-4 py-3 text-sm text-on-inverse/80">
          @if (limitHours(); as hours) {
            {{ 'exchange.limitAgainIn' | transloco: { count: hours } }}
          } @else {
            {{ 'exchange.limitReached' | transloco }}
          }
        </p>
      }
      @case ('blocked') {
        <!-- Neither the button nor a word about a block: a plain "not now". -->
        <p
          class="rounded-md border-2 border-on-inverse/25 px-4 py-3 text-sm text-on-inverse/80"
          data-testid="request-unavailable"
        >
          {{ 'exchange.unavailable' | transloco }}
        </p>
      }
      @case ('guest') {
        <button type="button" appButton class="h-12 w-full text-[15px]" (click)="gate.guest()">
          <ng-icon name="lucideSend" size="18" />{{ 'exchange.request' | transloco }}
        </button>
      }
      @case ('send') {
        <form class="flex flex-col gap-3" (ngSubmit)="send()">
          <textarea
            appInput
            rows="3"
            class="ts-optional"
            maxlength="1000"
            [(ngModel)]="message"
            name="message"
            [placeholder]="'exchange.messagePlaceholder' | transloco"
            [attr.aria-label]="'exchange.messagePlaceholder' | transloco"
          ></textarea>
          <!-- "I offer in return…" from the start: optional, the holder sees both sides. -->
          <button
            type="button"
            class="self-start text-sm font-semibold text-on-inverse/85 underline decoration-accent decoration-2 underline-offset-4 hover:text-on-inverse"
            data-testid="offer-in-return"
            (click)="pickOffer()"
          >
            {{
              (offered().length ? 'exchange.offerPick.offering' : 'exchange.offerPick.add')
                | transloco: { count: offered().length }
            }}
          </button>
          <button
            type="submit"
            appButton
            class="h-12 w-full text-[15px]"
            [disabled]="busy()"
            data-testid="request-button"
          >
            <ng-icon name="lucideSend" size="18" />{{ 'exchange.request' | transloco }}
          </button>
        </form>
      }
    }
  `,
})
export class RequestButtonComponent {
  protected readonly panelLink = panelLink;
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);
  private readonly t = inject(TranslocoService);
  private readonly exchange = inject(ExchangeStore);
  protected readonly gate = inject(RequestGate);

  readonly viewer = input.required<ViewerCapabilitiesDto>();
  readonly holderUsername = input.required<string>();
  readonly videoId = input.required<string>();
  readonly sent = output<string>();

  protected message = '';
  /** My videos offered in return. */
  protected readonly offered = signal<string[]>([]);
  private readonly dialog = inject(Dialog);
  protected readonly busy = signal(false);
  protected readonly state = computed<
    'hidden' | 'guest' | 'requested' | 'blocked' | 'cooldown' | 'limit' | 'send'
  >(() => {
    const v = this.viewer();
    if (v.requestBlocker === 'guest') return 'guest';
    if (v.requestBlocker !== null || !v.request) return 'hidden';
    if (v.request.openRequestId) return 'requested';
    if (v.request.blocked) return 'blocked';
    if (v.request.cooldownUntil) return 'cooldown';
    if (v.request.limitReached) return 'limit';
    return 'send';
  });
  /** Hours until another video can be requested (rounded up; the window is 24 hours). */
  protected readonly limitHours = computed(() => {
    const at = this.viewer().request?.limitFreesAt;
    if (!at) return 0;
    return Math.max(1, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000));
  });
  protected readonly cooldownDays = computed(() => {
    const until = this.viewer().request?.cooldownUntil;
    if (!until) return 0;
    return Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
  });

  protected pickOffer(): void {
    const ref = this.dialog.open<string[]>(OfferPickDialog, {
      data: {
        holderUsername: this.holderUsername(),
        picked: this.offered(),
        max: MAX_VIDEOS_PER_REQUEST - 1,
      } satisfies OfferPickData,
      backdropClass: 'vs-backdrop',
      autoFocus: 'dialog',
    });
    ref.closed.subscribe((picked) => {
      if (picked) this.offered.set(picked);
    });
  }

  protected async send(): Promise<void> {
    // Busy from the first click: a double click must not open two hints and send twice.
    if (this.busy()) return;
    // Requests wait for a confirmed email: say so now, without the hint (counted as seen)
    // and a refusal after it.
    if (this.auth.user()?.emailVerified === false) {
      this.toast.error(this.t.translate('auth.verify.bannerText'));
      return;
    }
    this.busy.set(true);
    try {
      if (!(await this.gate.confirm())) return;
      const result = await this.api.invoke(exchangeCreate, {
        body: {
          holderUsername: this.holderUsername(),
          videoIds: [this.videoId()],
          message: this.message.trim() || undefined,
          offerVideoIds: this.offered().length ? this.offered() : undefined,
        },
      });
      this.offered.set([]);
      this.toast.success(this.t.translate('exchange.sent'));
      this.exchange.changed();
      this.sent.emit(result.request.id);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

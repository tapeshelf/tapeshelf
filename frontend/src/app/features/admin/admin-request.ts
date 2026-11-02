import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type AdminRequestDto, type OfferDto, adminRequest } from '../../api';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { AdminBadgeComponent, apiMessage, toneOf } from './admin-ui';

/** A negotiation thread as both sides saw it, read-only. */
@Component({
  selector: 'app-admin-request',
  imports: [
    TranslocoPipe,
    RouterLink,
    AppDatePipe,
    NgIcon,
    AlertComponent,
    SpinnerComponent,
    AdminBadgeComponent,
  ],
  providers: [provideIcons({ lucideArrowLeft })],
  template: `
    <a routerLink="../" class="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
      <ng-icon name="lucideArrowLeft" size="14" />{{ 'admin.nav.requests' | transloco }}
    </a>
    @if (error(); as message) {
      <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
    } @else if (r(); as r) {
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <h2 class="font-mono text-lg font-semibold">
          <a [routerLink]="['/admin/users', r.requester.id]" class="hover:underline"
            >&#64;{{ r.requester.username }}</a
          >
          →
          <a [routerLink]="['/admin/users', r.holder.id]" class="hover:underline"
            >&#64;{{ r.holder.username }}</a
          >
        </h2>
        <app-admin-badge [tone]="tone(r.status)">{{
          'admin.requestStatus.' + r.status | transloco
        }}</app-admin-badge>
      </div>
      <p class="mt-1 text-sm text-muted">
        {{ r.createdAt | appDate: 'medium' }}
        @if (r.awaitingUserId) {
          · {{ 'admin.requests.awaiting' | transloco: { name: awaitingName(r) } }}
        }
      </p>
      @if (r.message) {
        <p
          class="mt-3 rounded-md border-2 border-line bg-surface px-3 py-2 text-sm whitespace-pre-line"
        >
          {{ r.message }}
        </p>
      }
      @if (r.declineComment) {
        <p class="mt-2 text-sm text-muted">
          {{ 'admin.requests.declineComment' | transloco }}: {{ r.declineComment }}
        </p>
      }
      <ol class="mt-6 flex flex-col gap-3">
        @for (o of r.offers; track o.id) {
          <li class="rounded-lg border-2 border-line bg-surface p-4">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="label-mono">{{
                'admin.requests.round' | transloco: { round: o.round }
              }}</span>
              <span class="font-mono text-xs">&#64;{{ o.proposedBy.username }}</span>
              <app-admin-badge
                [tone]="o.status === 'ACCEPTED' ? 'ok' : o.status === 'PENDING' ? 'warn' : 'muted'"
                >{{ o.status }}</app-admin-badge
              >
              <span class="ml-auto text-xs text-muted">{{ o.createdAt | appDate: 'short' }}</span>
            </div>
            @if (o.message) {
              <p class="mt-2 text-sm whitespace-pre-line">{{ o.message }}</p>
            }
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p class="label-mono mb-1 text-muted">
                  {{ 'admin.requests.gives' | transloco: { name: r.holder.username } }}
                </p>
                <ul class="text-sm">
                  @for (i of side(o, 'HOLDER'); track i.video.id) {
                    <li>
                      <a [routerLink]="['/admin/videos', i.video.id]" class="hover:underline">{{
                        i.video.title
                      }}</a>
                    </li>
                  } @empty {
                    <li class="text-muted">—</li>
                  }
                </ul>
              </div>
              <div>
                <p class="label-mono mb-1 text-muted">
                  {{ 'admin.requests.gives' | transloco: { name: r.requester.username } }}
                </p>
                <ul class="text-sm">
                  @for (i of side(o, 'REQUESTER'); track i.video.id) {
                    <li>
                      <a [routerLink]="['/admin/videos', i.video.id]" class="hover:underline">{{
                        i.video.title
                      }}</a>
                    </li>
                  } @empty {
                    <li class="text-muted">—</li>
                  }
                </ul>
              </div>
            </div>
          </li>
        }
      </ol>
    } @else {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    }
  `,
})
export class AdminRequestPage {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  readonly id = input.required<string>();
  protected readonly r = signal<AdminRequestDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly tone = toneOf;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.api
          .invoke(adminRequest, { id })
          .then((r) => this.r.set(r))
          .catch((e: unknown) => this.error.set(apiMessage(e, this.t)));
      });
    });
  }

  protected side(o: OfferDto, giving: 'HOLDER' | 'REQUESTER') {
    return o.items.filter((i) => i.givingSide === giving);
  }

  protected awaitingName(r: AdminRequestDto): string {
    return r.awaitingUserId === r.holder.id ? r.holder.username : r.requester.username;
  }
}

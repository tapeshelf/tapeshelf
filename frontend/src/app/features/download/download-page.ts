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
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type DownloadInfoDto, authMe, downloadsInfo, downloadsTicket } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { videoLink } from '../../core/navigation/user-links';
import { SiteConfig } from '../../core/site/site-config';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { StrokeComponent } from '../../shared/ui/stroke/stroke';
import { panelLink } from '../../core/navigation/panels';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'counting'; left: number }
  | { kind: 'starting' }
  | { kind: 'started' }
  | { kind: 'limit' }
  | { kind: 'busy' }
  | { kind: 'failed'; message: string };

const MiB = 1024 ** 2;

/**
 * The wait page of a limited download: five seconds counted down like a film
 * leader over the video's cover, what the plan allows and what is left this month, a quiet
 * pointer to Pro on tapeshelf.com. Unlimited plans pass straight through to the file, and so does
 * every download on a self-hosted instance, which has no limits on them.
 */
@Component({
  selector: 'app-download-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    BytesPipe,
    AlertComponent,
    ButtonDirective,
    SpinnerComponent,
    StrokeComponent,
    SensitiveBlurDirective,
  ],
  styles: `
    /* A pie filling the outer ring once a second: a circle of radius r drawn with a stroke 2r wide. */
    .sweep {
      animation: leader-sweep 1s linear infinite;
    }
    @keyframes leader-sweep {
      from {
        stroke-dashoffset: 106.81;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sweep {
        animation: none;
        display: none;
      }
    }
  `,
  template: `
    <section class="mx-auto flex max-w-2xl flex-col items-center py-8 text-center sm:py-12">
      @switch (state().kind) {
        @case ('loading') {
          <div class="flex justify-center py-20 text-muted"><app-spinner /></div>
        }
        @case ('error') {
          <app-alert kind="error" class="w-full text-left" data-testid="download-error">{{
            errorMessage()
          }}</app-alert>
        }
        @default {
          @if (info(); as i) {
            <!-- The film leader: fixed colours, like the test card of the 404 page. -->
            <div
              class="relative aspect-video w-full max-w-lg overflow-hidden rounded-xl border-2 border-line bg-screen shadow-hard"
              data-testid="download-leader"
            >
              @if (i.thumbnailUrl) {
                <img
                  [src]="i.thumbnailUrl"
                  [appSensitiveBlur]="false"
                  alt=""
                  class="absolute inset-0 h-full w-full object-cover opacity-35 grayscale"
                />
              }
              <svg
                viewBox="0 0 160 90"
                preserveAspectRatio="xMidYMid slice"
                class="absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <g stroke="#f4f3ee" stroke-opacity="0.55" fill="none" stroke-width="0.6">
                  <line x1="0" y1="45" x2="160" y2="45" />
                  <line x1="80" y1="0" x2="80" y2="90" />
                  <circle cx="80" cy="45" r="34" />
                  <circle cx="80" cy="45" r="29" />
                </g>
                @if (state().kind === 'counting') {
                  <circle
                    class="sweep"
                    cx="80"
                    cy="45"
                    r="17"
                    fill="none"
                    stroke="#fc753e"
                    stroke-opacity="0.45"
                    stroke-width="34"
                    stroke-dasharray="106.81"
                    transform="rotate(-90 80 45)"
                  />
                }
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                @switch (state().kind) {
                  @case ('counting') {
                    <span
                      class="font-display text-7xl leading-none font-bold text-on-screen tabular-nums sm:text-8xl"
                      data-testid="download-count"
                      >{{ countLeft() }}</span
                    >
                  }
                  @case ('starting') {
                    <span class="text-on-screen"><app-spinner /></span>
                  }
                  @default {
                    <span
                      class="-rotate-2 rounded-md border-2 border-line bg-screen px-4 py-2 font-mono text-sm font-bold tracking-[0.2em] text-on-screen uppercase shadow-[4px_4px_0_0_#fc753e]"
                      data-testid="download-stamp"
                      >{{ stamp() | transloco }}</span
                    >
                  }
                }
              </div>
            </div>

            <p class="label-mono mt-8 flex items-center gap-2 text-muted uppercase">
              <span class="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
              {{ 'download.kicker' | transloco }} · {{ i.sizeBytes | bytes }}
            </p>
            <h1
              class="mt-3 font-display text-2xl leading-tight font-bold tracking-tight break-words sm:text-3xl"
            >
              {{ i.title }}
            </h1>
            <app-stroke class="mt-3 w-36" [seed]="7" [height]="12" [thickness]="5.5" />

            <div class="mt-5 flex max-w-xl flex-col gap-2 text-muted" aria-live="polite">
              @switch (state().kind) {
                @case ('counting') {
                  <p class="text-text" data-testid="download-starts">
                    {{ 'download.startsIn' | transloco: { n: countLeft() } }}
                  </p>
                }
                @case ('started') {
                  <p class="text-text" data-testid="download-started">
                    {{ (i.direct ? 'download.startedDirect' : 'download.started') | transloco }}
                  </p>
                }
                @case ('limit') {
                  <p class="text-text" data-testid="download-limit">
                    {{ 'download.limitReached' | transloco: { date: resetDate() } }}
                  </p>
                }
                @case ('busy') {
                  <p class="text-text" data-testid="download-busy">
                    {{ 'download.busy' | transloco }}
                  </p>
                }
                @case ('failed') {
                  <p class="text-danger" role="alert">{{ failedMessage() }}</p>
                }
              }
              @if (!i.direct) {
                @if (limitsText(); as text) {
                  <p data-testid="download-limits">{{ text }}</p>
                }
                @if (i.own) {
                  <p data-testid="download-own">{{ 'download.own' | transloco }}</p>
                } @else if (i.repeat && state().kind === 'counting') {
                  <p>{{ 'download.repeat' | transloco }}</p>
                }
                @if (site.hasTiers()) {
                  <p>
                    {{ 'download.pro' | transloco }}
                    <a
                      [routerLink]="panelLink('pro')"
                      [queryParamsHandling]="'merge'"
                      class="font-semibold text-text underline decoration-accent decoration-2 underline-offset-4"
                      data-testid="download-pro"
                      >{{ 'download.proLink' | transloco }}</a
                    >
                  </p>
                }
              }
            </div>

            <div class="mt-8 flex flex-wrap justify-center gap-2">
              @if (state().kind === 'started' || state().kind === 'busy') {
                <button type="button" appButton (click)="reload()" data-testid="download-again">
                  {{ (state().kind === 'busy' ? 'download.retry' : 'download.again') | transloco }}
                </button>
              }
              <a appButton variant="secondary" [routerLink]="videoLink()">
                {{ 'download.back' | transloco }}
              </a>
            </div>
          }
        }
      }
    </section>
  `,
})
export class DownloadPage {
  protected readonly panelLink = panelLink;
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly site = inject(SiteConfig);

  /** The video's short code, from the route. */
  readonly code = input.required<string>();

  protected readonly info = signal<DownloadInfoDto | null>(null);
  protected readonly state = signal<State>({ kind: 'loading' });
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly videoLink = computed(() => videoLink(this.code()));
  protected readonly countLeft = computed(() => {
    const s = this.state();
    return s.kind === 'counting' ? s.left : 0;
  });
  protected readonly errorMessage = computed(() => {
    const s = this.state();
    return s.kind === 'error' ? s.message : '';
  });
  protected readonly failedMessage = computed(() => {
    const s = this.state();
    return s.kind === 'failed' ? s.message : '';
  });
  protected readonly stamp = computed(() => {
    switch (this.state().kind) {
      case 'limit':
        return 'download.stampLimit';
      case 'busy':
        return 'download.stampBusy';
      case 'failed':
        return 'download.stampFailed';
      default:
        return 'download.stampStarted';
    }
  });
  /** The 1st of next month, as the server counts it (UTC). */
  protected readonly resetDate = computed(() => {
    const i = this.info();
    return i
      ? new Intl.DateTimeFormat(this.language.loaded(), {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(i.resetAt))
      : '';
  });
  /** "On the free plan, speed is limited to 1 MB/s; 7 of 10 downloads left until 1 November." */
  protected readonly limitsText = computed(() => {
    const i = this.info();
    if (!i) return null;
    this.language.loaded();
    const plan = this.t.translate('download.planFree');
    const mb = String(Math.round((i.speedBytesPerSec / MiB) * 10) / 10);
    const left = Math.max(0, i.limit - i.used);
    const params = { plan, mb, left, limit: i.limit, date: this.resetDate() };
    if (i.speedBytesPerSec > 0 && i.limit > 0)
      return this.t.translate('download.limitsBoth', params);
    if (i.speedBytesPerSec > 0) return this.t.translate('download.limitsSpeed', params);
    if (i.limit > 0) return this.t.translate('download.limitsCount', params);
    return null;
  });

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => void this.load(code));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopTimer();
    });
  }

  /** Left before an answer came: no countdown and no download behind the viewer's back. */
  private destroyed = false;

  protected reload(): void {
    void this.load(this.code());
  }

  private async load(code: string): Promise<void> {
    this.stopTimer();
    this.state.set({ kind: 'loading' });
    let info: DownloadInfoDto;
    try {
      info = await this.api.invoke(downloadsInfo, { code });
      if (this.destroyed) return;
    } catch (e) {
      this.state.set({
        kind: 'error',
        message: toApiError(e).message || this.t.translate('errors.unknown'),
      });
      return;
    }
    this.info.set(info);
    if (info.direct) return this.start();
    if (info.limitReached) return this.state.set({ kind: 'limit' });
    if (info.busy) return this.state.set({ kind: 'busy' });
    this.countdown(info.waitSec);
  }

  private countdown(seconds: number): void {
    let left = seconds;
    this.state.set({ kind: 'counting', left });
    this.timer = setInterval(() => {
      left -= 1;
      if (left > 0) this.state.set({ kind: 'counting', left });
      else {
        this.stopTimer();
        void this.start();
      }
    }, 1000);
  }

  private async start(): Promise<void> {
    const info = this.info()!;
    this.state.set({ kind: 'starting' });
    try {
      const ticket = await this.api.invoke(downloadsTicket, { id: info.videoId });
      if (this.destroyed) return; // a ticket alone counts nothing: the file request does
      // An attachment: the browser saves it and this page stays where it is.
      const a = document.createElement('a');
      a.href = ticket.url;
      a.download = '';
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      this.state.set({ kind: 'started' });
      // The count here, on the video page and in Settings → Plan: the server counts the download
      // when the file starts, a moment after the click.
      setTimeout(() => {
        this.api
          .invoke(downloadsInfo, { code: this.code() })
          .then((fresh) => this.info.set(fresh))
          .catch(() => undefined);
        this.api
          .invoke(authMe)
          .then((me) => this.auth.setUser(me))
          .catch(() => undefined);
      }, 1500);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'downloadLimitReached') this.state.set({ kind: 'limit' });
      else if (err.code === 'downloadBusy') this.state.set({ kind: 'busy' });
      else
        this.state.set({
          kind: 'failed',
          message: err.message || this.t.translate('errors.unknown'),
        });
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

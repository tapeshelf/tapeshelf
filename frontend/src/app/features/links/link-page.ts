import { NgTemplateOutlet } from '@angular/common';
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
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookmarkPlus,
  lucideCheck,
  lucideDownload,
  lucideFileArchive,
  lucideHourglass,
  lucideLockKeyhole,
  lucidePlay,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type LinkPageDto,
  type LinkVideoDto,
  type PlaybackDto,
  linksPage,
  linksPlayback,
  linksSave,
  linksSendCode,
  linksUnlock,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { profileLink } from '../../core/navigation/user-links';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { QualityPipe } from '../../shared/pipes/quality.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { MosaicComponent } from '../../shared/ui/mosaic/mosaic';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { StrokeComponent } from '../../shared/ui/stroke/stroke';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { NotFoundPage } from '../not-found/not-found';
import { type TimelineFrame } from '../video/player-utils';
import { VideoPlayerComponent } from '../video/video-player';
import { timeLeft } from './links';

/**
 * /t/<code>: someone's temporary link. Who sends, a warning that it runs
 * out with the time left counting down, the password or the emailed code when the link asks for
 * them, then the videos: watch over the page, download one or all, put them on one's own shelf.
 */
@Component({
  selector: 'app-link-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    MosaicComponent,
    RouterLink,
    NgIcon,
    TranslocoPipe,
    AppDatePipe,
    BytesPipe,
    DurationPipe,
    QualityPipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
    StrokeComponent,
    ThumbScrubComponent,
    NotFoundPage,
    VideoPlayerComponent,
  ],
  providers: [
    provideIcons({
      lucideBookmarkPlus,
      lucideCheck,
      lucideDownload,
      lucideFileArchive,
      lucideHourglass,
      lucideLockKeyhole,
      lucidePlay,
    }),
  ],
  template: `
    @if (missing()) {
      <app-not-found />
    } @else if (page(); as p) {
      <section
        class="mx-auto w-full pb-10 sm:pt-4"
        [class]="layout().width"
        data-testid="link-page"
      >
        <header class="flex items-center gap-4">
          <span
            class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-accent text-2xl font-bold text-accent-fg shadow-hard-sm"
            aria-hidden="true"
          >
            @if (p.sender.avatarUrl) {
              <img [src]="p.sender.avatarUrl" alt="" class="h-full w-full object-cover" />
            } @else {
              {{ p.sender.displayName.charAt(0).toUpperCase() }}
            }
          </span>
          <div class="min-w-0">
            <p class="label-mono text-muted">{{ 'links.page.kicker' | transloco }}</p>
            <h1
              class="font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl"
              data-testid="link-title"
            >
              @if (p.sender.pageHidden) {
                <span>&#64;{{ p.sender.username }}</span>
              } @else {
                <a
                  class="transition-colors hover:text-accent-text"
                  [routerLink]="profileLink(p.sender.username)"
                  >&#64;{{ p.sender.username }}</a
                >
              }
              {{ 'links.page.shares' | transloco: { count: p.count } }}
            </h1>
            <app-stroke class="mt-2 block w-36" [seed]="152" [height]="10" [thickness]="5" />
          </div>
        </header>

        <div
          class="mt-6 flex flex-col gap-4 rounded-xl border-2 border-line bg-accent-soft p-4 shadow-hard sm:flex-row sm:items-center sm:justify-between sm:p-5"
          role="status"
          data-testid="link-warning"
        >
          <div class="flex items-start gap-3">
            <ng-icon name="lucideHourglass" size="24" class="mt-0.5 shrink-0 text-accent-text" />
            <div>
              <p class="font-semibold">
                {{
                  'links.page.until' | transloco: { date: p.expiresAt | appDate: 'd MMMM, HH:mm' }
                }}
              </p>
              <p class="text-sm text-muted">
                {{ 'links.page.after' | transloco: { count: p.count } }}
              </p>
            </div>
          </div>
          <div
            class="flex shrink-0 items-baseline gap-2 self-start rounded-md border-2 border-line bg-screen px-3 py-1.5 font-mono font-bold text-on-screen shadow-[3px_3px_0_0_var(--color-accent)] sm:self-auto"
            [attr.aria-label]="'links.page.left' | transloco"
            data-testid="link-countdown"
          >
            @if (clock().days) {
              <span class="text-sm">{{ 'links.page.days' | transloco: { d: clock().days } }}</span>
            }
            <span class="text-xl tabular-nums">{{ clock().clock }}</span>
          </div>
        </div>

        @if (p.own) {
          <app-alert kind="info" class="mt-4 block" data-testid="link-own">{{
            'links.page.own' | transloco
          }}</app-alert>
        }

        @if (p.access === 'locked') {
          <form
            class="mx-auto mt-8 flex max-w-sm flex-col gap-3 rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
            data-testid="link-gate"
            (ngSubmit)="unlock()"
          >
            <h2 class="flex items-center gap-2 font-semibold">
              <ng-icon name="lucideLockKeyhole" size="18" class="text-muted" />{{
                'links.gate.title' | transloco: { count: p.count }
              }}
            </h2>
            @if (p.needsPassword) {
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                {{ 'links.gate.password' | transloco }}
                <input
                  appInput
                  type="password"
                  maxlength="128"
                  name="password"
                  autocomplete="off"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event)"
                  data-testid="link-gate-password"
                />
              </label>
            }
            @if (p.needsCode) {
              <p class="text-sm text-muted">
                {{ 'links.gate.codeLead' | transloco: { email: p.emailHint } }}
              </p>
              @if (codeSent()) {
                <label class="flex flex-col gap-1.5 text-sm font-medium">
                  {{ 'links.gate.code' | transloco }}
                  <input
                    appInput
                    type="text"
                    name="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="6"
                    class="font-mono tracking-[0.3em]"
                    [ngModel]="code6()"
                    (ngModelChange)="code6.set($event)"
                    data-testid="link-gate-code"
                  />
                </label>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  class="self-start"
                  [disabled]="busy()"
                  (click)="sendCode()"
                >
                  {{ 'links.gate.again' | transloco }}
                </button>
              } @else {
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  [disabled]="busy()"
                  data-testid="link-send-code"
                  (click)="sendCode()"
                >
                  {{ 'links.gate.sendCode' | transloco }}
                </button>
              }
              @if (!auth.user()) {
                <p class="text-xs text-muted">
                  {{ 'links.gate.account' | transloco }}
                  <a
                    class="font-semibold text-text underline underline-offset-2"
                    routerLink="/login"
                    [queryParams]="{ returnTo: back() }"
                    >{{ 'links.gate.logIn' | transloco }}</a
                  >
                </p>
              }
            }
            @if (error(); as message) {
              <app-alert kind="error">{{ message }}</app-alert>
            }
            <button
              type="submit"
              appButton
              [disabled]="busy() || !canSubmit()"
              data-testid="link-unlock"
            >
              {{ 'links.gate.open' | transloco }}
            </button>
          </form>
        } @else {
          <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p class="label-mono text-muted" data-testid="link-summary">
              {{
                'links.page.summary' | transloco: { count: p.count, size: (p.totalBytes | bytes) }
              }}
            </p>
            <!-- One video has its own buttons; "all" is for several. -->
            @if (p.videos.length > 1) {
              <div class="flex flex-wrap gap-2">
                <a appButton [href]="zipUrl()" download data-testid="link-zip"
                  ><ng-icon name="lucideFileArchive" size="16" />{{
                    'links.page.zip' | transloco: { size: (p.zipBytes | bytes) }
                  }}</a
                >
                @if (auth.user() && !p.own) {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    [disabled]="busy() || allOnShelf()"
                    data-testid="link-save-all"
                    (click)="save(p.videos)"
                  >
                    <ng-icon
                      [name]="allOnShelf() ? 'lucideCheck' : 'lucideBookmarkPlus'"
                      size="16"
                    />{{
                      (allOnShelf() ? 'links.page.allOnShelf' : 'links.page.saveAll') | transloco
                    }}
                  </button>
                }
              </div>
            }
          </div>
          @if (!auth.user()) {
            <p class="mt-3 text-sm text-muted" data-testid="link-guest">
              {{ 'links.page.guest' | transloco: { count: p.count } }}
              <a
                class="font-semibold text-text underline underline-offset-2"
                routerLink="/register"
                [queryParams]="{ returnTo: back() }"
                >{{ 'links.page.signUp' | transloco }}</a
              >
              ·
              <a
                class="font-semibold text-text underline underline-offset-2"
                routerLink="/login"
                [queryParams]="{ returnTo: back() }"
                >{{ 'links.gate.logIn' | transloco }}</a
              >
            </p>
          } @else if (error(); as message) {
            <app-alert kind="error" class="mt-3 block">{{ message }}</app-alert>
          }

          @if (p.videos.length === 1) {
            <div class="mt-5 flex justify-center" data-testid="link-videos">
              <ng-container
                *ngTemplateOutlet="card; context: { $implicit: p.videos[0], height: null }"
              />
            </div>
          } @else {
            <!-- The shelf's mosaic: each video in its own shape, one height a row,
                 every row but the last as wide as the page; the size follows how many there are. -->
            <app-mosaic
              class="mt-5"
              [items]="p.videos"
              [key]="videoKey"
              [aspect]="videoAspect"
              [itemTemplate]="card"
              [gap]="20"
              data-testid="link-videos"
            />
          }
          <!-- One card: the picture and, once asked, the player in the same box; the video's
               details and buttons under it. "height": the mosaic row's, none for one video. -->
          <ng-template #card let-item let-h="height">
            <article
              class="@container flex flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-hard-sm"
              [class]="h === null ? 'w-full' : 'h-full'"
              [style.max-width]="h === null ? 'calc(72dvh * ' + ratioOf(item) + ')' : null"
              data-testid="link-video"
            >
              <!-- The picture and the player take the same box, in the video's own shape. -->
              <div
                class="relative w-full shrink-0 bg-black"
                [style.aspect-ratio]="h === null ? aspectOf(item) : null"
                [style.height.px]="h === null ? null : h - 4"
              >
                @if (playing() === item.video.id) {
                  <app-video-player
                    class="absolute inset-0 h-full"
                    [videoId]="item.video.id"
                    [frames]="framesOf(item)"
                    [poster]="item.video.thumbnailUrl"
                    [source]="sourceOf(item)"
                  />
                } @else {
                  <button
                    type="button"
                    class="group absolute inset-0 h-full w-full"
                    [attr.aria-label]="'links.page.watch' | transloco"
                    (click)="watch(item)"
                  >
                    <app-thumb-scrub
                      [thumbnailUrl]="item.video.thumbnailUrl"
                      [frameUrls]="item.video.frameUrls"
                      [alt]="''"
                      [restricted]="sensitive.blurs(item.video)"
                    />
                    <span
                      class="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      [class.opacity-0]="h !== null"
                      aria-hidden="true"
                    >
                      <span
                        class="flex items-center justify-center rounded-full border-2 border-line bg-accent text-accent-fg shadow-hard-sm"
                        [class]="h === null ? 'h-16 w-16' : 'h-12 w-12'"
                        ><ng-icon name="lucidePlay" [size]="h === null ? '26' : '20'"
                      /></span>
                    </span>
                    @if (item.video.durationSec) {
                      <span
                        class="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-scrim px-1 font-mono text-[11px] text-white"
                        >{{ item.video.durationSec | duration }}</span
                      >
                    }
                  </button>
                }
              </div>
              <div class="flex flex-1 flex-col gap-1 p-3 @xl:flex-row @xl:items-center @xl:gap-4">
                <div class="min-w-0 flex-1">
                  <h2
                    class="line-clamp-2 font-semibold"
                    [class]="h === null ? 'text-lg' : 'text-sm'"
                    [attr.title]="item.video.title"
                  >
                    {{ item.video.title }}
                  </h2>
                  <p class="label-mono mt-1 text-muted">
                    {{ item.fileBytes | bytes }}
                    @if (item.video | quality; as q) {
                      · {{ q }}
                    }
                  </p>
                </div>
                <!-- Always one row of compact buttons: on a narrow (vertical) card the icons alone,
                     the words come back as the card has room for them — "Watch" first. -->
                <div class="mt-auto flex flex-nowrap gap-1.5 pt-2 @xl:mt-0 @xl:pt-0">
                  @if (playing() !== item.video.id) {
                    <button
                      type="button"
                      appButton
                      size="sm"
                      [attr.aria-label]="'links.page.watch' | transloco"
                      [attr.title]="'links.page.watch' | transloco"
                      data-testid="link-watch"
                      (click)="watch(item)"
                    >
                      <ng-icon name="lucidePlay" size="14" /><span class="hidden @[12rem]:inline">{{
                        'links.page.watch' | transloco
                      }}</span>
                    </button>
                  }
                  <a
                    appButton
                    size="sm"
                    [variant]="playing() === item.video.id ? 'primary' : 'secondary'"
                    [href]="downloadUrl(item)"
                    download
                    [attr.aria-label]="'links.page.download' | transloco"
                    [attr.title]="'links.page.download' | transloco"
                    data-testid="link-download"
                    ><ng-icon name="lucideDownload" size="14" /><span
                      [class]="
                        auth.user() && !p.own ? 'hidden @[22rem]:inline' : 'hidden @[15rem]:inline'
                      "
                      >{{ 'links.page.download' | transloco }}</span
                    ></a
                  >
                  @if (auth.user() && !p.own) {
                    @if (item.onShelf) {
                      <span
                        class="inline-flex h-8 items-center gap-1.5 rounded-md bg-shelf px-3 text-xs font-semibold text-ink"
                        [attr.title]="'links.page.onShelf' | transloco"
                        data-testid="link-on-shelf"
                        ><ng-icon name="lucideCheck" size="14" /><span
                          class="hidden @[22rem]:inline"
                          >{{ 'links.page.onShelf' | transloco }}</span
                        ></span
                      >
                    } @else {
                      <button
                        type="button"
                        appButton
                        size="sm"
                        variant="secondary"
                        [disabled]="busy()"
                        [attr.aria-label]="'links.page.save' | transloco"
                        [attr.title]="'links.page.save' | transloco"
                        data-testid="link-save"
                        (click)="save([item])"
                      >
                        <ng-icon name="lucideBookmarkPlus" size="14" /><span
                          class="hidden @[22rem]:inline"
                          >{{ 'links.page.save' | transloco }}</span
                        >
                      </button>
                    }
                  }
                </div>
              </div>
            </article>
          </ng-template>
        }
      </section>
    } @else if (failed(); as message) {
      <app-alert kind="error" class="mx-auto mt-10 block max-w-md">{{ message }}</app-alert>
    } @else {
      <div class="flex justify-center py-16 text-muted"><app-spinner /></div>
    }
  `,
})
export class LinkPage {
  protected readonly profileLink = profileLink;
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly auth = inject(AuthStore);
  protected readonly sensitive = inject(SensitiveContentService);

  readonly code = input.required<string>();

  protected readonly page = signal<LinkPageDto | null>(null);
  protected readonly missing = signal(false);
  protected readonly failed = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly password = signal('');
  protected readonly code6 = signal('');
  protected readonly codeSent = signal(false);
  private readonly now = signal(Date.now());
  /**
   * When the link ends by this device's clock: when the page came, plus the seconds the server gave.
   * By `expiresAt` a device whose clock ran ahead saw a living link as gone.
   */
  private readonly deadline = signal(0);
  /** The link shown, and its loads numbered: a late answer for another one is dropped. */
  private shown: string | null = null;
  private loads = 0;
  /** The video playing in its card, if any. */
  protected readonly playing = signal<string | null>(null);
  private readonly frames = new Map<string, TimelineFrame[]>();
  private readonly sources = new Map<string, () => Promise<PlaybackDto>>();
  /**
   * How wide the page is for how many videos there are: one is a big player with its buttons, a
   * few take a narrower page, many a wider one; the mosaic sizes the tiles by their number.
   */
  protected readonly layout = computed(() => {
    const n = this.page()?.count ?? 0;
    if (n <= 1) return { width: 'max-w-4xl' };
    if (n <= 4) return { width: 'max-w-5xl' };
    if (n <= 8) return { width: 'max-w-6xl' };
    return { width: 'max-w-7xl' };
  });

  protected readonly left = computed(() => {
    return this.page() ? this.deadline() - this.now() : 0;
  });
  protected readonly clock = computed(() => timeLeft(this.left()));
  protected readonly allOnShelf = computed(
    () => !!this.page()?.videos.length && this.page()!.videos.every((v) => v.onShelf),
  );
  protected readonly canSubmit = computed(() => {
    const p = this.page();
    if (!p) return false;
    const pw = !p.needsPassword || this.password().length > 0;
    const code = !p.needsCode || /^\d{6}$/.test(this.code6().trim());
    // One of two at a time is fine: what passes is remembered.
    return (p.needsPassword && pw) || (p.needsCode && code && this.codeSent());
  });
  /** Where signing up or in comes back to. */
  protected readonly back = computed(() => `/t/${this.code()}`);
  protected readonly zipUrl = computed(() => `/api/links/${this.code()}/zip`);

  constructor() {
    // Once the account is known (its shelf says what is already on it), and again if it changes.
    effect(() => {
      const code = this.code();
      if (this.auth.status() === 'unknown') return;
      this.auth.userId();
      untracked(() => {
        // Another link: nothing typed or shown for the last one stays.
        if (code !== this.shown) {
          this.shown = code;
          this.page.set(null);
          this.missing.set(false);
          this.error.set(null);
          this.password.set('');
          this.code6.set('');
          this.codeSent.set(false);
          this.playing.set(null);
        }
        void this.load(code);
      });
    });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // One video: its player is there at once and starts, as on a video page, unless the
    // sensitive gate stands in front of it.
    effect(() => {
      const p = this.page();
      const only = p?.access === 'open' && p.videos.length === 1 ? p.videos[0]! : null;
      if (only && !this.sensitive.blurs(only.video))
        untracked(() => {
          if (this.playing() === null) this.playing.set(only.video.id);
        });
    });
    // Time is up: the link is gone, as the server will say from now on.
    effect(() => {
      if (this.page() && this.left() <= 0) untracked(() => this.missing.set(true));
    });
  }

  protected downloadUrl(item: LinkVideoDto): string {
    return `/api/links/${this.code()}/videos/${item.video.id}/download`;
  }

  /** Plays in its own card; another one playing stops. */
  protected async watch(item: LinkVideoDto): Promise<void> {
    if (this.sensitive.blurs(item.video) && !(await this.sensitive.ensure())) return;
    this.playing.set(item.video.id);
  }

  protected readonly videoKey = (item: LinkVideoDto) => item.video.id;
  protected readonly videoAspect = (item: LinkVideoDto) => this.ratioOf(item);

  protected ratioOf(item: LinkVideoDto): number {
    return (item.video.width || 16) / (item.video.height || 9);
  }

  protected aspectOf(item: LinkVideoDto): string {
    return `${item.video.width || 16} / ${item.video.height || 9}`;
  }

  /** The tile's sixteen frames are evenly spaced over the video, as the timeline expects. */
  protected framesOf(item: LinkVideoDto): TimelineFrame[] {
    let frames = this.frames.get(item.video.id);
    if (!frames) {
      const duration = item.video.durationSec ?? 0;
      frames = item.video.frameUrls.map((url, i, all) => ({
        url,
        timestampSec: ((i + 0.5) * duration) / all.length,
      }));
      this.frames.set(item.video.id, frames);
    }
    return frames;
  }

  /** The playlist from the link: its token, no account needed. */
  protected sourceOf(item: LinkVideoDto): () => Promise<PlaybackDto> {
    let source = this.sources.get(item.video.id);
    if (!source) {
      source = () => this.api.invoke(linksPlayback, { code: this.code(), videoId: item.video.id });
      this.sources.set(item.video.id, source);
    }
    return source;
  }

  protected async unlock(): Promise<void> {
    const p = this.page();
    if (!p || this.busy() || !this.canSubmit()) return;
    await this.run(async () => {
      const page = await this.api.invoke(linksUnlock, {
        code: this.code(),
        body: {
          ...(p.needsPassword && this.password() ? { password: this.password() } : {}),
          ...(p.needsCode && this.codeSent() && this.code6().trim()
            ? { code: this.code6().trim() }
            : {}),
        },
      });
      this.show(page);
    });
  }

  protected async sendCode(): Promise<void> {
    await this.run(async () => {
      await this.api.invoke(linksSendCode, { code: this.code() });
      this.codeSent.set(true);
      this.toast.success(this.t.translate('links.gate.sent'));
    });
  }

  protected async save(items: LinkVideoDto[]): Promise<void> {
    const ids = items.filter((i) => !i.onShelf).map((i) => i.video.id);
    if (!ids.length) return;
    await this.run(async () => {
      const result = await this.api.invoke(linksSave, {
        code: this.code(),
        body: { videoIds: ids },
      });
      const onShelf = new Set(result.onShelf);
      this.page.update((page) =>
        page
          ? {
              ...page,
              videos: page.videos.map((v) =>
                onShelf.has(v.video.id) ? { ...v, onShelf: true } : v,
              ),
            }
          : page,
      );
      this.toast.success(this.t.translate('links.page.saved', { count: ids.length }));
    });
  }

  private show(page: LinkPageDto): void {
    this.deadline.set(Date.now() + page.expiresInSec * 1000);
    this.page.set(page);
  }

  private async load(code: string): Promise<void> {
    const seq = ++this.loads;
    this.failed.set(null);
    try {
      const page = await this.api.invoke(linksPage, { code });
      if (seq !== this.loads) return;
      this.show(page);
      this.missing.set(false);
    } catch (e) {
      if (seq !== this.loads) return;
      const err = toApiError(e);
      if (err.statusCode === 404) this.missing.set(true);
      else this.failed.set(err.message || this.t.translate('errors.unknown'));
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      const err = toApiError(e);
      if (err.statusCode === 404) this.missing.set(true);
      else this.error.set(err.message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

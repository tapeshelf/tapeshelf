import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideMaximize,
  lucideMinimize,
  lucidePause,
  lucidePlay,
  lucideVolume2,
  lucideVolumeX,
} from '@ng-icons/lucide';
// The light build: AES-128 and MSE without what one quality level never needs
// (subtitles, alternate audio, DRM, CMCD, content steering) — 234 kB less to fetch and parse.
import Hls, { type ErrorData, Events } from 'hls.js/light';

import { Api, type PlaybackDto, streamingPlayback } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  PLAYBACK_RATES,
  type TimelineFrame,
  actionForKey,
  frameAt,
  shouldRefreshPlayback,
} from './player-utils';
import { FormsModule } from '@angular/forms';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

const CONTROLS_HIDE_MS = 2500;
const REFRESH_MIN_INTERVAL_MS = 5000;
/** Seconds of video kept loaded ahead of the playhead. */
const BUFFER_AHEAD_SEC = 30;

/**
 * HLS player with custom controls. Segments come straight from S3 (presigned),
 * playlists and the key from the API with the playback token; expired links trigger a fresh
 * playback and resume at the same position. Safari plays HLS natively.
 */
@Component({
  selector: 'app-video-player',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    NgIcon,
    DurationPipe,
    ButtonDirective,
    SpinnerComponent,
  ],
  providers: [
    provideIcons({
      lucidePlay,
      lucidePause,
      lucideVolume2,
      lucideVolumeX,
      lucideMaximize,
      lucideMinimize,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div
      #container
      class="group relative h-full w-full overflow-hidden bg-black outline-none select-none"
      tabindex="0"
      data-testid="player"
      (keydown)="onKey($event)"
      (pointerleave)="hideSoon()"
    >
      <!-- The picture the tile showed, under the video: never black between the two. -->
      @if (still(); as src) {
        <img [src]="src" alt="" class="absolute inset-0 h-full w-full object-contain" />
      }
      <video
        #video
        class="relative h-full w-full object-contain"
        playsinline
        preload="metadata"
        [attr.poster]="poster()"
        (click)="togglePlay()"
        (dblclick)="toggleFullscreen()"
        (play)="onPlay()"
        (pause)="onPause()"
        (ended)="onPause()"
        (waiting)="buffering.set(true)"
        (playing)="buffering.set(false)"
        (canplay)="buffering.set(false)"
        (volumechange)="onVolume()"
      ></video>

      @if (autoMuted() && !error()) {
        <button
          type="button"
          class="absolute top-3 left-3 z-10 flex h-9 items-center gap-2 rounded-full bg-scrim px-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          data-testid="player-unmute"
          (click)="unmute(); $event.stopPropagation()"
        >
          <ng-icon name="lucideVolumeX" size="16" />
          {{ 'player.tapToUnmute' | transloco }}
        </button>
      }
      @if (error(); as message) {
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center text-sm text-white"
        >
          <span>{{ message }}</span>
          <button type="button" appButton variant="secondary" size="sm" (click)="retry()">
            {{ 'player.retry' | transloco }}
          </button>
        </div>
      } @else if (starting() || (buffering() && playing())) {
        <div
          class="late-in pointer-events-none absolute inset-0 flex items-center justify-center text-white"
        >
          <app-spinner [size]="44" />
        </div>
      } @else if (!playing()) {
        <button
          type="button"
          class="absolute inset-0 flex items-center justify-center"
          [attr.aria-label]="'player.play' | transloco"
          (click)="togglePlay()"
        >
          <span
            class="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent-edge bg-accent text-accent-fg shadow-hard-sm"
          >
            <ng-icon name="lucidePlay" size="30" />
          </span>
        </button>
      }

      <div
        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-10 pb-2 text-white transition-opacity focus-within:pointer-events-auto focus-within:opacity-100"
        [class.opacity-0]="!controlsVisible() || starting()"
        [class.pointer-events-none]="!controlsVisible() || starting()"
      >
        <!-- Shown while a control has the keyboard's focus: they hid under it. -->
        <div
          #timeline
          class="relative h-6 cursor-pointer touch-none"
          role="slider"
          tabindex="0"
          [attr.aria-label]="'player.seek' | transloco"
          [attr.aria-valuemin]="0"
          [attr.aria-valuemax]="duration()"
          [attr.aria-valuenow]="currentTime()"
          [attr.aria-valuetext]="(currentTime() | duration) + ' / ' + (duration() | duration)"
          (pointerdown)="onSeekPointer($event, true)"
          (pointermove)="onTimelineMove($event)"
          (pointerup)="onSeekEnd($event)"
          (pointerleave)="hoverTime.set(null)"
        >
          <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-white/25">
            <div class="h-full rounded bg-white/40" [style.width.%]="bufferedPercent()"></div>
            <div
              class="absolute inset-y-0 left-0 rounded bg-accent"
              [style.width.%]="progressPercent()"
            ></div>
          </div>
          <div
            class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow"
            [style.left.%]="progressPercent()"
          ></div>
          @if (hoverTime(); as t) {
            <div
              class="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 overflow-hidden rounded-md border-2 border-white/30 bg-black"
              [style.left.px]="hoverX()"
            >
              @if (hoverFrame(); as f) {
                <img [src]="f.url" alt="" class="block aspect-video w-40 object-cover" />
              }
              <div class="px-2 py-0.5 text-center text-xs tabular-nums">{{ t | duration }}</div>
            </div>
          }
        </div>
        <div class="flex items-center gap-1 text-sm">
          <button
            type="button"
            class="rounded p-1.5 hover:bg-white/10"
            [attr.aria-label]="(playing() ? 'player.pause' : 'player.play') | transloco"
            (click)="togglePlay()"
          >
            <ng-icon [name]="playing() ? 'lucidePause' : 'lucidePlay'" size="20" />
          </button>
          <button
            type="button"
            class="rounded p-1.5 hover:bg-white/10"
            [attr.aria-label]="(muted() ? 'player.unmute' : 'player.mute') | transloco"
            (click)="toggleMute()"
          >
            <ng-icon
              [name]="muted() || volume() === 0 ? 'lucideVolumeX' : 'lucideVolume2'"
              size="20"
            />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="hidden w-20 accent-[var(--vs-accent)] sm:block"
            [value]="muted() ? 0 : volume()"
            [attr.aria-label]="'player.volume' | transloco"
            (input)="setVolume($event)"
          />
          <span class="ml-2 text-xs whitespace-nowrap tabular-nums"
            >{{ currentTime() | duration }} / {{ duration() | duration }}</span
          >
          <span class="flex-1"></span>
          <app-select
            [variant]="'player'"
            [ngModel]="rate()"
            (ngModelChange)="setRate($event)"
            [ariaLabel]="'player.speed' | transloco"
          >
            @for (r of rates; track r) {
              <app-option [value]="r">{{ r }}×</app-option>
            }
          </app-select>
          <button
            type="button"
            class="rounded p-1.5 hover:bg-white/10"
            [attr.aria-label]="
              (fullscreen() ? 'player.exitFullscreen' : 'player.fullscreen') | transloco
            "
            (click)="toggleFullscreen()"
          >
            <ng-icon [name]="fullscreen() ? 'lucideMinimize' : 'lucideMaximize'" size="20" />
          </button>
        </div>
      </div>
    </div>
  `,
})
export class VideoPlayerComponent {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly videoId = input.required<string>();
  readonly frames = input<TimelineFrame[]>([]);
  readonly poster = input<string | null>(null);
  /** What is already on screen for this video (the tile's picture), until poster and video are in. */
  readonly still = input<string | null>(null);
  /**
   * Where the playlist comes from instead of the video's own playback: a temporary link's page
   * whose token is the link's.
   */
  readonly source = input<(() => Promise<PlaybackDto>) | null>(null);

  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly timelineRef = viewChild.required<ElementRef<HTMLDivElement>>('timeline');

  protected readonly rates = PLAYBACK_RATES;
  protected readonly playing = signal(false);
  protected readonly buffering = signal(false);
  /** On its way to start by itself: no Play button or controls for a moment before it does. */
  protected readonly starting = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly buffered = signal(0);
  protected readonly volume = signal(1);
  protected readonly muted = signal(false);
  protected readonly rate = signal(1);
  protected readonly fullscreen = signal(false);
  protected readonly controlsVisible = signal(true);
  protected readonly hoverTime = signal<number | null>(null);
  protected readonly hoverX = signal(0);
  protected readonly error = signal<string | null>(null);
  /** The browser allowed playing only without sound: a tap on the hint turns it on. */
  protected readonly autoMuted = signal(false);
  protected readonly progressPercent = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0,
  );
  protected readonly bufferedPercent = computed(() =>
    this.duration() > 0 ? (this.buffered() / this.duration()) * 100 : 0,
  );
  protected readonly hoverFrame = computed(() => {
    const t = this.hoverTime();
    return t === null ? null : frameAt(this.frames(), t, this.duration());
  });

  private hls: Hls | null = null;
  private native = false;
  /** The first load plays by itself; a refresh resumes what was playing instead. */
  private autoplayPending = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRefresh = 0;
  /** When the player recovered from media errors lately: a broken segment must not loop forever. */
  private mediaRecoveries: number[] = [];
  /**
   * Gone from the page: an answer to a request made before must not start hls.js on a detached
   * <video>, which kept loading segments and could even play.
   */
  private destroyed = false;
  private resumeAt = 0;
  private resumePlaying = false;
  private seeking = false;

  constructor() {
    afterNextRender(() => void this.load());
    const onFullscreen = () => this.fullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    // iPhone: only the <video> itself goes full screen; it says so with its own events.
    afterNextRender(() => {
      const video = this.videoRef().nativeElement;
      video.addEventListener('webkitbeginfullscreen', () => this.fullscreen.set(true));
      video.addEventListener('webkitendfullscreen', () => this.fullscreen.set(false));
      // The frequent events as plain listeners: a template listener re-checks the whole video page
      // on each (time four times a second while playing, every mouse move over the player); the
      // signals they set redraw the controls alone.
      const time = () => this.onTime();
      for (const type of ['timeupdate', 'durationchange', 'progress'])
        video.addEventListener(type, time);
      this.containerRef().nativeElement.addEventListener('pointermove', () => this.poke(), {
        passive: true,
      });
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      document.removeEventListener('fullscreenchange', onFullscreen);
      this.hls?.destroy();
      this.hls = null;
      if (this.native) {
        const video = this.videoRef().nativeElement;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (this.hideTimer) clearTimeout(this.hideTimer);
    });
  }

  // ------------------------------------------------------------------ loading

  private async load(): Promise<void> {
    this.error.set(null);
    this.autoplayPending = true;
    this.starting.set(true);
    try {
      const { playlistUrl } = await this.playlist();
      if (this.destroyed) return;
      this.attach(playlistUrl);
    } catch (e) {
      if (this.destroyed) return;
      this.starting.set(false);
      const err = toApiError(e);
      this.error.set(
        err.statusCode === 403
          ? this.t.translate('player.noAccess')
          : err.message || this.t.translate('player.error'),
      );
    }
  }

  private attach(url: string): void {
    const video = this.videoRef().nativeElement;
    if (Hls.isSupported()) {
      this.hls?.destroy();
      const hls = new Hls({
        // Cookies only for our own origin: presigned S3 requests must stay credential-free.
        xhrSetup: (xhr, requestUrl) => {
          xhr.withCredentials = requestUrl.startsWith(location.origin);
        },
        // A short run ahead and no more, however small the file: hls.js would
        // otherwise fetch up to ten minutes as long as that fits its byte budget.
        // Exactly that far: a higher ceiling let hls.js run up to 45 s ahead.
        maxBufferLength: BUFFER_AHEAD_SEC,
        maxMaxBufferLength: BUFFER_AHEAD_SEC,
        maxBufferSize: 24 * 1024 * 1024,
        backBufferLength: 90,
      });
      hls.on(Events.ERROR, (_event, data) => this.onHlsError(data));
      hls.on(Events.MANIFEST_PARSED, () => {
        if (this.resumeAt > 0) {
          hls.startLoad(this.resumeAt);
          video.currentTime = this.resumeAt;
          this.resumeAt = 0;
        }
        if (this.resumePlaying) {
          this.resumePlaying = false;
          void video.play().catch(() => undefined);
        } else if (this.autoplayPending) {
          this.autoplayPending = false;
          void this.autoplay();
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      this.hls = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      this.native = true;
      video.addEventListener(
        'error',
        () => {
          // Refused again too soon: say so instead of a spinner for ever.
          if (this.mayRefresh()) void this.refresh();
          else this.error.set(this.t.translate('player.error'));
        },
        { once: true },
      );
      video.src = url;
      if (this.resumeAt > 0) {
        const at = this.resumeAt;
        this.resumeAt = 0;
        video.addEventListener(
          'loadedmetadata',
          () => {
            video.currentTime = at;
            if (this.resumePlaying) void video.play().catch(() => undefined);
            this.resumePlaying = false;
          },
          { once: true },
        );
      } else if (this.autoplayPending) {
        this.autoplayPending = false;
        video.addEventListener('loadedmetadata', () => void this.autoplay(), { once: true });
      }
    } else {
      this.error.set(this.t.translate('player.unsupported'));
    }
  }

  private onHlsError(data: ErrorData): void {
    if (shouldRefreshPlayback(data)) {
      // A refresh refused for coming too soon after the last one, on a fatal error: the stream is
      // stopped, so the viewer gets the error and its retry.
      if (this.mayRefresh()) void this.refresh();
      else if (data.fatal) this.error.set(this.t.translate('player.error'));
      return;
    }
    if (!data.fatal) return;
    if (data.type === 'mediaError') {
      // Two recoveries within ten seconds at most (hls.js's own advice): then it is broken.
      const now = Date.now();
      this.mediaRecoveries = this.mediaRecoveries.filter((t) => now - t < 10_000);
      if (this.mediaRecoveries.length < 2) {
        this.mediaRecoveries.push(now);
        this.hls?.recoverMediaError();
        return;
      }
    }
    this.error.set(this.t.translate('player.error'));
  }

  private playlist(): Promise<PlaybackDto> {
    return this.source()?.() ?? this.api.invoke(streamingPlayback, { id: this.videoId() });
  }

  private mayRefresh(): boolean {
    return Date.now() - this.lastRefresh >= REFRESH_MIN_INTERVAL_MS;
  }

  /** New playback token + playlist, continuing where we were (recipe). */
  private async refresh(): Promise<void> {
    if (Date.now() - this.lastRefresh < REFRESH_MIN_INTERVAL_MS) return;
    this.lastRefresh = Date.now();
    const video = this.videoRef().nativeElement;
    this.resumeAt = video.currentTime;
    this.resumePlaying = !video.paused && !video.ended;
    try {
      const { playlistUrl } = await this.playlist();
      if (this.destroyed) return;
      if (this.hls && !this.native) {
        this.hls.stopLoad();
        this.hls.loadSource(playlistUrl);
      } else {
        this.attach(playlistUrl);
      }
    } catch (e) {
      if (this.destroyed) return;
      const err = toApiError(e);
      this.error.set(
        err.statusCode === 403
          ? this.t.translate('player.noAccess')
          : err.statusCode === 429 && err.message // the month's traffic ran out
            ? err.message
            : this.t.translate('player.error'),
      );
    }
  }

  protected retry(): void {
    this.lastRefresh = 0;
    void this.load();
  }

  // ----------------------------------------------------------------- controls

  protected togglePlay(): void {
    const video = this.videoRef().nativeElement;
    if (this.error()) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  /**
   * Plays as soon as the video can. A browser that has not seen the viewer
   * interact with the site yet refuses sound: then it plays muted and says so over the picture.
   */
  private async autoplay(): Promise<void> {
    const video = this.videoRef().nativeElement;
    if (this.destroyed) return;
    try {
      await video.play();
    } catch {
      video.muted = true;
      try {
        await video.play();
        this.autoMuted.set(true);
      } catch {
        // Refused even without sound (iOS in low power mode, a browser set never to autoplay):
        // the viewer presses play, and hears it.
        video.muted = false;
      }
    }
    this.starting.set(false);
  }

  protected unmute(): void {
    const video = this.videoRef().nativeElement;
    video.muted = false;
    this.autoMuted.set(false);
  }

  protected toggleMute(): void {
    const video = this.videoRef().nativeElement;
    video.muted = !video.muted;
  }

  protected setVolume(event: Event): void {
    const video = this.videoRef().nativeElement;
    const value = Number((event.target as HTMLInputElement).value);
    video.volume = value;
    video.muted = value === 0;
  }

  protected setRate(value: number): void {
    this.videoRef().nativeElement.playbackRate = value;
    this.rate.set(value);
  }

  protected toggleFullscreen(): void {
    const container = this.containerRef().nativeElement;
    const video = this.videoRef().nativeElement as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else if (container.requestFullscreen) void container.requestFullscreen().catch(() => undefined);
    // iPhone has no Element.requestFullscreen: only the video itself.
    else video.webkitEnterFullscreen?.();
  }

  protected onKey(event: KeyboardEvent): void {
    if (
      (event.target as HTMLElement).tagName === 'SELECT' ||
      (event.target as HTMLElement).tagName === 'INPUT'
    )
      return;
    const action = actionForKey(event.key);
    if (!action) return;
    event.preventDefault();
    const video = this.videoRef().nativeElement;
    switch (action.kind) {
      case 'toggle':
        this.togglePlay();
        break;
      case 'seek':
        video.currentTime = Math.max(0, Math.min(this.duration(), video.currentTime + action.by));
        break;
      case 'seekTo':
        video.currentTime = action.fraction * this.duration();
        break;
      case 'volume':
        video.muted = false;
        video.volume = Math.max(0, Math.min(1, video.volume + action.by));
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
    }
    this.poke();
  }

  protected onSeekPointer(event: PointerEvent, start: boolean): void {
    if (start) {
      this.seeking = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    this.videoRef().nativeElement.currentTime = this.timeAt(event) ?? 0;
  }

  protected onSeekEnd(event: PointerEvent): void {
    if (!this.seeking) return;
    this.seeking = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  protected onTimelineMove(event: PointerEvent): void {
    const t = this.timeAt(event);
    if (t === null) return;
    const rect = this.timelineRef().nativeElement.getBoundingClientRect();
    this.hoverX.set(Math.max(80, Math.min(rect.width - 80, event.clientX - rect.left)));
    this.hoverTime.set(t);
    if (this.seeking) this.videoRef().nativeElement.currentTime = t;
  }

  private timeAt(event: PointerEvent): number | null {
    const d = this.duration();
    if (!(d > 0)) return null;
    const rect = this.timelineRef().nativeElement.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return fraction * d;
  }

  // ------------------------------------------------------------- media events

  protected onPlay(): void {
    this.playing.set(true);
    this.hideSoon();
  }

  protected onPause(): void {
    this.playing.set(false);
    this.controlsVisible.set(true);
  }

  private onTime(): void {
    const video = this.videoRef().nativeElement;
    this.currentTime.set(video.currentTime);
    if (Number.isFinite(video.duration)) this.duration.set(video.duration);
    const ranges = video.buffered;
    this.buffered.set(ranges.length ? ranges.end(ranges.length - 1) : 0);
  }

  protected onVolume(): void {
    const video = this.videoRef().nativeElement;
    this.volume.set(video.volume);
    this.muted.set(video.muted);
    if (!video.muted) this.autoMuted.set(false);
  }

  private poke(): void {
    this.controlsVisible.set(true);
    this.hideSoon();
  }

  protected hideSoon(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (!this.playing()) return;
    this.hideTimer = setTimeout(() => this.controlsVisible.set(false), CONTROLS_HIDE_MS);
  }
}

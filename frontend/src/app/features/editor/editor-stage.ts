import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import Hls, { Events } from 'hls.js/light';

import { Api, type RectDto, streamingPlayback } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { WidthDamper } from '../../shared/ui/mosaic/width-damper';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import {
  type EditSpec,
  MIN_CROP,
  type PlateKind,
  type PlateLayout,
  blurSigma,
  clamp,
  fitRect,
  outputGeometry,
  plateLayout,
  savedPlace,
  stopwatchText,
  textLines,
  timerAt,
} from './edit-model';
import { EditorStore } from './editor.store';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Target =
  { kind: 'crop' } | { kind: 'blur'; index: number } | { kind: 'timer' | 'caption'; index: number };

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** However little room is left, the picture stays this big: a low window scrolls instead. */
const MIN_STAGE_PX = 320;
const MIN_STAGE_SHARE = 0.45;
/** Between the card with the timeline and the window's lower edge. */
const BELOW_CARD_PX = 16;

/**
 * The picture being edited: the video's playback turned and flipped as the
 * edit says, the crop with the rest dimmed, blurred areas and plates, timers and captions where
 * they will be. Everything can be moved and resized with the pointer.
 */
@Component({
  selector: 'app-editor-stage',
  imports: [TranslocoPipe, SpinnerComponent],
  host: { class: 'block', '(window:resize)': 'measureWindow()' },
  styles: `
    .stage {
      position: relative;
      overflow: hidden;
      margin: 0 auto;
      background: #000;
      touch-action: none;
      user-select: none;
    }
    .frame {
      position: absolute;
    }
    video {
      position: absolute;
      left: 50%;
      top: 50%;
      object-fit: fill;
      pointer-events: none;
    }
    .crop {
      position: absolute;
      box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.62);
      outline: 2px solid rgb(255 255 255 / 0.9);
      cursor: move;
    }
    /* Thirds, while the crop is being set: only a guide, the result has none. */
    .crop.thirds {
      background-image:
        linear-gradient(to right, rgb(255 255 255 / 0.28) 1px, transparent 1px),
        linear-gradient(to bottom, rgb(255 255 255 / 0.28) 1px, transparent 1px);
      background-size: 33.333% 33.333%;
    }
    /* Only the crop tool moves it; otherwise it lets the areas under it be taken. */
    .crop.passive {
      pointer-events: none;
    }
    .crop.result {
      box-shadow: 0 0 0 9999px #000;
      outline: none;
      cursor: default;
    }
    .area {
      position: absolute;
      outline: 1.5px dashed rgb(255 255 255 / 0.55);
      cursor: move;
    }
    .area.on.box {
      background: #111;
    }
    .area.selected {
      outline: 2px solid var(--vs-accent);
    }
    /* The result's frame: timers and captions are laid out in its pixels, as the render does. */
    .out {
      position: absolute;
      pointer-events: none;
    }
    /* A plate exactly where and as big as the render draws it (plateLayout); its text is
       placed on its baseline, as drawtext places it. */
    .plate {
      position: absolute;
      background: rgb(17 17 17 / 0.55);
      cursor: move;
      pointer-events: auto;
    }
    /* The timer: solid black, no border, as the render draws it. */
    .plate.timer {
      background: #000;
    }
    /* What is picked is marked around the plate, not on it: the plate looks as it will. */
    .plate.selected {
      outline: 2px dashed var(--vs-accent);
      outline-offset: 3px;
    }
    .plate svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .plate text {
      font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace;
      font-weight: 600;
      fill: #f7f5f0;
      white-space: pre;
      text-rendering: geometricPrecision;
    }
    .plate.off {
      opacity: 0.35;
    }
    .handle {
      position: absolute;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      border: 2px solid #171717;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.45);
      z-index: 2;
      transition: transform 100ms ease-out;
    }
    .handle:hover {
      transform: scale(1.25);
    }
    /* Easier to take than to see, a finger above all. */
    .handle::after {
      content: '';
      position: absolute;
      inset: -9px;
      border-radius: 50%;
    }
    .result-hidden {
      display: none;
    }
  `,
  template: `
    <div #wrap class="w-full">
      <div
        #stage
        class="stage"
        [style.width.px]="size().w"
        [style.height.px]="size().h"
        (pointerdown)="onBackground($event)"
        data-testid="editor-stage"
      >
        <!-- The turned frame; for the result it is enlarged so that the crop fills the stage. -->
        <div
          #frameEl
          class="frame"
          [style.left.px]="frame().x"
          [style.top.px]="frame().y"
          [style.width.px]="frame().w"
          [style.height.px]="frame().h"
        >
          <video #video playsinline preload="auto" [style]="videoStyle()"></video>
          @if (spec(); as s) {
            @for (b of s.blurs; track $index; let area = $index) {
              <div
                class="area"
                [class.on]="inRange(b)"
                [class.blur]="b.mode === 'blur'"
                [class.box]="b.mode === 'box'"
                [class.selected]="isSelected('blur', area) && !result()"
                [class.result-hidden]="result() && !inRange(b)"
                [style.backdrop-filter]="
                  inRange(b) && b.mode === 'blur' ? blurFilter(b.rect) : null
                "
                [style.left.%]="b.rect.x * 100"
                [style.top.%]="b.rect.y * 100"
                [style.width.%]="b.rect.w * 100"
                [style.height.%]="b.rect.h * 100"
                [attr.data-testid]="'stage-blur-' + area"
                (pointerdown)="start({ kind: 'blur', index: area }, 'move', $event)"
              >
                @if (isSelected('blur', area) && !result()) {
                  @for (h of handles; track h) {
                    <span
                      class="handle"
                      [style]="handleStyle(h)"
                      (pointerdown)="start({ kind: 'blur', index: area }, h, $event)"
                    ></span>
                  }
                }
              </div>
            }
            <div
              class="crop"
              [class.result]="result()"
              [class.passive]="!cropTool()"
              [class.thirds]="cropTool() && !result()"
              [style.left.%]="shownCrop().x * 100"
              [style.top.%]="shownCrop().y * 100"
              [style.width.%]="shownCrop().w * 100"
              [style.height.%]="shownCrop().h * 100"
              data-testid="stage-crop"
              (pointerdown)="cropTool() && start({ kind: 'crop' }, 'move', $event)"
            >
              @if (cropTool() && !result()) {
                @for (h of handles; track h) {
                  <span
                    class="handle"
                    [style]="handleStyle(h)"
                    (pointerdown)="start({ kind: 'crop' }, h, $event)"
                  ></span>
                }
              }
            </div>
            <!-- Timers and captions: in the result's frame, at its pixels (as the render). -->
            @let o = out();
            <div
              class="out"
              [style.left.px]="o.x"
              [style.top.px]="o.y"
              [style.width.px]="o.w"
              [style.height.px]="o.h"
            >
              @for (t of s.timers; track $index) {
                @let text = timerAt(t, store.time());
                @if (text !== null || (isSelected('timer', $index) && !result())) {
                  @let shown = text ?? zero(t);
                  @let p = plate('timer', t, [shown]);
                  <div
                    class="plate timer"
                    [class.off]="text === null"
                    [class.selected]="isSelected('timer', $index) && !result()"
                    [style]="plateBox(p)"
                    [attr.data-testid]="'stage-timer-' + $index"
                    (pointerdown)="start({ kind: 'timer', index: $index }, 'move', $event)"
                  >
                    <svg [attr.viewBox]="viewBox(p)" preserveAspectRatio="none">
                      <text
                        [attr.x]="p.textX - p.x"
                        [attr.y]="p.baseline - p.y"
                        [attr.font-size]="p.font"
                        [textContent]="shown"
                      ></text>
                    </svg>
                    @if (isSelected('timer', $index) && !result()) {
                      <span
                        class="handle"
                        style="left: 100%; top: 100%; cursor: nwse-resize"
                        (pointerdown)="start({ kind: 'timer', index: $index }, 'se', $event)"
                      ></span>
                    }
                  </div>
                }
              }
              @for (c of s.captions; track $index) {
                @let on = store.time() >= c.start && store.time() <= c.end;
                @if (on || (isSelected('caption', $index) && !result())) {
                  @let lines = textLines(c.text || ('editor.captionPlaceholder' | transloco));
                  @let p = plate('caption', c, lines);
                  <div
                    class="plate"
                    [class.off]="!on"
                    [class.selected]="isSelected('caption', $index) && !result()"
                    [style]="plateBox(p)"
                    [attr.data-testid]="'stage-caption-' + $index"
                    (pointerdown)="start({ kind: 'caption', index: $index }, 'move', $event)"
                  >
                    <svg [attr.viewBox]="viewBox(p)" preserveAspectRatio="none">
                      @for (line of lines; track $index) {
                        <text
                          [attr.x]="p.textX - p.x"
                          [attr.y]="p.baseline - p.y + $index * p.lineStep"
                          [attr.font-size]="p.font"
                          [textContent]="line"
                        ></text>
                      }
                    </svg>
                    @if (isSelected('caption', $index) && !result()) {
                      <span
                        class="handle"
                        style="left: 100%; top: 100%; cursor: nwse-resize"
                        (pointerdown)="start({ kind: 'caption', index: $index }, 'se', $event)"
                      ></span>
                    }
                  </div>
                }
              }
            </div>
          }
        </div>
        @if (!ready()) {
          <div class="absolute inset-0 flex items-center justify-center text-white/70">
            @if (error(); as message) {
              <p class="px-4 text-center text-sm">{{ message }}</p>
            } @else {
              <app-spinner />
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class EditorStageComponent {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly wrapRef = viewChild.required<ElementRef<HTMLDivElement>>('wrap');
  private readonly stageRef = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  private readonly frameRef = viewChild.required<ElementRef<HTMLDivElement>>('frameEl');
  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  /** Shows the result only: no handles, what is cut away black. */
  readonly result = input(false);
  /** The crop is being edited (the "Frame" tools are open). */
  readonly cropTool = input(false);
  /** The card holding the picture and the timeline: all of it should fit in the window. */
  readonly card = input<HTMLElement | null>(null);

  protected readonly handles = HANDLES;
  protected readonly timerAt = timerAt;
  protected readonly textLines = textLines;
  protected readonly ready = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly wrapWidth = signal(0);
  /** Not `innerHeight`: that changes as a phone's address bar hides, in the middle of a scroll. */
  private readonly windowHeight = signal(document.documentElement.clientHeight);
  /** What has to fit in the window besides the picture: all above it, the timeline below it. */
  private readonly around = signal(0);
  private hls: Hls | null = null;
  /** Gone before the playback address came back: nothing may be attached after that. */
  private destroyed = false;
  private raf = 0;
  private audio: { ctx: AudioContext; gain: GainNode } | null = null;

  protected readonly spec = this.store.spec;
  protected readonly crop = computed<RectDto>(
    () => this.spec()?.crop ?? { x: 0, y: 0, w: 1, h: 1 },
  );
  /** The result's frame as the render makes it: the crop in whole pixels, the size it comes out at. */
  private readonly geometry = computed(() => {
    const s = this.spec();
    const src = this.store.source();
    return s && src ? outputGeometry(s, src) : null;
  });
  private readonly turned = computed(() => this.geometry()?.turned ?? { w: 16, h: 9 });
  /** That crop as fractions of the turned frame. */
  private readonly exactCrop = computed<RectDto>(() => {
    const t = this.turned();
    const c = this.geometry()?.crop;
    return c
      ? { x: c.x / t.w, y: c.y / t.h, w: c.w / t.w, h: c.h / t.h }
      : { x: 0, y: 0, w: 1, h: 1 };
  });
  /** The crop drawn: as dragged while editing, as rendered when only the result is shown. */
  protected readonly shownCrop = computed(() => (this.result() ? this.exactCrop() : this.crop()));
  /** The stage: the turned frame's shape, or the crop's when only the result is shown. */
  protected readonly size = computed(() => {
    const t = this.turned();
    const c = this.result() ? this.exactCrop() : { w: 1, h: 1 };
    const ratio = (c.w * t.w) / Math.max(1, c.h * t.h);
    const room = this.windowHeight();
    const maxH = Math.max(MIN_STAGE_PX, room * MIN_STAGE_SHARE, room - this.around());
    const w = Math.min(this.wrapWidth() || 640, maxH * ratio);
    return { w: Math.round(w), h: Math.round(w / ratio) };
  });
  /** Where the turned frame lies on the stage (px). */
  protected readonly frame = computed(() => {
    const { w, h } = this.size();
    if (!this.result()) return { x: 0, y: 0, w, h };
    const c = this.exactCrop();
    const fw = w / c.w;
    const fh = h / c.h;
    return { x: -c.x * fw, y: -c.y * fh, w: fw, h: fh };
  });
  /**
   * The result's frame on the stage: where it lies in the turned frame (px) and how many stage
   * pixels one of its own pixels takes (`kx`, `ky`).
   */
  protected readonly out = computed(() => {
    const f = this.frame();
    const c = this.exactCrop();
    const g = this.geometry();
    const w = c.w * f.w;
    const h = c.h * f.h;
    return {
      x: c.x * f.w,
      y: c.y * f.h,
      w,
      h,
      kx: g ? w / g.width : 1,
      ky: g ? h / g.height : 1,
      frame: { w: g?.width ?? 16, h: g?.height ?? 9 },
    };
  });
  protected readonly videoStyle = computed(() => {
    const s = this.spec();
    const { w, h } = this.frame();
    if (!s) return '';
    const quarter = s.rotate === 90 || s.rotate === 270;
    const vw = quarter ? h : w;
    const vh = quarter ? w : h;
    const fx = s.flipH ? -1 : 1;
    const fy = s.flipV ? -1 : 1;
    // Turn first, then mirror in the turned frame: the order of the render (render-plan.ts).
    return `width:${vw}px;height:${vh}px;transform:translate(-50%,-50%) scale(${fx},${fy}) rotate(${s.rotate}deg)`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    afterNextRender(() => {
      const wrap = this.wrapRef().nativeElement;
      // A narrower picture is a lower one, which can take the page's scrollbar away and bring it
      // back for good, the whole page shaking with it (the shelf's own trouble).
      const damper = new WidthDamper();
      const measureWidth = () => {
        const width = damper.next(wrap.clientWidth, performance.now());
        if (width !== null) this.wrapWidth.set(width);
      };
      const observer = new ResizeObserver(measureWidth);
      observer.observe(wrap);
      measureWidth();
      // More layers on the timeline, a render's progress above the card: less room for the picture.
      const roomObserver = new ResizeObserver(() => this.measureAround());
      const card = this.card();
      if (card) {
        roomObserver.observe(card);
        if (card.parentElement?.parentElement)
          roomObserver.observe(card.parentElement.parentElement);
      }
      this.measureAround();
      const video = this.videoRef().nativeElement;
      this.store.attachVideo(video);
      video.addEventListener('play', () => {
        this.store.playing.set(true);
        this.ensureAudio(video);
        this.tick();
      });
      video.addEventListener('pause', () => this.store.playing.set(false));
      video.addEventListener('seeked', () => this.store.time.set(video.currentTime));
      video.addEventListener('loadedmetadata', () => {
        this.ready.set(true);
        const volume = this.spec()?.volume ?? 1;
        video.volume = Math.min(1, volume);
        video.muted = volume === 0;
      });
      void this.load();
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        roomObserver.disconnect();
        cancelAnimationFrame(this.raf);
        this.hls?.destroy();
        this.store.attachVideo(null);
        void this.audio?.ctx.close().catch(() => undefined);
      });
    });
    // The sound as it will be: up to 200 % through a gain node, without one up to 100 %.
    effect(() => {
      const volume = this.spec()?.volume ?? 1;
      const video = this.store.video;
      if (this.audio) this.audio.gain.gain.value = volume;
      else if (video) video.volume = Math.min(1, volume);
      if (video) video.muted = volume === 0;
    });
  }

  private readonly destroyRef = inject(DestroyRef);

  protected measureWindow(): void {
    this.windowHeight.set(document.documentElement.clientHeight);
  }

  /** None of this depends on the picture's own height, so measuring it can't feed back. */
  private measureAround(): void {
    const box = this.card()?.getBoundingClientRect();
    if (!box) return;
    const stage = this.stageRef().nativeElement.getBoundingClientRect();
    const above = stage.top + window.scrollY;
    const below = box.bottom - stage.bottom;
    this.around.set(Math.ceil(above + below + BELOW_CARD_PX));
  }

  protected inRange(item: { start: number; end: number }): boolean {
    const t = this.store.time();
    return t >= item.start && t <= item.end;
  }

  protected isSelected(kind: 'blur' | 'timer' | 'caption', index: number): boolean {
    const sel = this.store.selected();
    return !!sel && sel.kind === kind && sel.index === index;
  }

  /** The blur as the render will make it, scaled from the frame's pixels to the stage's. */
  protected blurFilter(r: RectDto): string {
    const t = this.turned();
    const k = this.frame().w / Math.max(1, t.w);
    return `blur(${(blurSigma(r.w * t.w, r.h * t.h) * k).toFixed(1)}px)`;
  }

  protected zero(t: { start: number; end: number }): string {
    return stopwatchText(0, t.end - t.start >= 3600);
  }

  protected handleStyle(h: Handle): string {
    const x = h.includes('w') ? 0 : h.includes('e') ? 100 : 50;
    const y = h.includes('n') ? 0 : h.includes('s') ? 100 : 50;
    const cursor = {
      n: 'ns',
      s: 'ns',
      e: 'ew',
      w: 'ew',
      ne: 'nesw',
      sw: 'nesw',
      nw: 'nwse',
      se: 'nwse',
    }[h as Exclude<Handle, 'move'>];
    return `left:${x}%;top:${y}%;cursor:${cursor}-resize`;
  }

  /** A plate laid out as the render lays it out, in the result's pixels (plateLayout). */
  protected plate(
    kind: PlateKind,
    at: { x: number; y: number; size: number },
    lines: readonly string[],
  ): PlateLayout {
    return plateLayout(kind, savedPlace(at), lines, this.out().frame);
  }

  /** Those pixels on the stage. */
  protected plateBox(p: PlateLayout): string {
    const { kx, ky } = this.out();
    return `left:${p.x * kx}px;top:${p.y * ky}px;width:${p.w * kx}px;height:${p.h * ky}px`;
  }

  /** The plate's own pixels, for its text. */
  protected viewBox(p: PlateLayout): string {
    return `0 0 ${p.w} ${p.h}`;
  }

  /** What a plate shows now (its size and place depend on it). */
  private linesOf(
    kind: 'timer' | 'caption',
    item: EditSpec['timers'][number] | EditSpec['captions'][number],
  ): string[] {
    if (kind === 'timer') return [timerAt(item, this.store.time()) ?? this.zero(item)];
    const text = (item as EditSpec['captions'][number]).text;
    return textLines(text || this.t.translate('editor.captionPlaceholder'));
  }

  protected onBackground(e: PointerEvent): void {
    const target = e.target;
    if (target === this.stageRef().nativeElement || target === this.frameRef().nativeElement)
      this.store.selected.set(null);
  }

  // ------------------------------------------------------------------ dragging

  protected start(target: Target, handle: Handle, e: PointerEvent): void {
    if (this.result() || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const spec = this.spec();
    if (!spec) return;
    if (target.kind !== 'crop') this.store.selected.set({ kind: target.kind, index: target.index });
    const box = this.frameRef().nativeElement.getBoundingClientRect();
    const from = { x: e.clientX, y: e.clientY };
    const startSpec = structuredClone(spec);
    const drag = this.store.beginDrag();
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - from.x) / box.width;
      const dy = (ev.clientY - from.y) / box.height;
      this.store.drag((s) => this.apply(s, startSpec, target, handle, dx, dy));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.store.endDrag(drag);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** dx, dy: the pointer's travel as fractions of the turned frame. */
  private apply(
    s: EditSpec,
    from: EditSpec,
    target: Target,
    handle: Handle,
    dx: number,
    dy: number,
  ): void {
    if (target.kind === 'crop') {
      const base = from.crop ?? { x: 0, y: 0, w: 1, h: 1 };
      s.crop = this.resize(base, handle, dx, dy, MIN_CROP, this.store.cropRatio());
      return;
    }
    if (target.kind === 'blur') {
      s.blurs[target.index]!.rect = this.resize(
        from.blurs[target.index]!.rect,
        handle,
        dx,
        dy,
        0.02,
        null,
      );
      return;
    }
    // Timers and captions live in the output frame: the travel is measured against the crop.
    const c = this.exactCrop();
    const list = target.kind === 'timer' ? s.timers : s.captions;
    const was = (target.kind === 'timer' ? from.timers : from.captions)[target.index]!;
    const item = list[target.index]!;
    if (handle === 'move') {
      // Up to where the plate meets the frame's edge: the render keeps it inside.
      const frame = this.out().frame;
      const p = plateLayout(target.kind, savedPlace(was), this.linesOf(target.kind, was), frame);
      item.x = clamp(was.x + dx / c.w, 0, Math.max(0, (frame.w - p.w) / frame.w));
      item.y = clamp(was.y + dy / c.h, 0, Math.max(0, (frame.h - p.h) / frame.h));
    } else item.size = clamp(was.size + dy / c.h / 1.6, 0.02, 0.3);
  }

  private resize(
    r: RectDto,
    handle: Handle,
    dx: number,
    dy: number,
    min: number,
    ratio: number | null,
  ): RectDto {
    if (handle === 'move') return fitRect({ ...r, x: r.x + dx, y: r.y + dy }, min);
    let { x, y, w, h } = r;
    if (handle.includes('w')) {
      x = clamp(r.x + dx, 0, r.x + r.w - min);
      w = r.x + r.w - x;
    }
    if (handle.includes('e')) w = clamp(r.w + dx, min, 1 - r.x);
    if (handle.includes('n')) {
      y = clamp(r.y + dy, 0, r.y + r.h - min);
      h = r.y + r.h - y;
    }
    if (handle.includes('s')) h = clamp(r.h + dy, min, 1 - r.y);
    if (ratio) {
      // The crop keeps its shape: width follows height (or the other way for side handles).
      const t = this.turned();
      const k = (ratio * t.h) / t.w; // w = k * h in fractions
      if (handle === 'e' || handle === 'w') h = w / k;
      else w = h * k;
      if (w > 1) {
        w = 1;
        h = w / k;
      }
      if (h > 1) {
        h = 1;
        w = h * k;
      }
      if (handle.includes('w')) x = r.x + r.w - w;
      if (handle.includes('n')) y = r.y + r.h - h;
    }
    return fitRect({ x, y, w, h }, min);
  }

  // ------------------------------------------------------------------ playback

  private async load(): Promise<void> {
    const state = this.store.state();
    if (!state) return;
    try {
      // The video as it is now: every edit is made from it, also while one renders.
      const { playlistUrl } = await this.api.invoke(streamingPlayback, {
        id: state.videoId,
        source: true,
      });
      // Left the editor meanwhile: an Hls made now would load the video into a detached
      // <video> for good, nobody left to destroy it.
      if (this.destroyed) return;
      const video = this.videoRef().nativeElement;
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => {
            xhr.withCredentials = url.startsWith(location.origin);
          },
          maxBufferLength: 30,
          maxMaxBufferLength: 30,
        });
        hls.on(Events.ERROR, (_e, data) => {
          if (data.fatal) this.error.set(this.t.translate('player.error'));
        });
        hls.loadSource(playlistUrl);
        hls.attachMedia(video);
        this.hls = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = playlistUrl;
      else this.error.set(this.t.translate('player.unsupported'));
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('player.error'));
    }
  }

  private tick(): void {
    cancelAnimationFrame(this.raf);
    const video = this.store.video;
    if (!video || video.paused) return;
    this.store.follow(video.currentTime);
    this.raf = requestAnimationFrame(() => this.tick());
  }

  private ensureAudio(video: HTMLVideoElement): void {
    if (this.audio || typeof AudioContext === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      ctx.createMediaElementSource(video).connect(gain).connect(ctx.destination);
      gain.gain.value = this.spec()?.volume ?? 1;
      video.volume = 1;
      this.audio = { ctx, gain };
    } catch {
      this.audio = null;
    }
  }
}

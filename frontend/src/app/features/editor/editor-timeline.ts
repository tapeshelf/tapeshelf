import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideZoomIn, lucideZoomOut } from '@ng-icons/lucide';

import { type EditSpec, MIN_RANGE_SEC, TIMER_HOLD_SEC, clamp, formatTime } from './edit-model';
import { EDITOR_ICON_BUTTON } from './editor-panel';
import { EditorStore, type Selection } from './editor.store';

type Lane = 'blur' | 'timer' | 'caption';
type Grab = 'start' | 'end' | 'body';
interface Range {
  start: number;
  end: number;
}

/** One row of the timeline and what lies on it. */
interface Row {
  id: string;
  kind: Lane;
  label: string;
  color: string;
  /** Said with its label when the row holds that one item alone. */
  number?: number;
  entries: { item: Range; index: number }[];
}

const LANES: Record<Lane, { label: string; color: string }> = {
  blur: { label: 'editor.blurItem', color: '#6b5bd6' },
  timer: { label: 'editor.timerItem', color: '#e0702f' },
  caption: { label: 'editor.captionItem', color: '#2f8f6b' },
};

/** Steps of the ruler, seconds: the first that gives at most six of them. */
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
/** The closest view shows this many seconds across, but a long video stops at MAX_ZOOM. */
const CLOSEST_VIEW_SEC = 5;
const MAX_ZOOM = 64;
/** The zoom's buttons double it; a turn of the wheel takes this step. */
const WHEEL_STEP = 1.25;

/**
 * The timeline: the original's whole length; what is trimmed away dimmed, the
 * cuts hatched; the blurs and captions each on a layer of its own, the timers together on one. The
 * playhead, the trim's ends and every range can be dragged; a click seeks. The video's frames run
 * along the track, and it can be brought closer (the buttons, Ctrl+wheel, a pinch), when it scrolls
 * and follows the playhead.
 */
@Component({
  selector: 'app-editor-timeline',
  imports: [TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideZoomIn, lucideZoomOut })],
  host: { class: 'block select-none' },
  styles: `
    /* Room around the track for what stands out of it, or the view scrolls for no reason: the
       playhead and the grips, up to 16 px with their wider target under the pointer. */
    .scroller {
      margin: -12px -16px -8px;
      padding: 12px 16px 8px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
    }
    .film {
      position: absolute;
      inset: 0;
      display: flex;
      overflow: hidden;
      border-radius: 8px;
      pointer-events: none;
    }
    .film img {
      flex: 1 1 0;
      min-width: 0;
      height: 100%;
      object-fit: cover;
    }
    .track {
      position: relative;
      height: 52px;
      border-radius: 8px;
      background: var(--vs-surface-2);
      cursor: pointer;
    }
    /* Rounded with the track, whichever end it lies at. */
    .gone {
      position: absolute;
      top: 0;
      bottom: 0;
      background: rgb(0 0 0 / 0.5);
    }
    .gone.first {
      border-radius: 8px 0 0 8px;
    }
    .gone.last {
      border-radius: 0 8px 8px 0;
    }
    .cut {
      position: absolute;
      top: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        -45deg,
        rgb(220 60 40 / 0.55) 0 6px,
        rgb(220 60 40 / 0.2) 6px 12px
      );
      box-shadow: inset 0 0 0 1px rgb(220 60 40 / 0.8);
    }
    .cut.selected {
      box-shadow: inset 0 0 0 2px var(--vs-accent);
    }
    .grip {
      position: absolute;
      top: -4px;
      bottom: -4px;
      width: 14px;
      margin-left: -7px;
      border-radius: 5px;
      background: var(--vs-accent);
      border: 2px solid var(--vs-accent-edge);
      cursor: ew-resize;
      z-index: 2;
      transition: transform 100ms ease-out;
    }
    .grip:hover {
      transform: scaleX(1.2);
    }
    /* Its ribbing: this is the part to take. */
    .grip::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 2px;
      height: 16px;
      transform: translate(-50%, -50%);
      border-radius: 1px;
      background: rgb(255 255 255 / 0.85);
    }
    .grip::after {
      content: '';
      position: absolute;
      inset: -4px -6px;
    }
    .playhead {
      position: absolute;
      top: -9px;
      bottom: -9px;
      width: 2px;
      margin-left: -1px;
      background: var(--vs-ink);
      box-shadow: 0 0 0 1px var(--vs-surface);
      z-index: 3;
      pointer-events: none;
    }
    .playhead::before {
      content: '';
      position: absolute;
      top: -3px;
      left: -5px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--vs-ink);
      box-shadow: 0 0 0 2px var(--vs-surface);
    }
    .lanes {
      position: relative;
    }
    .lanes-head {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      margin-left: -1px;
      background: var(--vs-ink);
      box-shadow: 0 0 0 1px var(--vs-surface);
      z-index: 1;
      pointer-events: none;
    }
    .lane {
      position: relative;
      height: 28px;
      margin-top: 8px;
      border-radius: 6px;
      background: var(--vs-surface-2);
    }
    .bar {
      position: absolute;
      top: 2px;
      bottom: 2px;
      border-radius: 5px;
      cursor: grab;
      font-size: 12px;
      font-weight: 600;
      line-height: 24px;
      padding: 0 10px;
      overflow: hidden;
      white-space: nowrap;
      color: #fff;
    }
    .bar:active {
      cursor: grabbing;
    }
    /* The one picked stands out (a click on a bar picks it); above the others, as timers on the
       same moments lie on one another. */
    .lane .bar {
      opacity: 0.86;
    }
    .bar.selected {
      z-index: 1;
      opacity: 1;
      outline: 2px solid var(--vs-ink);
      outline-offset: 1px;
      box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.9);
    }
    .bar .end {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 10px;
      cursor: ew-resize;
    }
    /* The ends of the one picked show where to take them. */
    .bar.selected .end::after {
      content: '';
      position: absolute;
      top: 6px;
      bottom: 6px;
      left: 4px;
      width: 2px;
      border-radius: 1px;
      background: rgb(255 255 255 / 0.9);
    }
    .tail {
      position: absolute;
      top: 8px;
      bottom: 8px;
      border-radius: 0 4px 4px 0;
      opacity: 0.4;
      pointer-events: none;
    }
  `,
  template: `
    @if (spec(); as s) {
      <div #scroller class="scroller" data-testid="timeline-scroller">
        <div #inner [style.width.%]="shownZoom() * 100" data-testid="timeline-inner">
          <div class="relative mb-2 h-4 font-mono text-xs text-muted" aria-hidden="true">
            @for (tick of ticks(); track tick) {
              <span
                class="absolute top-0 whitespace-nowrap"
                [style.left.%]="pct(tick)"
                [style.transform]="
                  'translateX(' + (pct(tick) < 3 ? 0 : pct(tick) > 97 ? -100 : -50) + '%)'
                "
                >{{ format(tick) }}</span
              >
            }
          </div>
          <div #track class="track" data-testid="timeline" (pointerdown)="seekAt($event)">
            @if (frames().length) {
              <div class="film" aria-hidden="true" data-testid="timeline-film">
                @for (url of frames(); track url) {
                  <img [src]="url" alt="" draggable="false" />
                }
              </div>
            }
            <div class="gone first" style="left: 0" [style.width.%]="pct(s.trim.start)"></div>
            <div class="gone last" style="right: 0" [style.width.%]="100 - pct(s.trim.end)"></div>
            @for (c of s.cuts; track $index) {
              <div
                class="cut"
                [class.selected]="isSelected('cut', $index)"
                [style.left.%]="pct(c.start)"
                [style.width.%]="pct(c.end) - pct(c.start)"
                [attr.title]="'editor.cut' | transloco"
                (pointerdown)="grab('cut', $index, 'body', $event)"
              >
                @if (isSelected('cut', $index)) {
                  <span
                    class="grip"
                    style="left: 0"
                    (pointerdown)="grab('cut', $index, 'start', $event)"
                  ></span>
                  <span
                    class="grip"
                    style="left: 100%"
                    (pointerdown)="grab('cut', $index, 'end', $event)"
                  ></span>
                }
              </div>
            }
            <span
              class="grip"
              [style.left.%]="pct(s.trim.start)"
              data-testid="trim-start"
              [attr.aria-label]="'editor.trimStart' | transloco"
              (pointerdown)="grabTrim('start', $event)"
            ></span>
            <span
              class="grip"
              [style.left.%]="pct(s.trim.end)"
              data-testid="trim-end"
              [attr.aria-label]="'editor.trimEnd' | transloco"
              (pointerdown)="grabTrim('end', $event)"
            ></span>
            <span class="playhead" [style.left.%]="pct(store.time())"></span>
          </div>
          <!-- Each area and caption on a layer of its own, however many overlap in time; the timers on one. -->
          <div class="lanes">
            @for (row of rows(); track row.id) {
              <div class="lane" [attr.aria-label]="rowLabel(row)" [attr.data-testid]="row.id">
                @if (row.kind === 'timer') {
                  @for (entry of row.entries; track entry.index) {
                    <span
                      class="tail"
                      [style.background]="row.color"
                      [style.left.%]="pct(entry.item.end)"
                      [style.width.%]="
                        pct(Math.min(duration(), entry.item.end + hold)) - pct(entry.item.end)
                      "
                    ></span>
                  }
                }
                @for (entry of row.entries; track entry.index) {
                  <div
                    class="bar"
                    [class.selected]="isSelected(row.kind, entry.index)"
                    [style.background]="row.color"
                    [style.left.%]="pct(entry.item.start)"
                    [style.width.%]="pct(entry.item.end) - pct(entry.item.start)"
                    (pointerdown)="grab(row.kind, entry.index, 'body', $event)"
                  >
                    {{ row.label | transloco }} {{ entry.index + 1 }}
                    <span
                      class="end"
                      style="left: 0"
                      (pointerdown)="grab(row.kind, entry.index, 'start', $event)"
                    ></span>
                    <span
                      class="end"
                      style="right: 0"
                      (pointerdown)="grab(row.kind, entry.index, 'end', $event)"
                    ></span>
                  </div>
                }
              </div>
            }
            <!-- The playhead goes on through the layers: what is on at this moment shows at a glance. -->
            @if (hasLayers(s)) {
              <span class="lanes-head" [style.left.%]="pct(store.time())"></span>
            }
          </div>
        </div>
      </div>
      <div class="mt-4 flex items-start gap-3">
        <p class="min-w-0 flex-1 text-sm text-muted">{{ 'editor.keys' | transloco }}</p>
        <span class="flex shrink-0 gap-2">
          <button
            type="button"
            [class]="iconButton"
            [disabled]="shownZoom() <= 1"
            [attr.aria-label]="'editor.zoomOut' | transloco"
            [attr.title]="'editor.zoomOut' | transloco"
            data-testid="timeline-zoom-out"
            (click)="zoomBy(0.5)"
          >
            <ng-icon name="lucideZoomOut" size="20" />
          </button>
          <button
            type="button"
            [class]="iconButton"
            [disabled]="shownZoom() >= maxZoom()"
            [attr.aria-label]="'editor.zoomIn' | transloco"
            [attr.title]="'editor.zoomIn' | transloco"
            data-testid="timeline-zoom-in"
            (click)="zoomBy(2)"
          >
            <ng-icon name="lucideZoomIn" size="20" />
          </button>
        </span>
      </div>
    }
  `,
})
export class EditorTimelineComponent {
  protected readonly store = inject(EditorStore);
  private readonly t = inject(TranslocoService);
  private readonly trackRef = viewChild<ElementRef<HTMLDivElement>>('track');
  private readonly scrollerRef = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private readonly innerRef = viewChild<ElementRef<HTMLDivElement>>('inner');
  protected readonly iconButton = EDITOR_ICON_BUTTON;
  protected readonly frames = computed(() => this.store.state()?.frameUrls ?? []);
  private readonly zoom = signal(1);
  protected readonly maxZoom = computed(() =>
    Math.max(2, Math.min(MAX_ZOOM, this.duration() / CLOSEST_VIEW_SEC)),
  );
  /** A shorter new version of the video may bring the limit below the zoom set. */
  protected readonly shownZoom = computed(() => Math.min(this.zoom(), this.maxZoom()));
  /** A grip or the playhead is held: the view stays where the pointer is. */
  private holding = false;
  protected readonly spec = this.store.spec;
  protected readonly duration = this.store.duration;
  protected readonly hold = TIMER_HOLD_SEC;
  protected readonly Math = Math;
  /** A row for each blurred area and each caption; all the timers on one. */
  protected readonly rows = computed<Row[]>(() => {
    const s = this.spec();
    if (!s) return [];
    const entries = (items: readonly Range[]) => items.map((item, index) => ({ item, index }));
    const each = (kind: Lane, items: readonly Range[]): Row[] =>
      entries(items).map((entry) => ({
        ...LANES[kind],
        kind,
        id: `lane-${kind}-${entry.index}`,
        number: entry.index + 1,
        entries: [entry],
      }));
    const timers: Row[] = s.timers.length
      ? [{ ...LANES.timer, kind: 'timer', id: 'lane-timer', entries: entries(s.timers) }]
      : [];
    return [...each('blur', s.blurs), ...timers, ...each('caption', s.captions)];
  });

  private readonly tickStep = computed(() => {
    const d = this.duration();
    const seen = d / this.shownZoom();
    return TICK_STEPS.find((step) => seen / step <= 6) ?? 3600 * Math.ceil(seen / 6 / 3600);
  });

  /** Round moments along the ruler: 0:00, 0:10, 0:20… */
  protected readonly ticks = computed(() => {
    const d = this.duration();
    const step = this.tickStep();
    if (!d) return [];
    const count = Math.floor(d / step + 1e-6);
    return Array.from({ length: count + 1 }, (_, i) => i * step);
  });

  constructor() {
    // Not a template listener: stopping the page's own zoom takes a listener that is not passive.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        const scroller = this.scrollerRef()?.nativeElement;
        if (!scroller?.contains(e.target as Node)) return;
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, e.clientX);
      };
      document.addEventListener('wheel', onWheel, { passive: false });
      destroyRef.onDestroy(() => document.removeEventListener('wheel', onWheel));
    });
    // Up close the playhead stays in view: it plays on, or a key moved it.
    effect(() => {
      const t = this.store.time();
      untracked(() => this.keepInView(t));
    });
  }

  /** Closer or further by `factor`, keeping what is under `atX` (or the playhead) where it is. */
  protected zoomBy(factor: number, atX?: number): void {
    const scroller = this.scrollerRef()?.nativeElement;
    const inner = this.innerRef()?.nativeElement;
    const d = this.duration();
    if (!scroller || !inner || !d) return;
    const next = Math.max(1, Math.min(this.maxZoom(), this.shownZoom() * factor));
    const box = scroller.getBoundingClientRect();
    const was = inner.clientWidth;
    const pad = inner.getBoundingClientRect().left - box.left + scroller.scrollLeft;
    const x = atX === undefined ? null : atX - box.left + scroller.scrollLeft - pad;
    const share = x === null ? this.store.time() / d : x / Math.max(1, was);
    const onScreen = x === null ? scroller.clientWidth / 2 : (atX as number) - box.left;
    // Set here as well as in the template: the scroll below needs the new width now.
    inner.style.width = `${next * 100}%`;
    this.zoom.set(next);
    scroller.scrollLeft = share * inner.clientWidth + pad - onScreen;
  }

  private keepInView(t: number): void {
    const scroller = this.scrollerRef()?.nativeElement;
    const inner = this.innerRef()?.nativeElement;
    const d = this.duration();
    if (this.holding || !scroller || !inner || !d || this.shownZoom() <= 1) return;
    const x = (t / d) * inner.clientWidth;
    const left = scroller.scrollLeft;
    const width = scroller.clientWidth;
    if (x < left || x > left + width - 16) scroller.scrollLeft = x - width * 0.1;
  }

  protected pct(t: number): number {
    const d = this.duration();
    return d ? (clamp(t, 0, d) / d) * 100 : 0;
  }

  protected format(t: number): string {
    const text = formatTime(t, this.duration() >= 3600);
    return this.tickStep() < 1 ? text : text.replace(/\.\d$/, '');
  }

  protected rowLabel(row: Row): string {
    const label = this.t.translate(row.label);
    return row.number ? `${label} ${row.number}` : label;
  }

  protected itemsOf(s: EditSpec, lane: Lane): Range[] {
    return lane === 'blur' ? s.blurs : lane === 'timer' ? s.timers : s.captions;
  }

  protected hasLayers(s: EditSpec): boolean {
    return s.blurs.length + s.timers.length + s.captions.length > 0;
  }

  protected isSelected(kind: NonNullable<Selection>['kind'], index: number): boolean {
    const sel = this.store.selected();
    return !!sel && sel.kind === kind && 'index' in sel && sel.index === index;
  }

  private timeAt(clientX: number): number {
    const track = this.trackRef()?.nativeElement;
    if (!track) return 0;
    const box = track.getBoundingClientRect();
    return clamp((clientX - box.left) / box.width, 0, 1) * this.duration();
  }

  /** A click or a drag on the track moves the playhead. */
  protected seekAt(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.store.seek(this.timeAt(e.clientX));
    const move = (ev: PointerEvent) => this.store.seek(this.timeAt(ev.clientX));
    this.follow(move);
  }

  protected grabTrim(end: 'start' | 'end', e: PointerEvent): void {
    e.stopPropagation();
    const drag = this.store.beginDrag();
    const move = (ev: PointerEvent) => {
      const t = this.timeAt(ev.clientX);
      this.store.drag((s) => {
        if (end === 'start') s.trim.start = clamp(t, 0, s.trim.end - 1);
        else s.trim.end = clamp(t, s.trim.start + 1, this.duration());
      });
      this.store.seek(t);
    };
    this.follow(move, () => this.store.endDrag(drag));
  }

  protected grab(kind: 'cut' | Lane, index: number, part: Grab, e: PointerEvent): void {
    e.stopPropagation();
    this.store.selected.set({ kind, index });
    const startT = this.timeAt(e.clientX);
    const s0 = this.spec();
    if (!s0) return;
    const list0 = kind === 'cut' ? s0.cuts : this.itemsOf(s0, kind);
    const was = { ...list0[index]! };
    const drag = this.store.beginDrag();
    const move = (ev: PointerEvent) => {
      const d = this.timeAt(ev.clientX) - startT;
      const max = this.duration();
      this.store.drag((s) => {
        const item = (kind === 'cut' ? s.cuts : this.itemsOf(s, kind))[index]!;
        if (part === 'body') {
          const len = was.end - was.start;
          item.start = clamp(was.start + d, 0, max - len);
          item.end = item.start + len;
        } else if (part === 'start') item.start = clamp(was.start + d, 0, item.end - MIN_RANGE_SEC);
        else item.end = clamp(was.end + d, item.start + MIN_RANGE_SEC, max);
      });
      // A cut's edge is a frame to look at; an area, a timer or a caption is only a range.
      if (kind === 'cut') {
        const now = this.spec()!.cuts[index]!;
        this.store.seek(part === 'end' ? now.end : now.start);
      }
    };
    this.follow(move, () => this.store.endDrag(drag));
  }

  private follow(move: (e: PointerEvent) => void, done?: () => void): void {
    this.holding = true;
    const up = () => {
      this.holding = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      done?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}

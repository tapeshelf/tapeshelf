import { Component, type ElementRef, computed, inject, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { type EditSpec, TIMER_HOLD_SEC, clamp, formatTime } from './edit-model';
import { EditorStore, type Selection } from './editor.store';

type Lane = 'blur' | 'timer' | 'caption';
type Grab = 'start' | 'end' | 'body';

const MIN_RANGE = 0.1;
/** Steps of the ruler, seconds: the first that gives at most six of them. */
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/**
 * The timeline: the original's whole length; what is trimmed away dimmed, the
 * cuts hatched; the blurs, timers and captions on their lanes. The playhead, the trim's ends and
 * every range can be dragged; a click seeks.
 */
@Component({
  selector: 'app-editor-timeline',
  imports: [TranslocoPipe],
  host: { class: 'block select-none' },
  styles: `
    .track {
      position: relative;
      height: 44px;
      border-radius: 6px;
      background: var(--vs-surface-2);
      cursor: pointer;
    }
    .gone {
      position: absolute;
      top: 0;
      bottom: 0;
      background: rgb(0 0 0 / 0.55);
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
      outline: 1px solid rgb(220 60 40 / 0.8);
    }
    .cut.selected {
      outline: 2px solid var(--vs-accent);
    }
    .grip {
      position: absolute;
      top: -4px;
      bottom: -4px;
      width: 10px;
      margin-left: -5px;
      border-radius: 3px;
      background: var(--vs-accent);
      border: 2px solid var(--vs-line);
      cursor: ew-resize;
      z-index: 2;
    }
    .playhead {
      position: absolute;
      top: -8px;
      bottom: -8px;
      width: 2px;
      margin-left: -1px;
      background: var(--vs-ink);
      z-index: 3;
      pointer-events: none;
    }
    .playhead::before {
      content: '';
      position: absolute;
      top: -2px;
      left: -5px;
      border: 6px solid transparent;
      border-top-color: var(--vs-ink);
    }
    .lane {
      position: relative;
      height: 22px;
      margin-top: 6px;
      border-radius: 4px;
      background: var(--vs-surface-2);
    }
    .bar {
      position: absolute;
      top: 2px;
      bottom: 2px;
      border-radius: 3px;
      cursor: grab;
      font-size: 10px;
      line-height: 18px;
      padding: 0 6px;
      overflow: hidden;
      white-space: nowrap;
      color: #fff;
    }
    .bar.selected {
      outline: 2px solid var(--vs-ink);
    }
    .bar .end {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 8px;
      cursor: ew-resize;
    }
    .tail {
      position: absolute;
      top: 6px;
      bottom: 6px;
      border-radius: 0 3px 3px 0;
      opacity: 0.4;
      pointer-events: none;
    }
  `,
  template: `
    @if (spec(); as s) {
      <div class="relative mb-1 h-4 font-mono text-[11px] text-muted" aria-hidden="true">
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
        <div class="gone" style="left: 0" [style.width.%]="pct(s.trim.start)"></div>
        <div class="gone" style="right: 0" [style.width.%]="100 - pct(s.trim.end)"></div>
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
      @for (lane of lanes; track lane.kind) {
        @let items = itemsOf(s, lane.kind);
        @if (items.length) {
          <div class="lane" [attr.aria-label]="lane.label | transloco">
            @for (item of items; track $index) {
              @if (lane.kind === 'timer') {
                <span
                  class="tail"
                  [style.background]="lane.color"
                  [style.left.%]="pct(item.end)"
                  [style.width.%]="pct(Math.min(duration(), item.end + hold)) - pct(item.end)"
                ></span>
              }
              <div
                class="bar"
                [class.selected]="isSelected(lane.kind, $index)"
                [style.background]="lane.color"
                [style.left.%]="pct(item.start)"
                [style.width.%]="pct(item.end) - pct(item.start)"
                (pointerdown)="grab(lane.kind, $index, 'body', $event)"
              >
                {{ lane.label | transloco }} {{ $index + 1 }}
                <span
                  class="end"
                  style="left: 0"
                  (pointerdown)="grab(lane.kind, $index, 'start', $event)"
                ></span>
                <span
                  class="end"
                  style="right: 0"
                  (pointerdown)="grab(lane.kind, $index, 'end', $event)"
                ></span>
              </div>
            }
          </div>
        }
      }
    }
  `,
})
export class EditorTimelineComponent {
  protected readonly store = inject(EditorStore);
  private readonly trackRef = viewChild<ElementRef<HTMLDivElement>>('track');
  protected readonly spec = this.store.spec;
  protected readonly duration = this.store.duration;
  protected readonly hold = TIMER_HOLD_SEC;
  protected readonly Math = Math;
  protected readonly lanes: { kind: Lane; label: string; color: string }[] = [
    { kind: 'blur', label: 'editor.blurItem', color: '#6b5bd6' },
    { kind: 'timer', label: 'editor.timerItem', color: '#e0702f' },
    { kind: 'caption', label: 'editor.captionItem', color: '#2f8f6b' },
  ];

  private readonly tickStep = computed(() => {
    const d = this.duration();
    return TICK_STEPS.find((step) => d / step <= 6) ?? 3600 * Math.ceil(d / 6 / 3600);
  });

  /** Round moments along the ruler: 0:00, 0:10, 0:20… */
  protected readonly ticks = computed(() => {
    const d = this.duration();
    const step = this.tickStep();
    if (!d) return [];
    const count = Math.floor(d / step + 1e-6);
    return Array.from({ length: count + 1 }, (_, i) => i * step);
  });

  protected pct(t: number): number {
    const d = this.duration();
    return d ? (clamp(t, 0, d) / d) * 100 : 0;
  }

  protected format(t: number): string {
    const text = formatTime(t, this.duration() >= 3600);
    return this.tickStep() < 1 ? text : text.replace(/\.\d$/, '');
  }

  protected itemsOf(s: EditSpec, lane: Lane): { start: number; end: number }[] {
    return lane === 'blur' ? s.blurs : lane === 'timer' ? s.timers : s.captions;
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
        } else if (part === 'start') item.start = clamp(was.start + d, 0, item.end - MIN_RANGE);
        else item.end = clamp(was.end + d, item.start + MIN_RANGE, max);
      });
      const now = (kind === 'cut' ? this.spec()!.cuts : this.itemsOf(this.spec()!, kind))[index]!;
      this.store.seek(part === 'end' ? now.end : now.start);
    };
    this.follow(move, () => this.store.endDrag(drag));
  }

  private follow(move: (e: PointerEvent) => void, done?: () => void): void {
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      done?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}

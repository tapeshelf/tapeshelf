import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { type CollectionBucketDto } from '../../api';
import { monthLabel, monthMark } from './slot-groups';

/** A shelf this long gets the scroller: shorter ones are a few flicks of the wheel. */
export const SCROLLER_FROM = 100;
/** Marks closer than this share of the track leave their label to the one above. */
const LABEL_GAP = 0.06;

interface Mark {
  key: string;
  /** Where the bucket starts on the track, 0–1, by how many videos come before it. */
  at: number;
  label: string;
  short: string;
  /** Its label is written on the track (not crowded by the one above). */
  labelled: boolean;
}

/**
 * A quick scroller at the right edge of a long shelf, as in Google Photos: a thin track
 * whose marks are the months added (by date) or the first letters (by title), each as far down as
 * the videos before it. The thumb shows where the view is; hovering shows the marks; dragging shows
 * the one under the finger, and letting go jumps there (the shelf loads that far first).
 */
@Component({
  selector: 'app-shelf-scroller',
  imports: [TranslocoPipe],
  host: {
    class:
      'group fixed top-28 right-0 bottom-8 z-20 flex w-7 justify-center select-none sm:right-1 lg:right-2',
    'data-testid': 'shelf-scroller',
  },
  template: `
    <div
      role="navigation"
      [attr.aria-label]="'collection.scroller.label' | transloco"
      class="relative h-full w-full cursor-pointer touch-none"
      (pointerdown)="start($event)"
      (pointermove)="move($event)"
      (pointerup)="end($event)"
      (pointercancel)="cancel()"
    >
      <span
        class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
        aria-hidden="true"
      ></span>
      @for (m of marks(); track m.key) {
        <button
          type="button"
          class="absolute left-1/2 flex h-3 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center focus-visible:outline-none"
          [style.top.%]="m.at * 100"
          [attr.aria-label]="m.label"
          [attr.aria-current]="m.key === current() ? 'true' : null"
          (click)="jump.emit(m.key)"
        >
          <span class="h-px w-2 bg-faint" aria-hidden="true"></span>
          @if (m.labelled) {
            <span
              class="pointer-events-none absolute right-6 rounded-sm bg-canvas/90 px-1 font-mono text-[10px] whitespace-nowrap text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              [class.opacity-100]="dragging()"
              aria-hidden="true"
              >{{ m.short }}</span
            >
          }
        </button>
      }
      @if (thumbAt() !== null) {
        <span
          class="pointer-events-none absolute left-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/60 transition-[top] duration-150"
          [style.top.%]="thumbAt()! * 100"
          aria-hidden="true"
        ></span>
      }
      @if (dragging() && hover(); as h) {
        <span
          class="pointer-events-none absolute right-8 -translate-y-1/2 rounded-md border-2 border-line bg-surface px-2 py-1 text-sm font-semibold whitespace-nowrap text-text shadow-hard-sm"
          [style.top.%]="h.at * 100"
          data-testid="scroller-bubble"
          >{{ h.label }}</span
        >
      }
    </div>
  `,
})
export class ShelfScrollerComponent {
  readonly buckets = input.required<CollectionBucketDto[]>();
  readonly by = input.required<'month' | 'letter'>();
  /** The bucket at the top of the view. */
  readonly current = input<string | null>(null);
  readonly lang = input('en');
  /** The month or letter a key stands for (a visitor's keys carry their section: "PRIVATE:2026-10"). */
  readonly display = input<(key: string) => string>((key) => key);
  readonly jump = output<string>();

  private readonly track = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly dragging = signal(false);
  protected readonly hover = signal<Mark | null>(null);

  protected readonly marks = computed<Mark[]>(() => {
    const buckets = this.buckets();
    const total = buckets.reduce((n, b) => n + b.count, 0) || 1;
    let before = 0;
    let lastLabelled = -1;
    return buckets.map((b) => {
      const at = before / total;
      before += b.count;
      const labelled = lastLabelled < 0 || at - lastLabelled >= LABEL_GAP;
      if (labelled) lastLabelled = at;
      const month = this.by() === 'month';
      const raw = this.display()(b.key);
      return {
        key: b.key,
        at,
        label: month ? monthLabel(raw, this.lang()) : raw,
        short: month ? monthMark(raw, this.lang()) : raw,
        labelled,
      };
    });
  });

  protected readonly thumbAt = computed(() => {
    const key = this.current();
    const marks = this.marks();
    const i = marks.findIndex((m) => m.key === key);
    if (i < 0) return null;
    const next = marks[i + 1]?.at ?? 1;
    return (marks[i]!.at + next) / 2;
  });

  protected start(e: PointerEvent): void {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.dragging.set(true);
    this.move(e);
  }

  protected move(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.hover.set(this.markAt(e));
  }

  protected end(e: PointerEvent): void {
    if (!this.dragging()) return;
    const mark = this.markAt(e);
    this.cancel();
    if (mark) this.jump.emit(mark.key);
  }

  protected cancel(): void {
    this.dragging.set(false);
    this.hover.set(null);
  }

  /** The bucket under the pointer: the last one starting above it. */
  private markAt(e: PointerEvent): Mark | null {
    const box = this.track.nativeElement.getBoundingClientRect();
    const at = Math.min(1, Math.max(0, (e.clientY - box.top) / (box.height || 1)));
    const marks = this.marks();
    let found: Mark | null = marks[0] ?? null;
    for (const m of marks) if (m.at <= at) found = m;
    return found;
  }
}

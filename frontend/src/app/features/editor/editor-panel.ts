import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBan,
  lucideCaptions,
  lucideCrop,
  lucideCrosshair,
  lucideEyeOff,
  lucideFlipHorizontal2,
  lucideFlipVertical2,
  lucidePlus,
  lucideRotateCcw,
  lucideRotateCw,
  lucideScissors,
  lucideTimer,
  lucideTrash2,
  lucideVolume2,
  lucideVolumeX,
} from '@ng-icons/lucide';

import type { RectDto } from '../../api';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import {
  ASPECTS,
  CAPTION_MAX,
  DEFAULT_TEXT_SIZE,
  type EditSpec,
  MAX_ITEMS,
  MAX_VOLUME,
  TIMER_HOLD_SEC,
  centredCrop,
  clamp,
  formatTime,
  outputGeometry,
  parseTime,
  turnedSize,
} from './edit-model';
import { EditorStore } from './editor.store';

export type EditorTab = 'frame' | 'time' | 'blur' | 'timer' | 'caption' | 'sound';

/** A big square action: the editor's one kind of icon button, its name in a tooltip. */
export const EDITOR_ICON_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-line text-text ' +
  'transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40';

/** What is on or open, in one look that reads in both themes (the ink panel melts into a dark page). */
export const EDITOR_ON = `
  .on {
    background: var(--vs-inverse);
    color: var(--vs-on-inverse);
    border-color: var(--vs-inverse);
  }
  :host-context([data-theme='dark']) .on {
    background: var(--vs-text);
    color: var(--vs-canvas);
    border-color: var(--vs-text);
  }
`;

const TOOLS: { tab: EditorTab; icon: string }[] = [
  { tab: 'frame', icon: 'lucideCrop' },
  { tab: 'time', icon: 'lucideScissors' },
  { tab: 'blur', icon: 'lucideEyeOff' },
  { tab: 'timer', icon: 'lucideTimer' },
  { tab: 'caption', icon: 'lucideCaptions' },
  { tab: 'sound', icon: 'lucideVolume2' },
];

/**
 * The tools in one row over their panel: icons, the open one with its name, each
 * name in a tooltip. What a tool holds shows as a count on it, so nothing added is out of sight
 * while another tool is open.
 */
@Component({
  selector: 'app-editor-tools',
  imports: [TranslocoPipe, NgIcon],
  styles: EDITOR_ON,
  providers: [
    provideIcons({
      lucideCrop,
      lucideScissors,
      lucideEyeOff,
      lucideTimer,
      lucideCaptions,
      lucideVolume2,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div class="flex gap-1 rounded-xl border-2 border-line bg-surface p-1" role="tablist">
      @for (tool of tools; track tool.tab) {
        <button
          type="button"
          role="tab"
          class="relative flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors"
          [class]="
            tab() === tool.tab
              ? 'on flex-[2.6]'
              : 'flex-1 text-muted hover:bg-surface-2 hover:text-text'
          "
          [attr.aria-selected]="tab() === tool.tab"
          [attr.title]="'editor.tabs.' + tool.tab | transloco"
          [attr.data-testid]="'editor-tab-' + tool.tab"
          (click)="tab.set(tool.tab)"
        >
          <ng-icon [name]="tool.icon" size="20" class="shrink-0" />
          @if (tab() === tool.tab) {
            <span class="min-w-0 truncate">{{ 'editor.tabs.' + tool.tab | transloco }}</span>
          }
          @if (count(tool.tab); as n) {
            <span
              class="absolute -top-1 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-xs font-bold text-accent-fg"
              >{{ n }}</span
            >
          }
        </button>
      }
    </div>
  `,
})
export class EditorToolsComponent {
  private readonly store = inject(EditorStore);
  readonly tab = model<EditorTab>('frame');
  protected readonly tools = TOOLS;

  protected count(tab: EditorTab): number {
    const s = this.store.spec();
    if (!s) return 0;
    if (tab === 'time') return s.cuts.length;
    if (tab === 'blur') return s.blurs.length;
    if (tab === 'timer') return s.timers.length;
    if (tab === 'caption') return s.captions.length;
    return 0;
  }
}

/** A time field: `m:ss.t` typed in, or the playhead's moment taken with the button beside it. */
@Component({
  selector: 'app-time-field',
  imports: [FormsModule, TranslocoPipe, NgIcon, InputDirective],
  providers: [provideIcons({ lucideCrosshair })],
  template: `
    <span class="flex items-center gap-1">
      <input
        appInput="sm"
        class="w-[5.5rem] font-mono text-sm"
        [ngModel]="text()"
        (ngModelChange)="draft = $event"
        (blur)="commit()"
        (keydown.enter)="commit()"
        [attr.aria-label]="label()"
      />
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text"
        [attr.title]="'editor.takeNow' | transloco"
        [attr.aria-label]="'editor.takeNow' | transloco"
        (click)="picked.emit(store.time())"
      >
        <ng-icon name="lucideCrosshair" size="18" />
      </button>
    </span>
  `,
})
export class TimeFieldComponent {
  protected readonly store = inject(EditorStore);
  readonly value = input.required<number>();
  readonly label = input('');
  readonly picked = output<number>();
  protected draft: string | null = null;
  protected readonly text = computed(() => formatTime(this.value()));

  protected commit(): void {
    if (this.draft === null) return;
    const t = parseTime(this.draft);
    this.draft = null;
    if (t !== null) this.picked.emit(t);
  }
}

/** What the open tool does; the frame tool turns the crop handles on. */
@Component({
  selector: 'app-editor-panel',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    TranslocoPipe,
    NgIcon,
    ButtonDirective,
    InputDirective,
    TimeFieldComponent,
  ],
  providers: [
    provideIcons({
      lucideBan,
      lucideRotateCcw,
      lucideRotateCw,
      lucideFlipHorizontal2,
      lucideFlipVertical2,
      lucidePlus,
      lucideTrash2,
      lucideVolume2,
      lucideVolumeX,
    }),
  ],
  styles: EDITOR_ON,
  host: { class: 'block' },
  template: `
    <!-- An item's head: its name, what else it has, the way to remove it. -->
    <ng-template #head let-kind="kind" let-i="i" let-title="title" let-extra="extra">
      <div class="mb-2 flex items-center gap-2">
        <button
          type="button"
          class="min-w-0 truncate text-sm font-semibold hover:underline"
          (click)="kind !== 'cut' && select(kind, i)"
        >
          {{ title | transloco }} {{ i + 1 }}
        </button>
        <span class="ml-auto"></span>
        <ng-container *ngTemplateOutlet="extra" />
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-danger"
          [attr.aria-label]="'editor.remove' | transloco"
          [attr.title]="'editor.remove' | transloco"
          (click)="remove(kind, i)"
        >
          <ng-icon name="lucideTrash2" size="18" />
        </button>
      </div>
    </ng-template>
    <!-- From when to when. -->
    <ng-template #range let-kind="kind" let-i="i" let-item="item">
      <div class="flex flex-wrap items-center gap-2">
        <app-time-field [value]="item.start" (picked)="setRange(kind, i, 'start', $event)" />
        <span class="text-muted">—</span>
        <app-time-field [value]="item.end" (picked)="setRange(kind, i, 'end', $event)" />
      </div>
    </ng-template>

    @if (store.spec(); as s) {
      <div class="rounded-xl border-2 border-line bg-surface p-3">
        @switch (tab()) {
          @case ('frame') {
            <section class="flex flex-col gap-4">
              <div class="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  [class]="bigAction"
                  [attr.aria-label]="'editor.rotateLeft' | transloco"
                  [attr.title]="'editor.rotateLeft' | transloco"
                  (click)="rotate(-90)"
                  data-testid="rotate-left"
                >
                  <ng-icon name="lucideRotateCcw" size="24" />
                </button>
                <button
                  type="button"
                  [class]="bigAction"
                  [attr.aria-label]="'editor.rotateRight' | transloco"
                  [attr.title]="'editor.rotateRight' | transloco"
                  (click)="rotate(90)"
                  data-testid="rotate-right"
                >
                  <ng-icon name="lucideRotateCw" size="24" />
                </button>
                <button
                  type="button"
                  [class]="bigAction"
                  [class.on]="s.flipH"
                  [attr.aria-pressed]="s.flipH"
                  [attr.aria-label]="'editor.flipH' | transloco"
                  [attr.title]="'editor.flipH' | transloco"
                  (click)="store.change(flipH)"
                >
                  <ng-icon name="lucideFlipHorizontal2" size="24" />
                </button>
                <button
                  type="button"
                  [class]="bigAction"
                  [class.on]="s.flipV"
                  [attr.aria-pressed]="s.flipV"
                  [attr.aria-label]="'editor.flipV' | transloco"
                  [attr.title]="'editor.flipV' | transloco"
                  (click)="store.change(flipV)"
                >
                  <ng-icon name="lucideFlipVertical2" size="24" />
                </button>
              </div>
              <div>
                <p class="mb-2 text-sm font-semibold">{{ 'editor.crop' | transloco }}</p>
                <div class="grid grid-cols-6 gap-1.5">
                  @for (a of aspects; track a.key) {
                    <button
                      type="button"
                      class="flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border-2 text-sm transition-colors"
                      [class]="
                        aspectKey() === a.key && s.crop ? 'on' : 'border-border hover:border-line'
                      "
                      [attr.title]="a.key === 'free' ? ('editor.aspectFree' | transloco) : a.key"
                      [attr.data-testid]="'aspect-' + a.key"
                      (click)="setAspect(a.key, a.ratio)"
                    >
                      <!-- The shape it gives, drawn. -->
                      <span
                        class="block rounded-[2px] border-2 border-current"
                        [class.border-dashed]="!a.ratio"
                        [style.width.px]="shapeOf(a.ratio).w"
                        [style.height.px]="shapeOf(a.ratio).h"
                        aria-hidden="true"
                      ></span>
                      <span class="max-w-full truncate px-1 font-mono leading-none">{{
                        a.key === 'free' ? ('editor.aspectFree' | transloco) : a.key
                      }}</span>
                    </button>
                  }
                  <button
                    type="button"
                    class="flex h-14 min-w-0 items-center justify-center rounded-lg border-2 border-border text-muted transition-colors hover:border-line hover:text-text disabled:pointer-events-none disabled:opacity-40"
                    [disabled]="!s.crop"
                    [attr.title]="'editor.noCrop' | transloco"
                    [attr.aria-label]="'editor.noCrop' | transloco"
                    (click)="clearCrop()"
                  >
                    <ng-icon name="lucideBan" size="20" />
                  </button>
                </div>
                <p class="mt-3 text-sm text-muted">{{ 'editor.cropHint' | transloco }}</p>
              </div>
              <p class="font-mono text-sm text-muted" data-testid="result-size">
                {{ 'editor.resultSize' | transloco: { w: resultSize().w, h: resultSize().h } }}
              </p>
            </section>
          }
          @case ('time') {
            <section class="flex flex-col gap-4">
              <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
                <span class="text-muted">{{ 'editor.trimStart' | transloco }}</span>
                <app-time-field
                  [value]="s.trim.start"
                  [label]="'editor.trimStart' | transloco"
                  (picked)="setTrim('start', $event)"
                />
                <span class="text-muted">{{ 'editor.trimEnd' | transloco }}</span>
                <app-time-field
                  [value]="s.trim.end"
                  [label]="'editor.trimEnd' | transloco"
                  (picked)="setTrim('end', $event)"
                />
              </div>
              <div class="flex flex-col gap-2">
                <p class="text-sm font-semibold">{{ 'editor.cuts' | transloco }}</p>
                @for (c of s.cuts; track $index) {
                  <div
                    class="rounded-lg bg-surface-2 p-3"
                    [class.ring-2]="isSelected('cut', $index)"
                    [class.ring-accent]="isSelected('cut', $index)"
                  >
                    <ng-container
                      *ngTemplateOutlet="
                        head;
                        context: { kind: 'cut', i: $index, title: 'editor.cut', extra: null }
                      "
                    />
                    <ng-container
                      *ngTemplateOutlet="range; context: { kind: 'cut', i: $index, item: c }"
                    />
                  </div>
                } @empty {
                  <p class="text-sm text-muted">{{ 'editor.cutsHint' | transloco }}</p>
                }
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  class="w-full"
                  [disabled]="s.cuts.length >= 50"
                  data-testid="add-cut"
                  (click)="addCut()"
                >
                  <ng-icon name="lucidePlus" size="18" />{{ 'editor.addCut' | transloco }}
                </button>
              </div>
              <p class="font-mono text-sm text-muted">
                {{ 'editor.resultLength' | transloco: { length: format(store.resultDuration()) } }}
              </p>
            </section>
          }
          @case ('blur') {
            <section class="flex flex-col gap-2">
              <p class="mb-1 text-sm text-muted">{{ 'editor.blurHint' | transloco }}</p>
              @for (b of s.blurs; track $index; let area = $index) {
                <ng-template #modeSwitch>
                  <span class="flex shrink-0 gap-0.5 rounded-md bg-surface p-0.5">
                    @for (m of modes; track m) {
                      <button
                        type="button"
                        class="rounded px-2 py-1 text-sm"
                        [class]="b.mode === m ? 'on' : 'text-muted hover:text-text'"
                        (click)="setMode(area, m)"
                      >
                        {{ 'editor.mode.' + m | transloco }}
                      </button>
                    }
                  </span>
                </ng-template>
                <div
                  class="rounded-lg bg-surface-2 p-3"
                  [class.ring-2]="isSelected('blur', area)"
                  [class.ring-accent]="isSelected('blur', area)"
                  (focusin)="select('blur', area)"
                >
                  <ng-container
                    *ngTemplateOutlet="
                      head;
                      context: {
                        kind: 'blur',
                        i: area,
                        title: 'editor.blurItem',
                        extra: modeSwitch,
                      }
                    "
                  />
                  <ng-container
                    *ngTemplateOutlet="range; context: { kind: 'blur', i: area, item: b }"
                  />
                </div>
              }
              <button
                type="button"
                appButton
                variant="secondary"
                class="w-full"
                [disabled]="s.blurs.length >= max"
                data-testid="add-blur"
                (click)="addBlur()"
              >
                <ng-icon name="lucidePlus" size="18" />{{ 'editor.addBlur' | transloco }}
              </button>
            </section>
          }
          @case ('timer') {
            <section class="flex flex-col gap-2">
              <p class="mb-1 text-sm text-muted">
                {{ 'editor.timerHint' | transloco: { hold: hold } }}
              </p>
              @for (tm of s.timers; track $index) {
                <div
                  class="rounded-lg bg-surface-2 p-3"
                  [class.ring-2]="isSelected('timer', $index)"
                  [class.ring-accent]="isSelected('timer', $index)"
                  (focusin)="select('timer', $index)"
                >
                  <ng-container
                    *ngTemplateOutlet="
                      head;
                      context: { kind: 'timer', i: $index, title: 'editor.timerItem', extra: null }
                    "
                  />
                  <ng-container
                    *ngTemplateOutlet="range; context: { kind: 'timer', i: $index, item: tm }"
                  />
                </div>
              }
              <button
                type="button"
                appButton
                variant="secondary"
                class="w-full"
                [disabled]="s.timers.length >= max"
                data-testid="add-timer"
                (click)="addTimer()"
              >
                <ng-icon name="lucidePlus" size="18" />{{ 'editor.addTimer' | transloco }}
              </button>
            </section>
          }
          @case ('caption') {
            <section class="flex flex-col gap-2">
              <p class="mb-1 text-sm text-muted">{{ 'editor.captionHint' | transloco }}</p>
              @for (c of s.captions; track $index) {
                <div
                  class="rounded-lg bg-surface-2 p-3"
                  [class.ring-2]="isSelected('caption', $index)"
                  [class.ring-accent]="isSelected('caption', $index)"
                  (focusin)="select('caption', $index)"
                >
                  <ng-container
                    *ngTemplateOutlet="
                      head;
                      context: {
                        kind: 'caption',
                        i: $index,
                        title: 'editor.captionItem',
                        extra: null,
                      }
                    "
                  />
                  <textarea
                    appInput
                    rows="2"
                    class="mb-2"
                    [maxlength]="captionMax"
                    [ngModel]="c.text"
                    (focus)="typing = store.beginDrag()"
                    (blur)="store.endDrag(typing)"
                    (ngModelChange)="setText($index, $event)"
                    [placeholder]="'editor.captionPlaceholder' | transloco"
                    [attr.data-testid]="'caption-text-' + $index"
                  ></textarea>
                  <ng-container
                    *ngTemplateOutlet="range; context: { kind: 'caption', i: $index, item: c }"
                  />
                </div>
              }
              <button
                type="button"
                appButton
                variant="secondary"
                class="w-full"
                [disabled]="s.captions.length >= max"
                data-testid="add-caption"
                (click)="addCaption()"
              >
                <ng-icon name="lucidePlus" size="18" />{{ 'editor.addCaption' | transloco }}
              </button>
            </section>
          }
          @case ('sound') {
            <section class="flex flex-col gap-4">
              @if (!store.source()?.hasAudio) {
                <p class="text-sm text-muted">{{ 'editor.noAudio' | transloco }}</p>
              } @else {
                <label class="flex flex-col gap-2 text-sm">
                  <span class="flex justify-between font-semibold">
                    {{ 'editor.volume' | transloco }}
                    <b class="font-mono" data-testid="volume-value">{{ percent(s.volume) }}</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    [max]="maxVolume * 100"
                    step="5"
                    class="h-6 accent-[var(--vs-accent)]"
                    [ngModel]="s.volume * 100"
                    (ngModelChange)="setVolume($event / 100)"
                    data-testid="volume"
                  />
                </label>
                <div class="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    [class]="bigAction"
                    [class.on]="s.volume === 0"
                    [attr.aria-pressed]="s.volume === 0"
                    [attr.aria-label]="
                      (s.volume === 0 ? 'editor.unmute' : 'editor.mute') | transloco
                    "
                    [attr.title]="(s.volume === 0 ? 'editor.unmute' : 'editor.mute') | transloco"
                    (click)="setVolume(s.volume === 0 ? 1 : 0)"
                  >
                    <ng-icon
                      [name]="s.volume === 0 ? 'lucideVolumeX' : 'lucideVolume2'"
                      size="24"
                    />
                  </button>
                  <button
                    type="button"
                    [class]="bigAction"
                    [disabled]="s.volume === 1"
                    [attr.aria-label]="'editor.volumeReset' | transloco"
                    [attr.title]="'editor.volumeReset' | transloco"
                    (click)="setVolume(1)"
                  >
                    <ng-icon name="lucideRotateCcw" size="24" />
                  </button>
                </div>
                <label class="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [ngModel]="s.normalize"
                    (ngModelChange)="setNormalize($event)"
                    data-testid="normalize"
                  />
                  <span>
                    <span class="font-semibold">{{ 'editor.normalize' | transloco }}</span>
                    <span class="mt-0.5 block text-muted">{{
                      'editor.normalizeHint' | transloco
                    }}</span>
                  </span>
                </label>
              }
            </section>
          }
        }
      </div>
    }
  `,
})
export class EditorPanelComponent {
  protected readonly store = inject(EditorStore);
  readonly tab = model<EditorTab>('frame');
  /** A big action in a row of four: as wide as its place. */
  protected readonly bigAction = EDITOR_ICON_BUTTON.replace('w-11', 'w-full');
  protected readonly aspects = ASPECTS;
  protected readonly modes = ['blur', 'box'] as const;
  protected readonly max = MAX_ITEMS;
  /** The drag a caption's typing is, while its field has the focus. */
  protected typing = 0;
  protected readonly hold = TIMER_HOLD_SEC;
  protected readonly captionMax = CAPTION_MAX;
  protected readonly maxVolume = MAX_VOLUME;
  protected readonly aspectKey = signal('free');

  /** Width × height of the result in pixels, as the render makes it (fitted into 1920). */
  protected readonly resultSize = computed(() => {
    const s = this.store.spec();
    const src = this.store.source();
    if (!s || !src) return { w: 0, h: 0 };
    const g = outputGeometry(s, src);
    return { w: g.width, h: g.height };
  });

  constructor() {
    // Picking a range on the stage or the timeline opens its tab.
    effect(() => {
      const sel = this.store.selected();
      if (!sel || sel.kind === 'crop') return;
      this.tab.set(sel.kind === 'cut' ? 'time' : sel.kind);
    });
  }

  /** A mirror moves the crop and the areas with the picture, so they still cover the same things. */
  protected readonly flipH = (s: EditSpec) => {
    s.flipH = !s.flipH;
    const mirror = (r: RectDto): RectDto => ({ ...r, x: 1 - r.x - r.w });
    if (s.crop) s.crop = mirror(s.crop);
    for (const b of s.blurs) b.rect = mirror(b.rect);
  };
  protected readonly flipV = (s: EditSpec) => {
    s.flipV = !s.flipV;
    const mirror = (r: RectDto): RectDto => ({ ...r, y: 1 - r.y - r.h });
    if (s.crop) s.crop = mirror(s.crop);
    for (const b of s.blurs) b.rect = mirror(b.rect);
  };

  /** A little picture of a crop's shape; free is drawn as an open wide one. */
  protected shapeOf(ratio: number | null): { w: number; h: number } {
    const r = ratio ?? 4 / 3;
    return r >= 1 ? { w: 20, h: Math.round(20 / r) } : { w: Math.round(20 * r), h: 20 };
  }

  protected format(t: number): string {
    return formatTime(t);
  }

  protected percent(v: number): string {
    return `${Math.round(v * 100)}%`;
  }

  protected isSelected(kind: 'cut' | 'blur' | 'timer' | 'caption', index: number): boolean {
    const sel = this.store.selected();
    return !!sel && sel.kind === kind && sel.index === index;
  }

  protected select(kind: 'blur' | 'timer' | 'caption', index: number): void {
    this.store.selected.set({ kind, index });
  }

  /**
   * A quarter turn turns the crop and the areas with the picture: they cover the same things and
   * their sides swap (a fixed crop shape becomes free).
   */
  protected rotate(delta: 90 | -90): void {
    const turn = (r: RectDto): RectDto =>
      delta === 90
        ? { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w }
        : { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    this.aspectKey.set('free');
    this.store.cropRatio.set(null);
    this.store.change((s) => {
      s.rotate = ((((s.rotate + delta) % 360) + 360) % 360) as EditSpec['rotate'];
      if (s.crop) s.crop = turn(s.crop);
      for (const b of s.blurs) b.rect = turn(b.rect);
    });
  }

  protected setAspect(key: string, ratio: number | null): void {
    this.aspectKey.set(key);
    this.store.cropRatio.set(ratio);
    const src = this.store.source();
    if (!src) return;
    this.store.change((s) => {
      s.crop = ratio
        ? centredCrop(ratio, turnedSize(s.rotate, src))
        : (s.crop ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    });
  }

  protected clearCrop(): void {
    this.aspectKey.set('free');
    this.store.cropRatio.set(null);
    this.store.change((s) => void (s.crop = null));
  }

  protected setTrim(end: 'start' | 'end', t: number): void {
    this.store.trimTo(end, t);
  }

  protected setRange(
    kind: 'cut' | 'blur' | 'timer' | 'caption',
    index: number,
    end: 'start' | 'end',
    t: number,
  ): void {
    const d = this.store.duration();
    this.store.change((s) => {
      const item = (
        kind === 'cut'
          ? s.cuts
          : kind === 'blur'
            ? s.blurs
            : kind === 'timer'
              ? s.timers
              : s.captions
      )[index]!;
      if (end === 'start') item.start = clamp(t, 0, item.end - 0.1);
      else item.end = clamp(t, item.start + 0.1, d);
    });
  }

  protected remove(kind: 'cut' | 'blur' | 'timer' | 'caption', index: number): void {
    this.store.selected.set(null);
    this.store.change((s) => {
      (kind === 'cut'
        ? s.cuts
        : kind === 'blur'
          ? s.blurs
          : kind === 'timer'
            ? s.timers
            : s.captions
      ).splice(index, 1);
    });
  }

  /** A range from the playhead, `len` long, kept inside the video. */
  private rangeHere(len: number): { start: number; end: number } {
    const d = this.store.duration();
    const start = clamp(this.store.time(), 0, Math.max(0, d - 0.5));
    return { start, end: Math.min(d, start + len) };
  }

  protected addCut(): void {
    const r = this.rangeHere(2);
    this.store.change((s) => void s.cuts.push(r));
    this.store.selected.set({ kind: 'cut', index: this.store.spec()!.cuts.length - 1 });
  }

  protected addBlur(): void {
    const r = this.rangeHere(3);
    this.store.change(
      (s) => void s.blurs.push({ ...r, rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, mode: 'blur' }),
    );
    this.store.selected.set({ kind: 'blur', index: this.store.spec()!.blurs.length - 1 });
  }

  protected addTimer(): void {
    const r = this.rangeHere(10);
    this.store.change(
      (s) => void s.timers.push({ ...r, x: 0.04, y: 0.04, size: DEFAULT_TEXT_SIZE }),
    );
    this.store.selected.set({ kind: 'timer', index: this.store.spec()!.timers.length - 1 });
  }

  protected addCaption(): void {
    const r = this.rangeHere(4);
    this.store.change(
      (s) => void s.captions.push({ ...r, text: '', x: 0.06, y: 0.78, size: 0.05 }),
    );
    this.store.selected.set({ kind: 'caption', index: this.store.spec()!.captions.length - 1 });
  }

  protected setMode(index: number, mode: 'blur' | 'box'): void {
    this.store.change((s) => void (s.blurs[index]!.mode = mode));
  }

  protected setText(index: number, text: string): void {
    this.store.drag((s) => void (s.captions[index]!.text = text));
  }

  protected setVolume(v: number): void {
    this.store.change((s) => void (s.volume = Math.round(clamp(v, 0, MAX_VOLUME) * 100) / 100));
  }

  protected setNormalize(on: boolean): void {
    this.store.change((s) => void (s.normalize = on));
  }
}

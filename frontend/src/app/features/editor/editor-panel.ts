import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCrosshair,
  lucideFlipHorizontal2,
  lucideFlipVertical2,
  lucidePlus,
  lucideRotateCcw,
  lucideRotateCw,
  lucideTrash2,
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

/** A time field: `m:ss.t` typed in, or the playhead's moment taken with the button beside it. */
@Component({
  selector: 'app-time-field',
  imports: [FormsModule, TranslocoPipe, NgIcon, InputDirective],
  providers: [provideIcons({ lucideCrosshair })],
  template: `
    <span class="flex items-center gap-1">
      <input
        appInput="sm"
        class="w-[5.5rem] font-mono text-xs"
        [ngModel]="text()"
        (ngModelChange)="draft = $event"
        (blur)="commit()"
        (keydown.enter)="commit()"
        [attr.aria-label]="label()"
      />
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        [attr.title]="'editor.takeNow' | transloco"
        [attr.aria-label]="'editor.takeNow' | transloco"
        (click)="picked.emit(store.time())"
      >
        <ng-icon name="lucideCrosshair" size="14" />
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

/** The tools, one tab at a time; the frame tab turns the crop handles on. */
@Component({
  selector: 'app-editor-panel',
  imports: [
    FormsModule,
    TranslocoPipe,
    NgIcon,
    ButtonDirective,
    InputDirective,
    TimeFieldComponent,
  ],
  providers: [
    provideIcons({
      lucideRotateCcw,
      lucideRotateCw,
      lucideFlipHorizontal2,
      lucideFlipVertical2,
      lucidePlus,
      lucideTrash2,
    }),
  ],
  host: { class: 'block' },
  template: `
    @if (store.spec(); as s) {
      <div class="mb-3 grid grid-cols-3 gap-1" role="tablist">
        @for (tb of tabs; track tb) {
          <button
            type="button"
            role="tab"
            class="rounded-full px-2 py-1.5 text-center text-xs font-semibold transition-colors"
            [class]="
              tab() === tb
                ? 'bg-inverse text-on-inverse'
                : 'bg-surface-2 text-muted hover:text-text'
            "
            [attr.aria-selected]="tab() === tb"
            [attr.data-testid]="'editor-tab-' + tb"
            (click)="tab.set(tb)"
          >
            {{ 'editor.tabs.' + tb | transloco }}
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('frame') {
          <section class="flex flex-col gap-4">
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                (click)="rotate(-90)"
                data-testid="rotate-left"
              >
                <ng-icon name="lucideRotateCcw" size="14" />{{ 'editor.rotateLeft' | transloco }}
              </button>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                (click)="rotate(90)"
                data-testid="rotate-right"
              >
                <ng-icon name="lucideRotateCw" size="14" />{{ 'editor.rotateRight' | transloco }}
              </button>
              <button
                type="button"
                appButton
                size="sm"
                [variant]="s.flipH ? 'primary' : 'secondary'"
                [attr.aria-pressed]="s.flipH"
                (click)="store.change(flipH)"
              >
                <ng-icon name="lucideFlipHorizontal2" size="14" />{{ 'editor.flipH' | transloco }}
              </button>
              <button
                type="button"
                appButton
                size="sm"
                [variant]="s.flipV ? 'primary' : 'secondary'"
                [attr.aria-pressed]="s.flipV"
                (click)="store.change(flipV)"
              >
                <ng-icon name="lucideFlipVertical2" size="14" />{{ 'editor.flipV' | transloco }}
              </button>
            </div>
            <div>
              <p class="mb-2 text-xs font-semibold text-muted uppercase">
                {{ 'editor.crop' | transloco }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                @for (a of aspects; track a.key) {
                  <button
                    type="button"
                    class="rounded-md border-2 px-2.5 py-1 font-mono text-xs"
                    [class]="
                      aspectKey() === a.key
                        ? 'border-line bg-inverse text-on-inverse'
                        : 'border-border hover:border-line'
                    "
                    [attr.data-testid]="'aspect-' + a.key"
                    (click)="setAspect(a.key, a.ratio)"
                  >
                    {{ a.key === 'free' ? ('editor.aspectFree' | transloco) : a.key }}
                  </button>
                }
                <button
                  type="button"
                  class="rounded-md px-2.5 py-1 text-xs text-muted hover:text-text"
                  [disabled]="!s.crop"
                  (click)="clearCrop()"
                >
                  {{ 'editor.noCrop' | transloco }}
                </button>
              </div>
              <p class="mt-2 text-xs text-muted">{{ 'editor.cropHint' | transloco }}</p>
            </div>
            <p class="font-mono text-xs text-muted" data-testid="result-size">
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
            <div>
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs font-semibold text-muted uppercase">
                  {{ 'editor.cuts' | transloco }}
                </p>
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="sm"
                  [disabled]="s.cuts.length >= 50"
                  data-testid="add-cut"
                  (click)="addCut()"
                >
                  <ng-icon name="lucidePlus" size="14" />{{ 'editor.addCut' | transloco }}
                </button>
              </div>
              @for (c of s.cuts; track $index) {
                <div
                  class="mb-1.5 flex flex-wrap items-center gap-2 rounded-md p-1.5"
                  [class.bg-surface-2]="isSelected('cut', $index)"
                >
                  <app-time-field
                    [value]="c.start"
                    (picked)="setRange('cut', $index, 'start', $event)"
                  />
                  <span class="text-muted">—</span>
                  <app-time-field
                    [value]="c.end"
                    (picked)="setRange('cut', $index, 'end', $event)"
                  />
                  <button
                    type="button"
                    class="ml-auto text-muted hover:text-danger"
                    (click)="remove('cut', $index)"
                    [attr.aria-label]="'editor.remove' | transloco"
                  >
                    <ng-icon name="lucideTrash2" size="14" />
                  </button>
                </div>
              } @empty {
                <p class="text-xs text-muted">{{ 'editor.cutsHint' | transloco }}</p>
              }
            </div>
            <p class="font-mono text-xs text-muted">
              {{ 'editor.resultLength' | transloco: { length: format(store.resultDuration()) } }}
            </p>
          </section>
        }
        @case ('blur') {
          <section class="flex flex-col gap-2">
            <div class="flex flex-col items-start gap-2">
              <p class="text-xs text-muted">{{ 'editor.blurHint' | transloco }}</p>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="s.blurs.length >= max"
                data-testid="add-blur"
                (click)="addBlur()"
              >
                <ng-icon name="lucidePlus" size="14" />{{ 'editor.addBlur' | transloco }}
              </button>
            </div>
            @for (b of s.blurs; track $index) {
              <div
                class="rounded-md border border-border p-2"
                [class.border-line]="isSelected('blur', $index)"
                (focusin)="select('blur', $index)"
              >
                <div class="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="text-sm font-semibold hover:underline"
                    (click)="select('blur', $index)"
                  >
                    {{ 'editor.blurItem' | transloco }} {{ $index + 1 }}
                  </button>
                  <span class="ml-auto flex gap-1">
                    @for (m of modes; track m) {
                      <button
                        type="button"
                        class="rounded px-2 py-0.5 text-xs"
                        [class]="
                          b.mode === m ? 'bg-inverse text-on-inverse' : 'bg-surface-2 text-muted'
                        "
                        (click)="setMode($index, m)"
                      >
                        {{ 'editor.mode.' + m | transloco }}
                      </button>
                    }
                  </span>
                  <button
                    type="button"
                    class="text-muted hover:text-danger"
                    (click)="remove('blur', $index)"
                    [attr.aria-label]="'editor.remove' | transloco"
                  >
                    <ng-icon name="lucideTrash2" size="14" />
                  </button>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <app-time-field
                    [value]="b.start"
                    (picked)="setRange('blur', $index, 'start', $event)"
                  />
                  <span class="text-muted">—</span>
                  <app-time-field
                    [value]="b.end"
                    (picked)="setRange('blur', $index, 'end', $event)"
                  />
                </div>
              </div>
            }
          </section>
        }
        @case ('timer') {
          <section class="flex flex-col gap-2">
            <div class="flex flex-col items-start gap-2">
              <p class="text-xs text-muted">{{ 'editor.timerHint' | transloco: { hold: hold } }}</p>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="s.timers.length >= max"
                data-testid="add-timer"
                (click)="addTimer()"
              >
                <ng-icon name="lucidePlus" size="14" />{{ 'editor.addTimer' | transloco }}
              </button>
            </div>
            @for (tm of s.timers; track $index) {
              <div
                class="rounded-md border border-border p-2"
                [class.border-line]="isSelected('timer', $index)"
                (focusin)="select('timer', $index)"
              >
                <div class="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="text-sm font-semibold hover:underline"
                    (click)="select('timer', $index)"
                  >
                    {{ 'editor.timerItem' | transloco }} {{ $index + 1 }}
                  </button>
                  <button
                    type="button"
                    class="ml-auto text-muted hover:text-danger"
                    (click)="remove('timer', $index)"
                    [attr.aria-label]="'editor.remove' | transloco"
                  >
                    <ng-icon name="lucideTrash2" size="14" />
                  </button>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <app-time-field
                    [value]="tm.start"
                    (picked)="setRange('timer', $index, 'start', $event)"
                  />
                  <span class="text-muted">—</span>
                  <app-time-field
                    [value]="tm.end"
                    (picked)="setRange('timer', $index, 'end', $event)"
                  />
                </div>
              </div>
            }
          </section>
        }
        @case ('caption') {
          <section class="flex flex-col gap-2">
            <div class="flex flex-col items-start gap-2">
              <p class="text-xs text-muted">{{ 'editor.captionHint' | transloco }}</p>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="s.captions.length >= max"
                data-testid="add-caption"
                (click)="addCaption()"
              >
                <ng-icon name="lucidePlus" size="14" />{{ 'editor.addCaption' | transloco }}
              </button>
            </div>
            @for (c of s.captions; track $index) {
              <div
                class="rounded-md border border-border p-2"
                [class.border-line]="isSelected('caption', $index)"
                (focusin)="select('caption', $index)"
              >
                <div class="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="text-sm font-semibold hover:underline"
                    (click)="select('caption', $index)"
                  >
                    {{ 'editor.captionItem' | transloco }} {{ $index + 1 }}
                  </button>
                  <button
                    type="button"
                    class="ml-auto text-muted hover:text-danger"
                    (click)="remove('caption', $index)"
                    [attr.aria-label]="'editor.remove' | transloco"
                  >
                    <ng-icon name="lucideTrash2" size="14" />
                  </button>
                </div>
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
                <div class="flex flex-wrap items-center gap-2">
                  <app-time-field
                    [value]="c.start"
                    (picked)="setRange('caption', $index, 'start', $event)"
                  />
                  <span class="text-muted">—</span>
                  <app-time-field
                    [value]="c.end"
                    (picked)="setRange('caption', $index, 'end', $event)"
                  />
                </div>
              </div>
            }
          </section>
        }
        @case ('sound') {
          <section class="flex flex-col gap-4">
            @if (!store.source()?.hasAudio) {
              <p class="text-sm text-muted">{{ 'editor.noAudio' | transloco }}</p>
            } @else {
              <label class="flex flex-col gap-2 text-sm">
                <span class="flex justify-between">
                  {{ 'editor.volume' | transloco }}
                  <b class="font-mono" data-testid="volume-value">{{ percent(s.volume) }}</b>
                </span>
                <input
                  type="range"
                  min="0"
                  [max]="maxVolume * 100"
                  step="5"
                  class="accent-[var(--vs-accent)]"
                  [ngModel]="s.volume * 100"
                  (ngModelChange)="setVolume($event / 100)"
                  data-testid="volume"
                />
              </label>
              <div class="flex gap-2">
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="sm"
                  (click)="setVolume(s.volume === 0 ? 1 : 0)"
                >
                  {{ (s.volume === 0 ? 'editor.unmute' : 'editor.mute') | transloco }}
                </button>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="s.volume === 1"
                  (click)="setVolume(1)"
                >
                  {{ 'editor.volumeReset' | transloco }}
                </button>
              </div>
              <label class="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  class="mt-0.5"
                  [ngModel]="s.normalize"
                  (ngModelChange)="setNormalize($event)"
                  data-testid="normalize"
                />
                <span>
                  {{ 'editor.normalize' | transloco }}
                  <span class="block text-xs text-muted">{{
                    'editor.normalizeHint' | transloco
                  }}</span>
                </span>
              </label>
            }
          </section>
        }
      }
    }
  `,
})
export class EditorPanelComponent {
  protected readonly store = inject(EditorStore);
  readonly tab = model<EditorTab>('frame');
  protected readonly tabs: EditorTab[] = ['frame', 'time', 'blur', 'timer', 'caption', 'sound'];
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
    const d = this.store.duration();
    this.store.change((s) => {
      if (end === 'start') s.trim.start = clamp(t, 0, s.trim.end - 1);
      else s.trim.end = clamp(t, s.trim.start + 1, d);
    });
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

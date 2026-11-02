import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type OfferOptionsDto, type OfferVideoDto, exchangeOptions } from '../../api';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { toApiError } from '../../core/api/api-error';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { Lightbox } from '../../shared/ui/lightbox/lightbox';
import { previewItems } from '../deals/deal-gallery';
import { BylinePipe } from '../../shared/pipes/byline.pipe';

export interface OfferDraft {
  /** Videos the other side gives me. */
  theirs: string[];
  /** Videos I give. */
  mine: string[];
  message: string;
}

/** Two-column counter-offer constructor: what I get, what I give, N ↔ M. */
@Component({
  selector: 'app-offer-builder',
  imports: [
    BylinePipe,
    TranslocoPipe,
    FormsModule,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
    ThumbScrubComponent,
    DurationPipe,
  ],
  template: `
    @if (options(); as o) {
      <div class="grid gap-4 md:grid-cols-2">
        @for (side of sides; track side) {
          <section class="rounded-xl border-2 border-line bg-surface p-3 shadow-hard-sm">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold whitespace-nowrap">
                {{
                  (side === 'theirs' ? 'exchange.builder.youGet' : 'exchange.builder.youGive')
                    | transloco
                }}
                <span class="text-muted">{{ (side === 'theirs' ? theirs() : mine()).length }}</span>
              </h3>
              <input
                appInput="sm"
                type="search"
                class="w-40"
                [ngModel]="side === 'theirs' ? filterTheirs() : filterMine()"
                (ngModelChange)="
                  side === 'theirs' ? filterTheirs.set($event) : filterMine.set($event)
                "
                [placeholder]="'exchange.builder.search' | transloco"
                [attr.aria-label]="'exchange.builder.search' | transloco"
              />
            </div>
            <!-- That shelf's categories: a long collection is picked by its own order. -->
            @if (categoriesOf(side).length) {
              <div
                class="mb-2 flex flex-wrap gap-1"
                role="group"
                [attr.data-testid]="'categories-' + side"
              >
                <button
                  type="button"
                  class="max-w-full truncate rounded-full px-2.5 py-0.5 text-xs"
                  [class]="
                    categoryOf(side)() === null
                      ? 'bg-inverse text-on-inverse'
                      : 'bg-surface-2 text-muted'
                  "
                  [attr.aria-pressed]="categoryOf(side)() === null"
                  (click)="categoryOf(side).set(null)"
                >
                  {{ 'exchange.builder.all' | transloco }}
                </button>
                @for (c of categoriesOf(side); track c.id) {
                  <button
                    type="button"
                    class="rounded-full px-2.5 py-0.5 text-xs"
                    [class]="
                      categoryOf(side)() === c.id
                        ? 'bg-inverse text-on-inverse'
                        : 'bg-surface-2 text-muted'
                    "
                    [attr.aria-pressed]="categoryOf(side)() === c.id"
                    (click)="categoryOf(side).set(c.id)"
                  >
                    {{ c.name }}
                  </button>
                }
              </div>
            }
            @if (listOf(side).length === 0) {
              <p class="py-6 text-center text-xs text-muted">
                {{ 'exchange.builder.nothing' | transloco }}
              </p>
            } @else {
              <div
                class="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
                role="group"
              >
                @for (v of listOf(side); track v.id) {
                  <div class="relative">
                    <button
                      type="button"
                      class="w-full overflow-hidden rounded-lg border-2 text-left transition-colors"
                      [class]="
                        has(side, v.id) ? 'border-accent' : 'border-transparent hover:border-line'
                      "
                      [attr.aria-pressed]="has(side, v.id)"
                      [attr.aria-label]="v.title"
                      (click)="toggle(side, v.id)"
                    >
                      <div class="relative aspect-video bg-surface-2">
                        <app-thumb-scrub
                          [thumbnailUrl]="v.thumbnailUrl"
                          [frameUrls]="v.frameUrls"
                          [alt]="''"
                          [restricted]="side === 'theirs' && sensitive.blurs(v)"
                        />
                        @if (v.durationSec) {
                          <span
                            class="pointer-events-none absolute right-1 bottom-1 rounded bg-scrim px-1 font-mono text-[10px] text-white"
                            >{{ v.durationSec | duration }}</span
                          >
                        }
                      </div>
                      <span class="flex items-center gap-1 px-1.5 py-1 text-xs">
                        <span class="min-w-0 flex-1 truncate">{{ v.title }}</span>
                        @if (v.received) {
                          <!-- not the holder's own: from another author -->
                          <span
                            class="shrink-0 rounded-sm bg-surface-2 px-1 text-[10px] text-muted"
                            [attr.title]="
                              'exchange.builder.receivedHint'
                                | transloco
                                  : {
                                      name: (v.author | byline) || ('common.anonymous' | transloco),
                                    }
                            "
                            data-testid="received-badge"
                            >{{ 'exchange.builder.received' | transloco }}</span
                          >
                        }
                      </span>
                    </button>
                    @if (v.contactSheetUrl && !(side === 'theirs' && sensitive.blurs(v))) {
                      <!-- The frame-by-frame sheet, as anyone who sees the video page sees it. -->
                      <button
                        type="button"
                        class="absolute top-1 left-1 rounded-full bg-scrim px-2 py-0.5 text-[10px] font-medium text-white hover:bg-black/80"
                        [attr.aria-label]="
                          'exchange.builder.preview' | transloco: { title: v.title }
                        "
                        data-testid="offer-preview"
                        (click)="preview(v)"
                      >
                        {{ 'exchange.builder.previewShort' | transloco }}
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          appInput
          rows="2"
          class="ts-optional sm:flex-1"
          maxlength="1000"
          [(ngModel)]="message"
          [placeholder]="'exchange.messagePlaceholder' | transloco"
          [attr.aria-label]="'exchange.messagePlaceholder' | transloco"
        ></textarea>
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted" data-testid="offer-summary"
            >{{ theirs().length }} ↔ {{ mine().length }}</span
          >
          <button type="button" appButton variant="ghost" (click)="offerCancel.emit()">
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            type="button"
            appButton
            [disabled]="theirs().length === 0 || mine().length === 0"
            data-testid="send-offer"
            (click)="offerSubmit.emit({ theirs: theirs(), mine: mine(), message })"
          >
            {{ 'exchange.builder.send' | transloco }}
          </button>
        </div>
      </div>
    } @else if (error()) {
      <p class="text-sm text-danger">{{ error() }}</p>
    } @else {
      <div class="flex justify-center py-6 text-muted"><app-spinner /></div>
    }
  `,
})
export class OfferBuilderComponent {
  protected readonly sensitive = inject(SensitiveContentService);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);

  readonly requestId = input.required<string>();
  /** Preselected videos (the current offer), by side. */
  readonly initialTheirs = input<string[]>([]);
  readonly initialMine = input<string[]>([]);
  readonly offerSubmit = output<OfferDraft>();
  readonly offerCancel = output<void>();

  protected readonly sides = ['theirs', 'mine'] as const;
  protected readonly options = signal<OfferOptionsDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly theirs = signal<string[]>([]);
  protected readonly mine = signal<string[]>([]);
  protected readonly filterTheirs = signal('');
  protected readonly filterMine = signal('');
  protected readonly categoryTheirs = signal<string | null>(null);
  protected readonly categoryMine = signal<string | null>(null);
  private readonly lightbox = inject(Lightbox);
  protected message = '';

  private readonly filtered = computed(() => {
    const o = this.options();
    const f = (list: OfferVideoDto[], q: string, category: string | null) => {
      const needle = q.trim().toLowerCase();
      return list.filter(
        (v) =>
          (!needle || v.title.toLowerCase().includes(needle)) &&
          (category === null || v.categoryId === category),
      );
    };
    return {
      theirs: o ? f(o.theirs, this.filterTheirs(), this.categoryTheirs()) : [],
      mine: o ? f(o.mine, this.filterMine(), this.categoryMine()) : [],
    };
  });

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load(): Promise<void> {
    try {
      const o = await this.api.invoke(exchangeOptions, { id: this.requestId() });
      this.options.set(o);
      const theirsIds = new Set(o.theirs.map((v) => v.id));
      const mineIds = new Set(o.mine.map((v) => v.id));
      this.theirs.set(this.initialTheirs().filter((id) => theirsIds.has(id)));
      this.mine.set(this.initialMine().filter((id) => mineIds.has(id)));
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected listOf(side: 'theirs' | 'mine'): OfferVideoDto[] {
    return this.filtered()[side];
  }

  protected categoriesOf(side: 'theirs' | 'mine') {
    const o = this.options();
    return (side === 'theirs' ? o?.theirCategories : o?.myCategories) ?? [];
  }

  protected categoryOf(side: 'theirs' | 'mine') {
    return side === 'theirs' ? this.categoryTheirs : this.categoryMine;
  }

  /** The frame preview full screen, as everywhere. */
  protected preview(v: OfferVideoDto): void {
    void this.lightbox.open(previewItems([v]));
  }

  protected has(side: 'theirs' | 'mine', id: string): boolean {
    return (side === 'theirs' ? this.theirs() : this.mine()).includes(id);
  }

  protected toggle(side: 'theirs' | 'mine', id: string): void {
    const sig = side === 'theirs' ? this.theirs : this.mine;
    sig.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }
}

/** The contact sheet of a video in the offer builder, full size. */

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type OfferableDto, exchangeOfferable } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';

export interface OfferPickData {
  holderUsername: string;
  /** Already picked. */
  picked: string[];
  /** How many may be offered (the request's limit minus what is asked for). */
  max: number;
}

/**
 * "I offer in return…" while requesting: my videos the holder does not have yet,
 * by category or title; the holder then sees both sides and may accept the exchange at once.
 */
@Component({
  selector: 'app-offer-pick-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
    ThumbScrubComponent,
    DurationPipe,
  ],
  template: `
    <div
      class="flex max-h-[90dvh] w-[min(760px,calc(100vw-2rem))] flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4 shadow-hard"
      role="dialog"
      [attr.aria-label]="'exchange.offerPick.title' | transloco"
      data-testid="offer-pick"
    >
      <div>
        <h2 class="text-base font-semibold">{{ 'exchange.offerPick.title' | transloco }}</h2>
        <p class="mt-1 text-sm text-muted">{{ 'exchange.offerPick.lead' | transloco }}</p>
      </div>
      @if (options(); as o) {
        <div class="flex flex-wrap items-center gap-2">
          <input
            appInput="sm"
            type="search"
            class="w-44"
            [ngModel]="filter()"
            (ngModelChange)="filter.set($event)"
            [placeholder]="'exchange.builder.search' | transloco"
            [attr.aria-label]="'exchange.builder.search' | transloco"
          />
          @if (o.myCategories.length) {
            <button
              type="button"
              class="max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold"
              [class]="
                category() === null ? 'bg-inverse text-on-inverse' : 'bg-surface-2 text-muted'
              "
              (click)="category.set(null)"
            >
              {{ 'exchange.builder.all' | transloco }}
            </button>
            @for (c of o.myCategories; track c.id) {
              <button
                type="button"
                class="rounded-full px-2.5 py-1 text-xs font-semibold"
                [class]="
                  category() === c.id ? 'bg-inverse text-on-inverse' : 'bg-surface-2 text-muted'
                "
                (click)="category.set(c.id)"
              >
                {{ c.name }}
              </button>
            }
          }
        </div>
        @if (o.mine.length === 0) {
          <p class="py-6 text-center text-sm text-muted">
            {{ 'exchange.offerPick.nothing' | transloco }}
          </p>
        } @else {
          <div class="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4" role="group">
            @for (v of list(); track v.id) {
              <button
                type="button"
                class="overflow-hidden rounded-lg border-2 text-left transition-colors"
                [class]="has(v.id) ? 'border-accent' : 'border-transparent hover:border-line'"
                [attr.aria-pressed]="has(v.id)"
                [attr.aria-label]="v.title"
                [disabled]="!has(v.id) && picked().length >= data.max"
                (click)="toggle(v.id)"
              >
                <div class="relative aspect-video bg-surface-2">
                  <app-thumb-scrub
                    [thumbnailUrl]="v.thumbnailUrl"
                    [frameUrls]="v.frameUrls"
                    [alt]="''"
                  />
                  @if (v.durationSec) {
                    <span
                      class="pointer-events-none absolute right-1 bottom-1 rounded bg-scrim px-1 font-mono text-[10px] text-white"
                      >{{ v.durationSec | duration }}</span
                    >
                  }
                </div>
                <span class="block truncate px-1.5 py-1 text-xs">{{ v.title }}</span>
              </button>
            }
          </div>
        }
      } @else if (error(); as message) {
        <p class="text-sm text-danger">{{ message }}</p>
      } @else {
        <div class="flex justify-center py-6 text-muted"><app-spinner /></div>
      }
      <div class="flex items-center justify-end gap-2">
        <span class="mr-auto text-sm text-muted" data-testid="offer-pick-count">{{
          'exchange.offerPick.count' | transloco: { count: picked().length }
        }}</span>
        <button type="button" appButton variant="ghost" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="button" appButton data-testid="offer-pick-done" (click)="ref.close(picked())">
          {{ 'exchange.offerPick.done' | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class OfferPickDialog {
  protected readonly ref = inject<DialogRef<string[]>>(DialogRef);
  protected readonly data = inject<OfferPickData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  protected readonly options = signal<OfferableDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly picked = signal<string[]>(this.data.picked);
  protected readonly filter = signal('');
  protected readonly category = signal<string | null>(null);
  protected readonly list = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const category = this.category();
    return (this.options()?.mine ?? []).filter(
      (v) =>
        (!needle || v.title.toLowerCase().includes(needle)) &&
        (category === null || v.categoryId === category),
    );
  });

  constructor() {
    void this.load();
  }

  protected has(id: string): boolean {
    return this.picked().includes(id);
  }

  protected toggle(id: string): void {
    this.picked.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  private async load(): Promise<void> {
    try {
      const o = await this.api.invoke(exchangeOfferable, { username: this.data.holderUsername });
      const ids = new Set(o.mine.map((v) => v.id));
      this.picked.update((list) => list.filter((id) => ids.has(id)));
      this.options.set(o);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

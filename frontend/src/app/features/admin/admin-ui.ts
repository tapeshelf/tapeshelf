import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe, type TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import { toApiError } from '../../core/api/api-error';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';

/** Table look shared by every admin list: ink frame, mono headers, quiet row rules. */
export const TABLE_WRAP = 'overflow-x-auto rounded-lg border-2 border-line bg-surface';
export const TABLE = 'w-full min-w-[640px] border-collapse text-left text-sm';
export const TH = 'label-mono border-b-2 border-line bg-shelf/60 px-3 py-2 font-normal text-ink';
export const TD = 'border-b border-line/10 px-3 py-2.5 align-middle';
/** The narrow first column with the row's box. */
export const TD_BOX = 'border-b border-line/10 w-10 px-3 py-2.5 align-middle';
export const PAGE = 30;
/** The most rows the API gives in one answer. */
const MOST = 100;

/**
 * How an admin table brings its rows: anew for new filters (the first page), the next page
 * as the end of the table comes near, or the rows on screen again after an action on them.
 */
export type RowsMode = 'fresh' | 'more' | 'again';

export interface Rows<T> {
  items: T[];
  total: number;
}

/**
 * The rows for `mode`; `again` brings back as many as were on screen, in answers of up to 100. The
 * rest of the answer (sums, counters) is the last one's.
 */
export async function fetchRows<T extends { id: string }, P extends Rows<T>>(
  mode: RowsMode,
  loaded: readonly T[],
  fetch: (offset: number, limit: number) => Promise<P>,
  size = PAGE,
): Promise<P> {
  if (mode === 'more') {
    const page = await fetch(loaded.length, size);
    const seen = new Set(loaded.map((r) => r.id));
    return { ...page, items: [...loaded, ...page.items.filter((r) => !seen.has(r.id))] };
  }
  const want = mode === 'again' ? Math.max(size, loaded.length) : size;
  const items: T[] = [];
  for (;;) {
    const page = await fetch(items.length, Math.min(MOST, want - items.length));
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= Math.min(want, page.total))
      return { ...page, items };
  }
}

/** The backend's localized message, or the generic one. */
export function apiMessage(e: unknown, t: TranslocoService): string {
  return toApiError(e).message || t.translate('errors.unknown');
}

export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'accent';

const TONES: Record<Tone, string> = {
  ok: 'bg-success/15 text-success',
  warn: 'bg-warning/15 text-warning',
  bad: 'bg-danger/15 text-danger',
  muted: 'bg-surface-3 text-muted',
  accent: 'bg-accent text-accent-fg',
};

/** Small mono status chip. */
@Component({
  selector: 'app-admin-badge',
  host: { class: 'inline-flex' },
  template: `<span class="label-mono rounded-sm px-1.5 py-0.5 whitespace-nowrap" [class]="classes()"
    ><ng-content
  /></span>`,
})
export class AdminBadgeComponent {
  readonly tone = input<Tone>('muted');
  protected readonly classes = computed(() => TONES[this.tone()]);
}

/** Status → tone for the chips (users, videos, reports, requests). */
export function toneOf(status: string): Tone {
  switch (status) {
    case 'ACTIVE':
    case 'READY':
    case 'RESOLVED':
    case 'ACCEPTED':
      return 'ok';
    case 'OPEN':
    case 'QUEUED':
    case 'PROCESSING':
      return 'warn';
    case 'BANNED':
    case 'FAILED':
    case 'DELETED':
    case 'BLOCKED':
      return 'bad';
    default:
      return 'muted';
  }
}

/** Under an admin table: "1–60 of 125", and the next rows as its end comes near. */
@Component({
  selector: 'app-admin-more',
  imports: [TranslocoPipe, AutoMoreComponent],
  template: `
    @if (total() > 0) {
      <div class="mt-3 flex justify-end font-mono text-xs text-muted">
        {{ 'admin.pager' | transloco: { from: 1, to: count(), total: total() } }}
      </div>
    }
    <app-auto-more [more]="count() < total()" [count]="count()" [load]="load()" />
  `,
})
export class AdminMoreComponent {
  readonly total = input.required<number>();
  readonly count = input.required<number>();
  readonly load = input.required<() => Promise<unknown>>();
}

/**
 * Above a table whose rows can be ticked: how many are and what can be done with
 * them, or, while none is, how to tick them. Its height does not change, so the table stays put.
 */
@Component({
  selector: 'app-admin-selection-bar',
  imports: [TranslocoPipe, NgIcon],
  providers: [provideIcons({ lucideX })],
  template: `
    <div
      class="mb-3 flex min-h-12 flex-wrap items-center gap-2 rounded-lg border-2 px-3 py-1.5"
      [class]="count() ? 'border-line bg-shelf' : 'border-dashed border-line/25'"
      data-testid="selection-bar"
    >
      @if (count()) {
        <span class="label-mono mr-1" data-testid="selection-count">{{
          'admin.bulk.selected' | transloco: { count: count() }
        }}</span>
        <ng-content />
        <button
          type="button"
          class="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-text"
          [attr.aria-label]="'admin.bulk.clear' | transloco"
          [title]="'admin.bulk.clear' | transloco"
          (click)="clear.emit()"
        >
          <ng-icon name="lucideX" size="16" />
        </button>
      } @else {
        <span class="text-xs text-muted">{{ 'admin.bulk.hint' | transloco }}</span>
      }
    </div>
  `,
})
export class AdminSelectionBarComponent {
  readonly count = input.required<number>();
  readonly clear = output<void>();
}

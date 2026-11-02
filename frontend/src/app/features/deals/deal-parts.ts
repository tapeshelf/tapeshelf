import { Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideHandshake, lucideShieldCheck, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';


/**
 * "A fair exchange": what happens to one's video and why nobody can take without giving.
 * Shown wherever a deal starts or goes on; `guest` adds the three days and "no account needed".
 */
@Component({
  selector: 'app-fair-exchange',
  imports: [NgIcon, TranslocoPipe],
  providers: [provideIcons({ lucideShieldCheck, lucideEye, lucideHandshake, lucideTrash2 })],
  template: `
    <section
      [class]="bare() ? '' : 'rounded-xl border-2 border-line bg-surface p-5'"
      data-testid="fair-exchange"
    >
      @if (!bare()) {
        <h2 class="font-display text-2xl leading-tight font-bold tracking-tight">
          {{ 'deals.fair.title' | transloco }}
        </h2>
      }
      <p class="text-sm text-muted" [class.mt-1]="!bare()">{{ 'deals.fair.lead' | transloco }}</p>
      <ul class="mt-4 flex flex-col gap-3 text-sm">
        @for (p of points; track p.key) {
          <li class="flex gap-3">
            <ng-icon [name]="p.icon" size="18" class="mt-0.5 shrink-0 text-accent-text" />
            <span>{{ 'deals.fair.' + p.key | transloco }}</span>
          </li>
        }
      </ul>
      @if (guest()) {
        <p class="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm">
          {{ 'deals.fair.guest' | transloco }}
        </p>
      }
    </section>
  `,
})
export class FairExchangeComponent {
  readonly guest = input(false);
  /** Inside another box: no frame, no title of its own. */
  readonly bare = input(false);
  protected readonly points = [
    { key: 'kept', icon: 'lucideShieldCheck' },
    { key: 'seen', icon: 'lucideEye' },
    { key: 'both', icon: 'lucideHandshake' },
    { key: 'deleted', icon: 'lucideTrash2' },
  ];
}

/**
 * What someone looks for and what not to offer them: always shown in an exchange with them.
 * Quiet: one faint frame, the two side by side where there is room, one under the other in
 * a narrow column.
 */
@Component({
  selector: 'app-exchange-prefs',
  imports: [TranslocoPipe],
  template: `
    @if (wants() || avoid()) {
      <dl
        class="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-6 gap-y-3 rounded-lg border border-border px-4 py-3 text-sm"
        data-testid="exchange-prefs"
      >
        @if (wants(); as text) {
          <div class="min-w-0">
            <dt class="label-mono text-muted">{{ 'deals.prefs.wants' | transloco }}</dt>
            <dd class="mt-1 break-words whitespace-pre-line text-text/85">{{ text }}</dd>
          </div>
        }
        @if (avoid(); as text) {
          <div class="min-w-0">
            <dt class="label-mono text-muted">{{ 'deals.prefs.avoid' | transloco }}</dt>
            <dd class="mt-1 break-words whitespace-pre-line text-text/85">{{ text }}</dd>
          </div>
        }
      </dl>
    }
  `,
})
export class ExchangePrefsComponent {
  readonly wants = input<string | null | undefined>(null);
  readonly avoid = input<string | null | undefined>(null);
}


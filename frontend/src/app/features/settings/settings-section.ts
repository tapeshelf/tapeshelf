import { Component, input } from '@angular/core';

/**
 * One block of a settings page: what it is and why on the left, the controls on
 * the right, a rule across the whole width between blocks — the page fills its column like the
 * rest of the site, while fields keep a readable width.
 */
@Component({
  selector: 'app-settings-section',
  host: {
    class:
      'grid gap-x-12 gap-y-4 border-t-2 border-line/10 py-8 first:border-t-0 first:pt-1 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]',
  },
  template: `
    <div>
      <h2 class="font-display text-lg leading-tight font-bold tracking-tight">{{ title() }}</h2>
      @if (description()) {
        <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ description() }}</p>
      }
    </div>
    <div class="max-w-3xl min-w-0"><ng-content /></div>
  `,
})
export class SettingsSectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}

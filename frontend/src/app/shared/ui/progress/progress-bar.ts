import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  host: {
    role: 'progressbar',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuenow]': 'clamped()',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    class: 'block h-1.5 w-full overflow-hidden rounded-full bg-surface-3',
  },
  template: `<div
    class="h-full rounded-full transition-[width] duration-300"
    [class]="indeterminate() ? 'w-1/3 animate-pulse bg-accent' : 'bg-accent'"
    [style.width.%]="indeterminate() ? null : clamped()"
  ></div>`,
})
export class ProgressBarComponent {
  /** Accessible name (already translated): what is progressing. */
  readonly label = input.required<string>();
  readonly value = input(0);
  readonly indeterminate = input(false);
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, Math.round(this.value()))));
}

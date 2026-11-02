import { Component, computed, input } from '@angular/core';

export type AlertKind = 'info' | 'success' | 'error' | 'warning';

const KINDS: Record<AlertKind, string> = {
  info: 'border-border bg-surface-2 text-text',
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
};

@Component({
  selector: 'app-alert',
  host: { role: 'status' },
  template: `<div class="rounded-md border px-3 py-2 text-sm" [class]="classes()">
    <ng-content />
  </div>`,
})
export class AlertComponent {
  readonly kind = input<AlertKind>('info');
  protected readonly classes = computed(() => KINDS[this.kind()]);
}

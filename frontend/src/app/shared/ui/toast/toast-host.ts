import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

import { ToastService } from './toast.service';

const KINDS = {
  info: 'border-line bg-surface text-text',
  success: 'border-success bg-surface text-text',
  error: 'border-danger bg-surface text-text',
};

@Component({
  selector: 'app-toast-host',
  host: { 'aria-live': 'polite' },
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[1100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        @if (toast.action; as action) {
          <div
            class="pointer-events-auto flex items-center gap-3 rounded-md border-2 px-4 py-3 text-sm shadow-hard-sm"
            [class]="kinds[toast.kind]"
            data-testid="toast-with-action"
          >
            <span class="min-w-0 flex-1">{{ toast.message }}</span>
            <button
              type="button"
              class="shrink-0 font-semibold text-accent-text underline underline-offset-4"
              (click)="toasts.dismiss(toast.id); action.run()"
            >
              {{ action.label }}
            </button>
          </div>
        } @else {
          <button
            type="button"
            class="pointer-events-auto rounded-md border-2 px-4 py-3 text-left text-sm shadow-hard-sm"
            [class]="kinds[toast.kind]"
            (click)="toasts.dismiss(toast.id)"
          >
            {{ toast.message }}
          </button>
        }
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected readonly kinds = KINDS;

  /**
   * Straight under <body>, above the dialogs' layer (z-index 1000): a toast from a dialog was dim
   * under its backdrop and could not be clicked, and screen readers did not hear it — a dialog hides
   * from them everything beside its layer except live regions.
   */
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const body = inject(DOCUMENT).body;
    afterNextRender(() => body.appendChild(host));
    inject(DestroyRef).onDestroy(() => host.remove());
  }
}

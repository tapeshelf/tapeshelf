import { Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  template: `
    <svg
      class="animate-spin"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
  `,
})
export class SpinnerComponent {
  readonly size = input(20);
}

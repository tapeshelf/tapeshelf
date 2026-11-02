import { Component, computed, input } from '@angular/core';

/** Round avatar with an ink outline; falls back to the first letter, or a muted disc for deleted accounts. */
@Component({
  selector: 'app-avatar',
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span
      class="flex items-center justify-center overflow-hidden rounded-full border-2 border-line font-bold select-none"
      [class]="muted() ? 'bg-surface-3 text-muted' : 'bg-accent text-accent-fg'"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.42"
      aria-hidden="true"
    >
      @if (url() && !muted()) {
        <img [src]="url()" alt="" class="h-full w-full object-cover" />
      } @else {
        {{ initial() }}
      }
    </span>
  `,
})
export class AvatarComponent {
  readonly url = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(36);
  /** Deleted or unavailable account. */
  readonly muted = input(false);
  protected readonly initial = computed(() =>
    this.muted() ? '?' : (this.name().trim().slice(0, 1) || '?').toUpperCase(),
  );
}

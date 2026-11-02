import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md border-2 font-semibold select-none ' +
  'transition-[transform,box-shadow,background-color,color,border-color] duration-100 ' +
  'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2';
/** Outlined, flat; hover lifts the button off the page onto a hard shadow, pressing sets it back. */
const LIFT =
  'lift-hitbox hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-0 active:shadow-none ';
const VARIANTS: Record<ButtonVariant, string> = {
  // The orange keeps its own edge: ink on paper, burnt orange at night.
  primary: LIFT + 'border-accent-edge bg-accent text-accent-fg hover:bg-accent-hover',
  // Not the main action: no fill of its own, the page shows through.
  secondary: LIFT + 'border-line bg-transparent text-text hover:bg-surface',
  ghost: 'border-transparent text-muted hover:bg-surface-2 hover:text-text',
  danger: LIFT + 'border-danger bg-surface text-danger hover:bg-danger hover:text-white',
  /** On ink panels (the floating docks): light outline, light text. */
  inverse:
    'border-on-inverse/45 bg-transparent text-on-inverse hover:border-on-inverse hover:bg-on-inverse/10 active:bg-on-inverse/20',
};
const SIZES: Record<ButtonSize, string> = { md: 'h-10 px-4 text-sm', sm: 'h-8 px-3 text-xs' };

@Directive({
  selector: '[appButton]',
  host: { '[class]': 'classes()' },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]}`,
  );
}

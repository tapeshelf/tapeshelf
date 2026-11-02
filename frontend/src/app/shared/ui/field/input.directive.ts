import { Directive, input } from '@angular/core';

export type InputSize = '' | 'md' | 'sm';

/**
 * Shared look for text fields, selects and textareas (styles: `.ts-control` in styles.css).
 * `appInput` is 40 px tall like a default button; `appInput="sm"` is 32 px like a small one.
 * Never set heights or vertical padding on the element itself; width utilities are fine.
 */
@Directive({
  selector: 'input[appInput], select[appInput], textarea[appInput]',
  host: {
    class: 'ts-control',
    '[class.ts-control-sm]': "appInput() === 'sm'",
  },
})
export class InputDirective {
  readonly appInput = input<InputSize>('');
}

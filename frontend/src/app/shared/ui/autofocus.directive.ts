import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Focuses the host once it is rendered (inline editors that appear on demand). */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      el.nativeElement.focus();
      if (el.nativeElement instanceof HTMLInputElement) el.nativeElement.select();
    });
  }
}

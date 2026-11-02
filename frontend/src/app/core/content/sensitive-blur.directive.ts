import { Directive, computed, inject, input } from '@angular/core';

import { SensitiveContentService } from './sensitive.service';

/** Blurs a plain thumbnail of a video marked sensitive until the viewer has agreed. */
@Directive({
  selector: 'img[appSensitiveBlur]',
  host: {
    '[class.blur-md]': 'blurred()',
    '[class.scale-110]': 'blurred()',
    '[attr.data-sensitive]': 'blurred() ? "" : null',
  },
})
export class SensitiveBlurDirective {
  private readonly sensitive = inject(SensitiveContentService);
  /** The video's sensitive mark. */
  readonly appSensitiveBlur = input.required<boolean>();
  protected readonly blurred = computed(() => this.appSensitiveBlur() && !this.sensitive.allowed());
}

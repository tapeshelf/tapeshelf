import { Component, booleanAttribute, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Label + control + hint/error. The label wraps the control so the accessible name is exactly the
 * label text; hint and error live outside the label. Texts are already translated by the caller.
 * An optional field reads as such at a glance: a quieter label with an "optional" tag and a faint
 * grey frame (`.ts-optional` in styles.css).
 */
@Component({
  selector: 'app-field',
  imports: [TranslocoPipe],
  host: { '[class.ts-optional]': 'optional()' },
  template: `
    <div class="block">
      <label class="block">
        @if (label()) {
          <span
            class="mb-1.5 flex items-baseline gap-2 text-sm font-medium"
            [class]="optional() ? 'text-muted' : 'text-text'"
          >
            {{ label() }}
            @if (optional()) {
              <span class="label-mono font-normal text-faint lowercase">{{
                'common.optional' | transloco
              }}</span>
            }
          </span>
        }
        <ng-content />
      </label>
      @if (error()) {
        <span class="mt-1.5 block text-xs text-danger">{{ error() }}</span>
      } @else if (hint()) {
        <span class="mt-1.5 block text-xs text-muted">{{ hint() }}</span>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly label = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string | null | undefined>(null);
  /** Not required to submit the form. */
  readonly optional = input(false, { transform: booleanAttribute });
}

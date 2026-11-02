import { Pipe, type PipeTransform } from '@angular/core';

import { byline } from '../../core/navigation/user-links';

/**
 * `@username`, or for someone known here by their anonymous link the name they go by there;
 * '' when it has none: follow with `|| ('common.anonymous' | transloco)`.
 */
@Pipe({ name: 'byline' })
export class BylinePipe implements PipeTransform {
  transform(u: { username: string; displayName: string }): string {
    return byline(u);
  }
}

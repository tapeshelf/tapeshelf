import { Injectable, inject } from '@angular/core';
import { DefaultTranspiler, type TranspileParams } from '@jsverse/transloco';

import { pluralize } from '../i18n/plural';
import { SiteConfig } from './site-config';

/**
 * Every dictionary text can use {{site}} (the instance name) and {{host}} (the address the app is
 * served from) without each caller passing them; explicit params still win. ICU plural parts
 * (`{count, plural, one {…} other {…}}`) pick their form first, by the language of the page.
 */
@Injectable()
export class SiteTranspiler extends DefaultTranspiler {
  private readonly site = inject(SiteConfig);

  override transpile(params: TranspileParams): unknown {
    const all = {
      site: this.site.name(),
      host: location.host,
      ...params.params,
    };
    const value =
      typeof params.value === 'string'
        ? pluralize(params.value, all, document.documentElement.lang || 'en')
        : params.value;
    return super.transpile({ ...params, value, params: all });
  }
}

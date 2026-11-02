import { Component, computed, inject, input, resource } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { siteLegal } from '../../api/fn/site/site-legal';
import type { LegalDoc } from '../../api/models/legal-doc';
import { LanguageService } from '../../core/i18n/language.service';
import { FRAME } from '../../core/layout/frame';
import { SiteConfig } from '../../core/site/site-config';
import { MarkdownComponent } from '../../shared/ui/markdown/markdown';

/**
 * The operator's own terms, privacy policy or imprint (LEGAL_DIR, in the reader's language when
 * there is a translation). Without the file the page says so instead of inventing rules.
 */
@Component({
  selector: 'app-instance-legal',
  imports: [TranslocoPipe, MarkdownComponent],
  host: { class: 'block' },
  template: `
    <article class="max-w-3xl py-10" [class]="frame">
      @if (text.hasValue() && text.value(); as doc) {
        @if (!startsWithTitle(doc.markdown)) {
          <h1 class="font-display mb-6 text-3xl font-semibold sm:text-4xl">
            {{ 'legal.' + doc.doc + '.title' | transloco }}
          </h1>
        }
        <app-markdown [source]="doc.markdown" />
      } @else if (text.isLoading()) {
        <h1 class="font-display mb-6 text-3xl font-semibold sm:text-4xl">
          {{ 'legal.' + doc() + '.title' | transloco }}
        </h1>
      } @else {
        <h1 class="font-display mb-6 text-3xl font-semibold sm:text-4xl">
          {{ 'legal.' + doc() + '.title' | transloco }}
        </h1>
        <p class="text-[17px] leading-relaxed text-muted" data-testid="legal-missing">
          {{ (missing() ? 'legal.missing' : 'legal.failed') | transloco }}
        </p>
        @if (site.contactEmail(); as email) {
          <p class="mt-4 text-[17px]">
            {{ 'legal.contact' | transloco: { email } }}
          </p>
        }
      }
    </article>
  `,
})
export class InstanceLegalPage {
  /** From the route's data. */
  readonly doc = input.required<LegalDoc>();

  protected readonly frame = FRAME;
  protected readonly site = inject(SiteConfig);
  private readonly api = inject(Api);
  private readonly lang = inject(LanguageService);

  protected readonly text = resource({
    params: () => ({ doc: this.doc(), lang: this.lang.current() }),
    loader: ({ params }) => this.api.invoke(siteLegal, params),
  });

  /** 404 means "not published"; anything else is a failure worth a different sentence. */
  protected readonly missing = computed(() => {
    const err = this.text.error();
    return err instanceof HttpErrorResponse ? err.status === 404 : !err;
  });

  protected startsWithTitle(markdown: string): boolean {
    return /^\s*#\s/.test(markdown);
  }
}

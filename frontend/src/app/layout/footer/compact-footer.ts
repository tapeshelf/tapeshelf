import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import {
  AVAILABLE_LANGS,
  LANGUAGE_NAMES,
  LanguageService,
  isLang,
} from '../../core/i18n/language.service';
import { LayoutFrame } from '../../core/layout/frame';
import { SiteConfig } from '../../core/site/site-config';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

/**
 * One quiet line under the app's pages: the operator's rules and policy, the contact
 * address and the year, in the page frame. With a website in front of the app (SITE_URL,
 * tapeshelf.com) the rules live there; otherwise only the documents published in LEGAL_DIR.
 */
@Component({
  selector: 'app-compact-footer',
  imports: [FormsModule, RouterLink, TranslocoPipe, SelectComponent, OptionComponent],
  host: { class: 'block' },
  template: `
    @if (!layout.footerHeld()) {
      <footer
        class="frame-glide label-mono flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-4 pb-5 text-muted"
        [class]="layout.frame()"
      >
        <nav class="contents" [attr.aria-label]="'footer.nav' | transloco">
          @for (link of links(); track link.path) {
            <a [routerLink]="link.path" class="transition-colors hover:text-text">
              {{ 'footer.links.' + link.key | transloco }}
            </a>
          }
        </nav>
        @if (contactEmail(); as email) {
          <a [href]="'mailto:' + email" class="transition-colors hover:text-text">{{ email }}</a>
        }
        <!-- The language: the browser's by default, any of them by hand; the site and the
             account follow it. -->
        <app-select
          variant="quiet"
          class="ml-auto"
          [ngModel]="language.current()"
          (ngModelChange)="pick($event)"
          [ariaLabel]="'footer.language' | transloco"
          data-testid="footer-language"
        >
          @for (lang of langs; track lang) {
            <app-option [value]="lang" [attr.lang]="lang">{{ langNames[lang] }}</app-option>
          }
        </app-select>
        <span>{{ 'footer.copyright' | transloco: { year } }}</span>
      </footer>
    }
  `,
})
export class CompactFooterComponent {
  protected readonly layout = inject(LayoutFrame);
  private readonly site = inject(SiteConfig);
  protected readonly links = computed<readonly { key: string; path: string }[]>(() => {
    const legal = this.site.legal();
    const withSite = !!this.site.siteUrl();
    return (['terms', 'privacy', 'imprint'] as const)
      .filter((doc) => legal[doc] || (withSite && doc !== 'imprint'))
      .map((doc) => ({ key: doc, path: `/${doc}` }));
  });
  protected readonly contactEmail = this.site.contactEmail;
  protected readonly year = new Date().getFullYear();
  protected readonly language = inject(LanguageService);
  protected readonly langs = AVAILABLE_LANGS;
  protected readonly langNames = LANGUAGE_NAMES;

  /** Remembered in this browser; a signed-in person's account takes it too (PreferencesSync). */
  protected pick(value: unknown): void {
    if (isLang(value)) this.language.set(value);
  }
}

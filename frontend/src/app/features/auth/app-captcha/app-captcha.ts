import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { LanguageService, isLang } from '../../../core/i18n/language.service';
import { SiteConfig } from '../../../core/site/site-config';
import { ThemeService } from '../../../core/theme/theme.service';
import { CaptchaComponent } from '../../../shared/ui/captcha/captcha';

/** What the phone app's web view puts on the page to hear the answer. */
interface AppBridge {
  postMessage(message: string): void;
}

/**
 * What the app hears: the widget is on the page (until then the app shows its own "loading"), the
 * token of a passed check, or that there will be no check.
 */
export type AppCaptchaMessage = { ready: true } | { token: string } | { failed: true };

/**
 * The sign-up check for the phone app: the widget is tied to this site's address, so the
 * app shows this page in a web view and takes the token from it. The page stands alone (route data
 * `frame: 'bare'`: no header, no footer) and has nothing but the widget, in the app's theme and
 * language (`?theme=dark&lang=de`, for this visit only). In a browser it shows the widget and tells
 * no one.
 */
@Component({
  selector: 'app-app-captcha',
  imports: [CaptchaComponent, TranslocoPipe],
  template: `
    <!-- The canvas colour alone, without the site's grain: the app around the page has none. -->
    <div class="fixed inset-0 flex items-center justify-center bg-(--vs-canvas)">
      @if (failed()) {
        <p class="max-w-sm text-center text-sm text-danger" data-testid="captcha-failed">
          {{ 'auth.captchaLoadFailed' | transloco }}
        </p>
      } @else if (site.captchaSiteKey(); as key) {
        <app-captcha
          [siteKey]="key"
          (shown)="tell({ ready: true })"
          (token)="passed($event)"
          (failed)="fail()"
          (broken)="fail()"
        />
      }
    </div>
  `,
})
export class AppCaptchaPage {
  protected readonly site = inject(SiteConfig);
  protected readonly failed = signal(false);

  constructor() {
    const asked = inject(ActivatedRoute).snapshot.queryParamMap;
    const theme = asked.get('theme');
    // Set, not stored: the next visit of a browser that opened this address is as it was.
    if (theme === 'dark' || theme === 'light') inject(ThemeService).preference.set(theme);
    const lang = asked.get('lang');
    if (isLang(lang)) inject(LanguageService).show(lang);
    // A server without the check has no widget to show.
    if (!this.site.captchaSiteKey()) this.fail();
  }

  /** A token that ran out comes as null: the widget asks for the next one by itself. */
  protected passed(token: string | null): void {
    if (token) this.tell({ token });
  }

  protected fail(): void {
    this.failed.set(true);
    this.tell({ failed: true });
  }

  protected tell(message: AppCaptchaMessage): void {
    const bridge = (window as unknown as { TapeshelfCaptcha?: AppBridge }).TapeshelfCaptcha;
    bridge?.postMessage(JSON.stringify(message));
  }
}

import { signal } from '@angular/core';

import type { CaptchaComponent } from '../../shared/ui/captcha/captcha';

/**
 * The captcha step of a sign-up form: hidden until the server answers `captchaRequired` (a
 * repeated sign-up from the same IP), then the widget's token goes with the next attempt. A token
 * is single-use: after a failed attempt the widget is reset for a fresh one.
 */
export class SignupCaptcha {
  readonly needed = signal(false);
  token: string | null = null;

  /** After a failed attempt: true when it failed on the captcha (the form waits for the widget). */
  failed(code: string | undefined, widget: CaptchaComponent | undefined): boolean {
    const spent = this.token !== null;
    this.token = null;
    if (spent) widget?.reset();
    if (code !== 'captchaRequired' && code !== 'captchaFailed') return false;
    this.needed.set(true);
    return true;
  }
}

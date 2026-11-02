import { describe, expect, it, vi } from 'vitest';

import type { CaptchaComponent } from '../../shared/ui/captcha/captcha';
import { SignupCaptcha } from './signup-captcha';

describe('SignupCaptcha', () => {
  const widget = () => ({ reset: vi.fn() }) as unknown as CaptchaComponent;

  it('stays hidden until the server asks for it', () => {
    const c = new SignupCaptcha();
    expect(c.needed()).toBe(false);
    expect(c.failed('usernameTaken', widget())).toBe(false);
    expect(c.needed()).toBe(false);
    expect(c.failed('captchaRequired', undefined)).toBe(true);
    expect(c.needed()).toBe(true);
  });

  it('a spent token is dropped and the widget reset, whatever the error', () => {
    const c = new SignupCaptcha();
    const w = widget();
    c.token = 'once';
    expect(c.failed('emailTaken', w)).toBe(false);
    expect(c.token).toBeNull();
    expect(w.reset).toHaveBeenCalledOnce();
    c.token = 'again';
    expect(c.failed('captchaFailed', w)).toBe(true);
    expect(w.reset).toHaveBeenCalledTimes(2);
  });
});

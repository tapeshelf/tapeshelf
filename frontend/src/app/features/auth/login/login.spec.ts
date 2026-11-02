import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { Api } from '../../../api/api';
import { AuthStore } from '../../../core/auth/auth.store';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { LoginPage } from './login';

const ME = { username: 'ann' };

function apiError(code: string, details?: unknown): HttpErrorResponse {
  return new HttpErrorResponse({
    status: code === 'twoFactorLogin' ? 401 : 400,
    error: { statusCode: 400, code, message: `server: ${code}`, details },
  });
}

/** The second step after the password on the same page. */
describe('LoginPage', () => {
  async function setup(auth: Record<string, unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: auth },
        { provide: Api, useValue: { invoke: () => Promise.resolve({ enabled: false }) } },
      ],
    });
    const fixture = TestBed.createComponent(LoginPage);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    };
    const button = (text: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
    await settle();
    type('input[type=email]', 'ann@example.com');
    type('input[type=password]', 'secret123');
    await submit();
    return { el, navigate, type, submit, button, settle };
  }

  it('asks for the app’s code after the password and signs in with it', async () => {
    const loginSecondStep = vi.fn().mockResolvedValue(ME);
    const page = await setup({
      login: vi.fn().mockRejectedValue(apiError('twoFactorLogin', { methods: ['app'] })),
      loginSecondStep,
    });
    expect(page.el.querySelector('h1')?.textContent).toBe('Two-step sign-in');
    expect(page.el.textContent).toContain('Enter the six digits from your authenticator app.');
    expect(page.el.textContent).not.toContain('Use a passkey');

    page.type('[data-testid=second-step-code]', ' 123456 ');
    await page.submit();
    expect(loginSecondStep).toHaveBeenCalledWith('123456');
    expect(page.navigate).toHaveBeenCalledWith('/@ann');
  });

  it('a recovery code instead; a wrong one says so and stays', async () => {
    const loginSecondStep = vi
      .fn()
      .mockRejectedValueOnce(apiError('twoFactorInvalidCode'))
      .mockResolvedValue(ME);
    const page = await setup({
      login: vi.fn().mockRejectedValue(apiError('twoFactorLogin', { methods: ['app'] })),
      loginSecondStep,
    });
    page.button('Use a recovery code').click();
    await page.settle();
    expect(page.el.textContent).toContain('Recovery code');
    page.type('[data-testid=second-step-code]', 'ABCDE-FGHJK');
    await page.submit();
    expect(page.el.textContent).toContain('server: twoFactorInvalidCode');
    expect(page.navigate).not.toHaveBeenCalled();
    await page.submit();
    expect(page.navigate).toHaveBeenCalledWith('/@ann');
  });

  it('a passkey only: its button first; a closed browser window is no error', async () => {
    const loginWithPasskey = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(ME);
    const page = await setup({
      login: vi.fn().mockRejectedValue(apiError('twoFactorLogin', { methods: ['passkey'] })),
      loginWithPasskey,
    });
    expect(page.el.querySelector('[data-testid=second-step-code]')).toBeNull();
    page.button('Use a passkey').click();
    await page.settle();
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.el.querySelector('app-alert')).toBeNull();
    page.button('Use a passkey').click();
    await page.settle();
    expect(page.navigate).toHaveBeenCalledWith('/@ann');
  });

  it('took too long: back to the password with the reason', async () => {
    const page = await setup({
      login: vi.fn().mockRejectedValue(apiError('twoFactorLogin', { methods: ['app'] })),
      loginSecondStep: vi.fn().mockRejectedValue(apiError('twoFactorExpired')),
    });
    page.type('[data-testid=second-step-code]', '123456');
    await page.submit();
    expect(page.el.querySelector('h1')?.textContent).toBe('Log in');
    expect(page.el.textContent).toContain('server: twoFactorExpired');
  });
});

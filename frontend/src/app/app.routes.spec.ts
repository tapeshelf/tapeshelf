import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Api } from './api/api';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';
import { SITE_FALLBACK, SiteConfig } from './core/site/site-config';
import { GuestHomePage } from './features/guest/guest-home';
import { InstanceLegalPage } from './features/legal/instance-legal';
import { NotFoundPage } from './features/not-found/not-found';
import { provideTranslocoTesting } from './testing/transloco-testing';

/** Which page a guest lands on: the app's own pages, and the operator's website for the rules. */
describe('routes by site mode', () => {
  async function pageAt(url: string, siteUrl: string | null = null): Promise<Type<unknown> | null> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [
        provideRouter(routes, withComponentInputBinding()), // as in app.config
        { provide: AuthStore, useValue: { ready: () => Promise.resolve(), user: signal(null) } },
        { provide: Api, useValue: { invoke: () => new Promise(() => undefined) } },
      ],
    });
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, siteUrl });
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url);
    return page ? ((page as object).constructor as Type<unknown>) : null;
  }

  it('a guest gets the guest page; the operator’s texts are the app’s own without a website', async () => {
    expect(await pageAt('/')).toBe(GuestHomePage);
    expect(await pageAt('/terms')).toBe(InstanceLegalPage);
    expect(await pageAt('/privacy')).toBe(InstanceLegalPage);
    expect(await pageAt('/imprint')).toBe(InstanceLegalPage);
  });

  it('the information pages are the website’s now: the app has none of them', async () => {
    expect(await pageAt('/faq')).toBe(NotFoundPage);
    expect(await pageAt('/how-it-works')).toBe(NotFoundPage);
  });

  it('with a website (tapeshelf.com) the rules are left for it', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign });
    try {
      expect(await pageAt('/terms', 'https://tapeshelf.com')).not.toBe(InstanceLegalPage);
      expect(assign).toHaveBeenCalledWith('https://tapeshelf.com/terms');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

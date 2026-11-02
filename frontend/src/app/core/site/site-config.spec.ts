import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { SITE_FALLBACK, SiteConfig } from './site-config';

describe('SiteConfig', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    invoke.mockReset();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [{ provide: Api, useValue: { invoke } }],
    });
  });

  it('takes the instance settings from the API', async () => {
    invoke.mockResolvedValue({
      ...SITE_FALLBACK,
      name: 'Family shelf',
      contactEmail: 'ops@example.org',
      siteUrl: 'https://family.example',
      legal: { terms: true, privacy: false, imprint: false },
      edition: 'cloud',
    });
    const site = TestBed.inject(SiteConfig);
    await site.load();
    expect(site.name()).toBe('Family shelf');
    expect(site.contactEmail()).toBe('ops@example.org');
    expect(site.siteUrl()).toBe('https://family.example');
    expect(site.edition()).toBe('cloud');
    expect(site.hasTiers()).toBe(true);
  });

  it('a self-hosted instance has no tiers', () => {
    const site = TestBed.inject(SiteConfig);
    expect(site.edition()).toBe('community');
    expect(site.hasTiers()).toBe(false);
  });

  it('keeps the fallback when the API is unreachable', async () => {
    invoke.mockRejectedValue(new Error('offline'));
    const site = TestBed.inject(SiteConfig);
    await site.load();
    expect(site.info()).toEqual(SITE_FALLBACK);
  });

  it('feeds {{site}} and {{host}} to every text; explicit params win', () => {
    const site = TestBed.inject(SiteConfig);
    const transloco = TestBed.inject(TranslocoService);
    site.info.set({ ...SITE_FALLBACK, name: 'Family shelf' });
    expect(transloco.translate('app.name')).toBe('Family shelf');
    expect(transloco.translate('footer.copyright', { year: 2026 })).toBe('© 2026 Family shelf');
    expect(transloco.translate('settings.account.usernameHint')).toBe(
      `Your address: ${location.host}/@username.`,
    );
    expect(transloco.translate('app.name', { site: 'Other' })).toBe('Other');
  });
});

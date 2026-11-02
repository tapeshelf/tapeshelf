import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { HeaderComponent } from './header';

/** Where the logo leads someone who is not signed in. */
describe('HeaderComponent logo', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HeaderComponent, provideTranslocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function logoHref(): string | null {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a.vt-logo')!.getAttribute('href');
  }

  it('on the cloud, to the site’s home page in front of the app', () => {
    TestBed.inject(SiteConfig).info.set({
      ...SITE_FALLBACK,
      edition: 'cloud',
      siteUrl: 'https://tapeshelf.com/',
    });
    expect(logoHref()).toBe('https://tapeshelf.com/');
  });

  it('self-hosted, to the app’s own front page, even with a website set', () => {
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, siteUrl: 'https://example.org' });
    expect(logoHref()).toBe('/');
  });
});

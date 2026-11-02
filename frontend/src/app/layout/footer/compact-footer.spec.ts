import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { CompactFooterComponent } from './compact-footer';

describe('CompactFooterComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CompactFooterComponent, provideTranslocoTesting()],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(CompactFooterComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const hrefs = (el: HTMLElement) =>
    [...el.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));

  it('with a website in front (tapeshelf.com): the rules and the operator’s contact', () => {
    TestBed.inject(SiteConfig).info.set({
      ...SITE_FALLBACK,
      contactEmail: 'contact@tapeshelf.com',
      siteUrl: 'https://tapeshelf.com',
    });
    const el = render();
    expect(hrefs(el)).toEqual(['/terms', '/privacy']);
    expect(el.querySelector('a[href="mailto:contact@tapeshelf.com"]')).toBeTruthy();
  });

  it('on an instance: only the documents its operator published, and the operator’s contact', () => {
    TestBed.inject(SiteConfig).info.set({
      ...SITE_FALLBACK,
      name: 'Family shelf',
      contactEmail: 'ops@example.org',
      legal: { terms: true, privacy: false, imprint: true },
    });
    const el = render();
    expect(hrefs(el)).toEqual(['/terms', '/imprint']);
    expect(el.querySelector('a[href="mailto:ops@example.org"]')).toBeTruthy();
    expect(el.textContent).toContain(`© ${new Date().getFullYear()} Family shelf`);
  });

  it('on an instance without a contact shows none', () => {
    const el = render();
    expect(el.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(hrefs(el)).toEqual([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { GuestHomePage } from './guest-home';

describe('GuestHomePage', () => {
  it('names the instance and offers the way in', async () => {
    await TestBed.configureTestingModule({
      imports: [GuestHomePage, provideTranslocoTesting()],
      providers: [provideRouter([])],
    }).compileComponents();
    TestBed.inject(SiteConfig).info.set({
      ...SITE_FALLBACK,
      name: 'Family shelf',
    });
    const fixture = TestBed.createComponent(GuestHomePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="guest-site-name"]')?.textContent).toContain(
      'Family shelf',
    );
    expect(el.querySelector('h1')?.textContent).toContain('A private shelf for your videos');
    expect(el.querySelector('a[href="/register"]')?.textContent).toContain('Create an account');
    expect(el.querySelector('a[href="/login"]')?.textContent).toContain('Log in');
  });
});

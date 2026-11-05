import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { SITE_FALLBACK, SiteConfig } from './core/site/site-config';
import { provideTranslocoTesting } from './testing/transloco-testing';

@Component({ template: '' })
class Blank {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, provideTranslocoTesting()],
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: Blank },
          { path: 'settings', component: Blank },
          { path: 'alone', component: Blank, data: { frame: 'bare' } },
        ]),
        provideHttpClient(),
      ],
    }).compileComponents();
  });

  it('renders the header with the brand name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-header')).toBeTruthy();
    expect(el.querySelector('app-logo')?.textContent).toContain('tapeshelf');
  });

  it('a bare page stands alone: no header, banners or footer, and they are back on the next page', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;
    const shell = ['app-header', 'app-compact-footer', 'app-verify-banner', 'app-demo-banner'];
    await router.navigateByUrl('/alone');
    await fixture.whenStable();
    for (const part of shell) expect(el.querySelector(part), part).toBeNull();
    expect(el.querySelector('main router-outlet')).toBeTruthy();

    await router.navigateByUrl('/settings');
    await fixture.whenStable();
    for (const part of shell) expect(el.querySelector(part), part).toBeTruthy();
  });

  it('ends every page with the compact footer: the operator’s rules and contact', async () => {
    TestBed.inject(SiteConfig).info.set({
      ...SITE_FALLBACK,
      contactEmail: 'contact@tapeshelf.com',
      siteUrl: 'https://tapeshelf.com',
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;
    for (const url of ['/settings', '/']) {
      await router.navigateByUrl(url);
      await fixture.whenStable();
      expect(el.querySelector('app-compact-footer a[href="/privacy"]')).toBeTruthy();
      expect(el.querySelector('app-compact-footer')?.textContent).toContain(
        'contact@tapeshelf.com',
      );
    }
  });
});

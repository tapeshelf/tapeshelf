import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { SettingsLayout } from './settings-layout';

describe('SettingsLayout', () => {
  async function tabs(edition: 'community' | 'cloud'): Promise<string[]> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SettingsLayout, provideTranslocoTesting()],
      providers: [provideRouter([])],
    }).compileComponents();
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, edition });
    const fixture = TestBed.createComponent(SettingsLayout);
    fixture.detectChanges();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');
    return Array.from(links, (a) => a.getAttribute('href') ?? '');
  }

  it('shows the plan tab only where there are plans', async () => {
    expect(await tabs('cloud')).toContain('/plan');
    const selfHosted = await tabs('community');
    expect(selfHosted).not.toContain('/plan');
    expect(selfHosted).toEqual([
      '/profile',
      '/page',
      '/notifications',
      '/blocked',
      '/account',
      '/security',
    ]);
  });
});

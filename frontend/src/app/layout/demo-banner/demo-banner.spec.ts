import { TestBed } from '@angular/core/testing';

import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { DemoBannerComponent } from './demo-banner';

describe('DemoBannerComponent', () => {
  async function render(demo: { email: string; password: string } | null): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [DemoBannerComponent, provideTranslocoTesting()],
    }).compileComponents();
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, demo });
    const fixture = TestBed.createComponent(DemoBannerComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('the demo says it is erased daily and how to sign in', async () => {
    const el = await render({ email: 'demo@tapeshelf.com', password: 'demo' });
    const text = el.querySelector('[data-testid="demo-banner"]')?.textContent ?? '';
    expect(text).toContain('demo@tapeshelf.com');
    expect(text).toContain('every day');
  });

  it('elsewhere shows nothing', async () => {
    const el = await render(null);
    expect(el.querySelector('[data-testid="demo-banner"]')).toBeNull();
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { Api } from '../../api/api';
import { SITE_FALLBACK, SiteConfig } from '../../core/site/site-config';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { InstanceLegalPage } from './instance-legal';

describe('InstanceLegalPage', () => {
  const invoke = vi.fn();

  beforeEach(async () => {
    localStorage.clear();
    invoke.mockReset();
    await TestBed.configureTestingModule({
      imports: [InstanceLegalPage, provideTranslocoTesting()],
      providers: [{ provide: Api, useValue: { invoke } }],
    }).compileComponents();
  });

  async function render(doc: 'terms' | 'privacy' | 'imprint'): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(InstanceLegalPage);
    fixture.componentRef.setInput('doc', doc);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the operator’s text, in the reader’s language, with its own title', async () => {
    invoke.mockResolvedValue({ doc: 'terms', lang: 'en', markdown: '# House rules\n\nBe kind.' });
    const el = await render('terms');
    expect(invoke).toHaveBeenCalledWith(expect.any(Function), { doc: 'terms', lang: 'en' });
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('h1')?.textContent).toContain('House rules');
    expect(el.textContent).toContain('Be kind.');
  });

  it('adds the document title when the text has none', async () => {
    invoke.mockResolvedValue({ doc: 'privacy', lang: 'en', markdown: 'We keep little.' });
    const el = await render('privacy');
    expect(el.querySelector('h1')?.textContent).toContain('Privacy policy');
  });

  it('says plainly that an unpublished document is missing and how to ask', async () => {
    TestBed.inject(SiteConfig).info.set({ ...SITE_FALLBACK, contactEmail: 'ops@example.org' });
    invoke.mockRejectedValue(new HttpErrorResponse({ status: 404 }));
    const el = await render('imprint');
    expect(el.querySelector('h1')?.textContent).toContain('Imprint');
    expect(el.querySelector('[data-testid="legal-missing"]')?.textContent).toContain(
      'has not published this document yet',
    );
    expect(el.textContent).toContain('Questions: ops@example.org');
  });

  it('tells a failure apart from a missing document', async () => {
    invoke.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    const el = await render('terms');
    expect(el.querySelector('[data-testid="legal-missing"]')?.textContent).toContain(
      'could not be loaded',
    );
  });
});

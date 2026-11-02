import { TestBed } from '@angular/core/testing';

import { Api } from '../../api/api';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { GoogleButtonComponent } from './google-button';

/** Where the Google button sends the browser: with no return path the server lands on the user's page. */
describe('GoogleButtonComponent', () => {
  async function hrefWith(returnTo?: string): Promise<string | null> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting()],
      providers: [{ provide: Api, useValue: { invoke: () => Promise.resolve({ enabled: true }) } }],
    });
    const fixture = TestBed.createComponent(GoogleButtonComponent);
    if (returnTo !== undefined) fixture.componentRef.setInput('returnTo', returnTo);
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a')?.getAttribute('href') ?? null;
  }

  it('starts without a return path unless the page has one', async () => {
    expect(await hrefWith()).toBe('/api/auth/google');
    expect(await hrefWith('/settings/plan?x=1')).toBe(
      '/api/auth/google?returnTo=%2Fsettings%2Fplan%3Fx%3D1',
    );
  });
});

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { authRefreshInterceptor } from './auth-refresh.interceptor';
import { AuthStore } from './auth.store';

/** Lets the refresh promise and the retry it starts run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('authRefreshInterceptor', () => {
  const signedIn = signal(true);
  const refresh = vi.fn<() => Promise<boolean>>();
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    signedIn.set(true);
    refresh.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authRefreshInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { isAuthenticated: signedIn, refresh } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  const expired = { status: 401, statusText: 'Unauthorized' };
  const sessionExpired = { code: 'sessionExpired', message: 'Your session has expired.' };

  it('tells the API the app believes it is signed in; a guest sends nothing', () => {
    void firstValueFrom(http.get('/api/v/abc'));
    expect(backend.expectOne('/api/v/abc').request.headers.get('X-Signed-In')).toBe('1');
    signedIn.set(false);
    void firstValueFrom(http.get('/api/v/abc'));
    expect(backend.expectOne('/api/v/abc').request.headers.has('X-Signed-In')).toBe(false);
  });

  it('an expired access cookie on a public page: renews the session and asks again as the owner', async () => {
    refresh.mockResolvedValue(true);
    const page = firstValueFrom(http.get<{ owner: boolean }>('/api/v/abc'));
    backend.expectOne('/api/v/abc').flush(sessionExpired, expired);
    await settle();
    const retry = backend.expectOne('/api/v/abc');
    expect(retry.request.headers.get('X-Signed-In')).toBe('1');
    retry.flush({ owner: true });
    expect(await page).toEqual({ owner: true });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('when the session is really over, the public page is asked again as a guest', async () => {
    refresh.mockImplementation(async () => {
      signedIn.set(false);
      return false;
    });
    const page = firstValueFrom(http.get<{ owner: boolean }>('/api/v/abc'));
    backend.expectOne('/api/v/abc').flush(sessionExpired, expired);
    await settle();
    const retry = backend.expectOne('/api/v/abc');
    expect(retry.request.headers.has('X-Signed-In')).toBe(false);
    retry.flush({ owner: false });
    expect(await page).toEqual({ owner: false });
  });

  it('a private route whose session is over fails as before', async () => {
    refresh.mockResolvedValue(false);
    const page = firstValueFrom(http.get('/api/me'));
    backend.expectOne('/api/me').flush({ code: 'unauthorized', message: '' }, expired);
    await expect(page).rejects.toMatchObject({ status: 401 });
  });
});

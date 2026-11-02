import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { toApiError } from '../api/api-error';
import { AuthStore } from './auth.store';

/** Endpoints whose 401 means "wrong credentials", not "expired access token". */
const NO_REFRESH = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google/complete',
];

/**
 * Sent while the app believes it is signed in (backend `SIGNED_IN_HEADER`): a public route (a video
 * page, a shelf) then answers 401 instead of quietly treating an expired access cookie as a guest.
 */
const SIGNED_IN = 'X-Signed-In';

let refreshInFlight: Promise<boolean> | null = null;

/**
 * On 401, rotates the session once (shared across concurrent requests) and retries the request.
 * When the session is really over, a public request is asked again as a guest's.
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || NO_REFRESH.some((p) => req.url.startsWith(p)))
    return next(req);
  const store = inject(AuthStore);
  const send = () =>
    next(store.isAuthenticated() ? req.clone({ setHeaders: { [SIGNED_IN]: '1' } }) : req);
  return send().pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      const asGuest = toApiError(err).code === 'sessionExpired';
      refreshInFlight ??= store.refresh().finally(() => {
        refreshInFlight = null;
      });
      return from(refreshInFlight).pipe(
        switchMap((ok) => (ok || asGuest ? send() : throwError(() => err))),
      );
    }),
  );
};

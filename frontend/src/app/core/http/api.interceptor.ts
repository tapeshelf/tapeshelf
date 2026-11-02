import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { LanguageService } from '../i18n/language.service';

/**
 * Same-origin API calls: send cookies, mark requests as XHR (the backend rejects state-changing
 * requests without it — CSRF defence) and tell the backend which language to answer in.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const lang = inject(LanguageService).current();
  return next(
    req.clone({
      withCredentials: true,
      setHeaders: { 'X-Requested-With': 'XMLHttpRequest', 'Accept-Language': lang },
    }),
  );
};

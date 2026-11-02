import { translate } from '@jsverse/transloco';
import { HttpErrorResponse } from '@angular/common/http';

/** Shape every backend error has (see backend AllExceptionsFilter). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  /** Already localized by the backend. */
  message: string;
  details?: unknown;
  requestId?: string;
}

export function toApiError(err: unknown): ApiErrorBody {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiErrorBody> | null;
    if (body && typeof body.code === 'string' && typeof body.message === 'string') {
      return {
        statusCode: err.status,
        code: body.code,
        message: body.message,
        details: body.details,
        requestId: body.requestId,
      };
    }
    return { statusCode: err.status, code: err.status === 0 ? 'network' : 'unknown', message: '' };
  }
  return { statusCode: 0, code: 'unknown', message: '' };
}

/**
 * What to tell the user about a failed request: the server's own message, else that the server
 * could not be reached, else that something went wrong. A bare `toApiError(e).message` is empty for a
 * network error, and pages that waited on it kept spinning for good.
 */
export function errorText(err: unknown): string {
  const e = toApiError(err);
  return e.message || translate(e.code === 'network' ? 'errors.network' : 'errors.unknown');
}

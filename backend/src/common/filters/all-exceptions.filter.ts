import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { isAppExceptionPayload } from '../errors/app.exception.js';
import { localeFromAcceptLanguage, t } from '../i18n/i18n.js';

export interface ErrorBody {
  statusCode: number;
  /** Machine-readable code for the frontend (e.g. "validation", "notFound", "usernameTaken"). */
  code: string;
  /** Localized, safe to show to the user. */
  message: string;
  details?: unknown;
  requestId?: string;
}

/**
 * One error shape for the whole API. Messages are always localized: AppException carries a
 * translation key, built-in exceptions fall back to a per-status default, and unexpected errors
 * are logged and hidden behind a generic message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string; locale?: string }>();
    const locale =
      req.locale ?? localeFromAcceptLanguage(req.headers['accept-language']);
    const requestId = typeof req.id === 'string' ? req.id : undefined;

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (isAppExceptionPayload(payload)) {
        body = {
          statusCode: status,
          code: payload.code,
          message: t(locale, payload.messageKey, payload.params),
          details: payload.details,
          requestId,
        };
      } else {
        // Built-in exception (router 404, guards, ValidationPipe...). Its English text is not shown.
        const info =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)
            : {};
        const isValidation =
          status === HttpStatus.BAD_REQUEST && Array.isArray(info['message']);
        body = {
          statusCode: status,
          code: isValidation ? 'validation' : codeFor(status),
          message: isValidation
            ? t(locale, 'errors.validation')
            : defaultMessage(status, locale),
          details: isValidation ? info['message'] : undefined,
          requestId,
        };
      }
    } else if (dbStatus(exception)) {
      const status = dbStatus(exception)!;
      this.logger.warn(
        `${req.method} ${req.url}: database said ${(exception as { code: string }).code}`,
      );
      body = {
        statusCode: status,
        code: codeFor(status),
        message: defaultMessage(status, locale),
        requestId,
      };
    } else {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'internal',
        message: t(locale, 'errors.internal'),
        requestId,
      };
    }
    res.status(body.statusCode).json(body);
  }
}

/**
 * Database answers that are the request's fault, not the server's: all of them went out as 500.
 * A record the request needs is not there; a value its column cannot take (an id that is
 * no uuid); a unique or a foreign key; two changes at once; a transaction out of time.
 */
const DB_STATUS: Record<string, number> = {
  P2025: HttpStatus.NOT_FOUND,
  P2007: HttpStatus.BAD_REQUEST,
  P2023: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.CONFLICT,
  P2034: HttpStatus.CONFLICT,
  P2028: HttpStatus.SERVICE_UNAVAILABLE,
};

/** The status of a Prisma error the request caused, read off its code as the services do. */
function dbStatus(exception: unknown): number | undefined {
  const code = (exception as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? DB_STATUS[code] : undefined;
}

function codeFor(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'badRequest';
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'forbidden';
    case HttpStatus.NOT_FOUND:
      return 'notFound';
    case HttpStatus.CONFLICT:
      return 'conflict';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'payloadTooLarge';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'tooManyRequests';
    default:
      return status >= 500 ? 'internal' : 'error';
  }
}

function defaultMessage(status: number, locale: string): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return t(locale, 'errors.badRequest');
    case HttpStatus.UNAUTHORIZED:
      return t(locale, 'errors.unauthorized');
    case HttpStatus.FORBIDDEN:
      return t(locale, 'errors.forbidden');
    case HttpStatus.NOT_FOUND:
      return t(locale, 'errors.notFound');
    case HttpStatus.CONFLICT:
      return t(locale, 'errors.conflict');
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return t(locale, 'errors.payloadTooLarge');
    case HttpStatus.TOO_MANY_REQUESTS:
      return t(locale, 'errors.tooManyRequests');
    default:
      return t(locale, status >= 500 ? 'errors.internal' : 'errors.generic');
  }
}

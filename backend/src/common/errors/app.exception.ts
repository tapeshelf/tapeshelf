import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppExceptionPayload {
  /** Machine-readable code for the frontend (stable, documented per endpoint). */
  code: string;
  /** Translation key resolved by the exception filter in the request's locale. */
  messageKey: string;
  params?: Record<string, unknown>;
  details?: unknown;
}

/**
 * Domain error with a localized message. Prefer this over Nest's built-in exceptions for anything
 * a user may see; built-ins are still fine for generic 401/403/404.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    messageKey: string,
    options: { params?: Record<string, unknown>; details?: unknown } = {},
  ) {
    const payload: AppExceptionPayload = { code, messageKey, ...options };
    super(payload, status);
  }
}

export const isAppExceptionPayload = (
  value: unknown,
): value is AppExceptionPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AppExceptionPayload).code === 'string' &&
  typeof (value as AppExceptionPayload).messageKey === 'string';

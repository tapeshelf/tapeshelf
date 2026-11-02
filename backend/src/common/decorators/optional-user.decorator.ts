import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AppRequest, RequestUser } from '../auth/request-user.js';

/** The signed-in user when there is one; `undefined` for guests on @Public() routes. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined =>
    ctx.switchToHttp().getRequest<AppRequest>().user,
);

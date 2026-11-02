import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AppRequest, RequestUser } from '../auth/request-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user)
      throw new Error(
        'CurrentUser used on a route without an authenticated user',
      );
    return user;
  },
);

import {
  type CanActivate,
  type ExecutionContext,
  type HttpStatus,
  Injectable,
} from '@nestjs/common';

import {
  CLIENT_HEADER,
  parseClient,
  requiredUpdate,
} from '../client-version.js';
import { AppException } from '../errors/app.exception.js';
import type { AppRequest } from '../auth/request-user.js';

/** 426 Upgrade Required: Nest's HttpStatus has no name for it. */
const UPGRADE_REQUIRED = 426 as HttpStatus;

/**
 * An app too old for this server is told to update before anything else happens to its request,
 * `GET /api/site` included: that is where the app first learns it. Browsers and scripts send no
 * `X-Tapeshelf-Client` and pass.
 */
@Injectable()
export class ClientVersionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const client = parseClient(req.headers[CLIENT_HEADER]);
    const min = client && requiredUpdate(client);
    if (min) {
      throw new AppException(
        UPGRADE_REQUIRED,
        'clientTooOld',
        'errors.clientTooOld',
        {
          details: { platform: client.platform, min },
        },
      );
    }
    return true;
  }
}

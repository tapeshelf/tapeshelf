import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import { BillingConfigDto, BillingPortalDto } from './billing.dto.js';
import { BillingService } from './billing.service.js';

/** Pro subscriptions; every route answers 404 on a self-hosted instance. */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Pro prices and the Paddle.js settings' })
  @ApiOkResponse({ type: BillingConfigDto })
  checkoutConfig(): Promise<BillingConfigDto> {
    return this.billing.checkoutConfig();
  }

  @Post('portal')
  @ApiCookieAuth()
  @RateLimit('billingPortal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'A signed-in link to Paddle’s portal: plan, card, invoices, cancel',
  })
  @ApiOkResponse({ type: BillingPortalDto })
  portal(@CurrentUser() user: RequestUser): Promise<BillingPortalDto> {
    return this.billing.portal(user);
  }

  /** Paddle's notifications: from its addresses and signed, not a browser request (no session, no CSRF header). */
  @Post('webhook')
  @Public()
  @SkipCsrf()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paddle-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.billing.webhook(req.rawBody, signature, req.ip);
    return { received: true };
  }
}

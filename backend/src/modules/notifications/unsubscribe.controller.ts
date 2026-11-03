import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator.js';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RateLimit } from '../../common/rate-limits.js';
import type { Env } from '../../config/env.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { OkDto } from '../auth/auth.dto.js';
import { UnsubscribeInfoDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';
import { readUnsubscribeToken } from './unsubscribe-token.js';

/**
 * Stopping one kind of email from the mail itself: no account session, the signed token is
 * the permission. `POST` is RFC 8058's one-click: a mail provider posts with no cookies and no
 * custom header, so it skips the CSRF guard (the token is what a forged request would lack). `GET`
 * changes nothing, because mail scanners follow links: it leads a person to the page that asks.
 */
@ApiTags('notifications')
@Public()
@Controller('mail')
export class UnsubscribeController {
  private readonly secret: string;

  constructor(
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true });
  }

  @Get('unsubscribe')
  @RateLimit('unsubscribe')
  @Redirect()
  @ApiOperation({
    summary: 'A person following the mail header: on to the page that asks',
  })
  @ApiQuery({ name: 't', type: String })
  open(@Query('t') token: string): { url: string; statusCode: number } {
    return {
      url: `/unsubscribe?t=${encodeURIComponent(token ?? '')}`,
      statusCode: HttpStatus.FOUND,
    };
  }

  @Post('unsubscribe')
  @SkipCsrf()
  @RateLimit('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop this kind of email (RFC 8058 one-click, and the page)',
  })
  @ApiQuery({ name: 't', type: String })
  @ApiOkResponse({ type: OkDto })
  async stop(@Query('t') token: string): Promise<OkDto> {
    const { userId, type } = await this.known(token);
    await this.notifications.setEmailFor(userId, type, false);
    return { ok: true };
  }

  @Post('resubscribe')
  @SkipCsrf()
  @RateLimit('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo: this kind of email again' })
  @ApiQuery({ name: 't', type: String })
  @ApiOkResponse({ type: OkDto })
  async again(@Query('t') token: string): Promise<OkDto> {
    const { userId, type } = await this.known(token);
    await this.notifications.setEmailFor(userId, type, true);
    return { ok: true };
  }

  @Get('unsubscribe/info')
  @RateLimit('unsubscribe')
  @ApiOperation({ summary: 'What a link is about, for its page' })
  @ApiQuery({ name: 't', type: String })
  @ApiOkResponse({ type: UnsubscribeInfoDto })
  async info(@Query('t') token: string): Promise<UnsubscribeInfoDto> {
    const { type, email } = await this.known(token);
    return { type, email };
  }

  private async known(
    token: string,
  ): Promise<{ userId: string; type: NotificationType; email: boolean }> {
    const read = readUnsubscribeToken(this.secret, token);
    const email = read
      ? await this.notifications.emailFor(read.userId, read.type)
      : null;
    if (!read || email === null)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'unsubscribeLinkInvalid',
        'errors.notFound',
      );
    return { ...read, email };
  }
}

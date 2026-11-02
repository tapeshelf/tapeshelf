import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppTokenAccess } from '../../common/decorators/app-token.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { RateLimit } from '../../common/rate-limits.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  AppTokenDto,
  AppTokenIssuedDto,
  ConnectAppDto,
  ConnectAppResultDto,
  ExchangeCodeDto,
  ExtensionContextDto,
} from './app-tokens.dto.js';
import { AppTokensService } from './app-tokens.service.js';

/** Connected apps: the browser extension connects, the person sees and revokes it. */
@ApiTags('app-tokens')
@Controller()
export class AppTokensController {
  constructor(private readonly tokens: AppTokensService) {}

  @Post('app-tokens/connect')
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Allow the extension: a one-time code for its sign-in window (session only)',
  })
  @ApiOkResponse({ type: ConnectAppResultDto })
  @HttpCode(HttpStatus.OK)
  connect(
    @CurrentUser() user: RequestUser,
    @Body() dto: ConnectAppDto,
  ): Promise<ConnectAppResultDto> {
    return this.tokens.connect(sessionOnly(user), dto);
  }

  @Post('app-tokens/token')
  @Public()
  @SkipCsrf()
  @RateLimit('appTokenExchange')
  @ApiOperation({ summary: 'Trade the code and the PKCE verifier for a token' })
  @ApiOkResponse({ type: AppTokenIssuedDto })
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: ExchangeCodeDto): Promise<AppTokenIssuedDto> {
    return this.tokens.exchange(dto);
  }

  @Get('app-tokens')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Connected apps of the current user (session only)',
  })
  @ApiOkResponse({ type: [AppTokenDto] })
  list(@CurrentUser() user: RequestUser): Promise<AppTokenDto[]> {
    return this.tokens.list(sessionOnly(user).id);
  }

  @Delete('app-tokens/current')
  @AppTokenAccess()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The extension disconnects itself' })
  @ApiOkResponse({ type: OkDto })
  async revokeCurrent(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.tokens.revokeCurrent(user);
    return { ok: true };
  }

  @Delete('app-tokens/:id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Disconnect an app (session only)' })
  @ApiOkResponse({ type: OkDto })
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.tokens.revoke(sessionOnly(user).id, id);
    return { ok: true };
  }

  @Get('extension/context')
  @AppTokenAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Who is connected, the limits and the categories: the extension’s form',
  })
  @ApiOkResponse({ type: ExtensionContextDto })
  context(@CurrentUser() user: RequestUser): Promise<ExtensionContextDto> {
    return this.tokens.context(user);
  }
}

/** Routes that manage connections are for the person, never for a connected app itself. */
function sessionOnly(user: RequestUser): RequestUser {
  if (user.appTokenId)
    throw new AppException(
      HttpStatus.FORBIDDEN,
      'appTokenScope',
      'errors.appTokens.scope',
    );
  return user;
}

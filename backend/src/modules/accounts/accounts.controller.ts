import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import { SessionService } from '../auth/session.service.js';
import { DeleteAccountDto } from './accounts.dto.js';
import { AccountsService } from './accounts.service.js';
import { RateLimit } from '../../common/rate-limits.js';

@ApiTags('users')
@Controller('me')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionService,
  ) {}

  @Delete()
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @RateLimit('deleteAccount')
  @ApiOperation({
    summary:
      'Delete my account now and for good (videos go to the admin trash, the username stays reserved)',
  })
  @ApiOkResponse({ type: OkDto })
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.accounts.deleteOwn(user.id, dto);
    this.sessions.clearCookies(res);
    return { ok: true };
  }
}

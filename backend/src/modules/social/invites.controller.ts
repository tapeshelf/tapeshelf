import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import { InviteAcceptDto, InviteDto, InvitePreviewDto } from './invites.dto.js';
import { InvitesService } from './invites.service.js';

/** Inviting to be friends by a link. */
@ApiTags('social')
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('me/invite')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'My invitation link that still works, or a new one',
  })
  @ApiOkResponse({ type: InviteDto })
  mine(@CurrentUser() user: RequestUser): Promise<InviteDto> {
    return this.invites.mine(user.id);
  }

  @Post('me/invite/renew')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'A new invitation link; the old one stops working' })
  @ApiOkResponse({ type: InviteDto })
  renew(@CurrentUser() user: RequestUser): Promise<InviteDto> {
    return this.invites.renew(user.id);
  }

  @Public()
  @Get('invites/:code')
  @ApiOperation({ summary: 'Who invites, and whether the link still works' })
  @ApiOkResponse({ type: InvitePreviewDto })
  preview(@Param('code') code: string): Promise<InvitePreviewDto> {
    return this.invites.preview(code);
  }

  @Post('invites/:code/accept')
  @HttpCode(HttpStatus.OK)
  @RateLimit('follow')
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Become the inviter’s friend; with the email not confirmed yet, once it is',
  })
  @ApiOkResponse({ type: InviteAcceptDto })
  accept(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
  ): Promise<InviteAcceptDto> {
    return this.invites.accept(user.id, code);
  }
}

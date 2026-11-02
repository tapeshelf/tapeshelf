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
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import {
  CreateAnonymousLinkDto,
  MyAnonymousLinkDto,
  MyAnonymousLinksDto,
} from './anonymous-links.dto.js';
import { AnonymousLinksService } from './anonymous-links.service.js';

/**
 * My anonymous links. The shelf behind one opens through the usual calls with
 * `~<code>` in place of a username (users, collection, exchange).
 */
@ApiTags('anonymous-links')
@Controller('me/anonymous-links')
export class AnonymousLinksController {
  constructor(private readonly links: AnonymousLinksService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RateLimit('linkCreate')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'An anonymous link to my shelf (Pro)' })
  @ApiOkResponse({ type: MyAnonymousLinkDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAnonymousLinkDto,
  ): Promise<MyAnonymousLinkDto> {
    return this.links.create(user, dto);
  }

  @Get()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'My anonymous links' })
  @ApiOkResponse({ type: MyAnonymousLinksDto })
  mine(@CurrentUser() user: RequestUser): Promise<MyAnonymousLinksDto> {
    return this.links.mine(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Delete an anonymous link: a 404 from now on' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.links.remove(user.id, id);
  }
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  WhatsNewListDto,
  WhatsNewQueryDto,
  WhatsNewStateDto,
} from './whats-new.dto.js';
import { WhatsNewService } from './whats-new.service.js';

/** "What's new": new videos of the people I follow. */
@ApiTags('social')
@ApiCookieAuth()
@Controller('me/whats-new')
export class WhatsNewController {
  constructor(private readonly whatsNew: WhatsNewService) {}

  @Get()
  @ApiOperation({ summary: 'New videos of the people I follow, newest first' })
  @ApiOkResponse({ type: WhatsNewListDto })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: WhatsNewQueryDto,
  ): Promise<WhatsNewListDto> {
    return this.whatsNew.list(user.id, query);
  }

  @Get('state')
  @ApiOperation({
    summary: 'Whether there is something new since I last looked',
  })
  @ApiOkResponse({ type: WhatsNewStateDto })
  async state(@CurrentUser() user: RequestUser): Promise<WhatsNewStateDto> {
    return { hasNew: await this.whatsNew.hasNew(user.id) };
  }

  @Post('seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'I looked: what is there now is not new any more' })
  @ApiOkResponse({ type: OkDto })
  async seen(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.whatsNew.markSeen(user.id);
    return { ok: true };
  }
}

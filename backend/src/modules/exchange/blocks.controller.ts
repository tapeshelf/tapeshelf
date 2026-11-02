import {
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import { BlockedUserDto } from './exchange.dto.js';
import { BlocksService } from './blocks.service.js';

/** Block list. */
@ApiTags('blocks')
@ApiCookieAuth()
@Controller('me/blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @ApiOkResponse({ type: [BlockedUserDto] })
  list(@CurrentUser() user: RequestUser): Promise<BlockedUserDto[]> {
    return this.blocks.list(user.id);
  }

  @Post(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Block a user: no requests from them; open requests between you close',
  })
  @ApiOkResponse({ type: OkDto })
  async block(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<OkDto> {
    await this.blocks.block(user.id, userId);
    return { ok: true };
  }

  @Delete(':userId')
  @ApiOkResponse({ type: OkDto })
  async unblock(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<OkDto> {
    await this.blocks.unblock(user.id, userId);
    return { ok: true };
  }
}

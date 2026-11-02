import {
  Body,
  Controller,
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
import {
  BulkResultDto,
  DeleteVideosDto,
} from '../collection/collection.dto.js';
import { TrashListDto } from './trash.dto.js';
import { TrashService } from './trash.service.js';

/** The owner's trash: deleted videos that can still come back. */
@ApiTags('collection')
@ApiCookieAuth()
@Controller('me/trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  @ApiOperation({ summary: 'My deleted videos that can still be restored' })
  @ApiOkResponse({ type: TrashListDto })
  list(@CurrentUser() user: RequestUser): Promise<TrashListDto> {
    return this.trash.list(user);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bring a deleted video back (if the shelf has room for it)',
  })
  @ApiOkResponse({ type: OkDto })
  async restore(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.trash.restore(user, id);
    return { ok: true };
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Let these go now: they can no longer be restored',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async remove(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteVideosDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.trash.remove(user, dto.videoIds) };
  }

  @Post('empty')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Empty the trash: nothing in it can be restored any more',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async empty(@CurrentUser() user: RequestUser): Promise<BulkResultDto> {
    return { updated: await this.trash.empty(user) };
  }
}

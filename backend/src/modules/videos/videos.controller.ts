import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  AddToCollectionDto,
  ListMineQueryDto,
  SetThumbnailDto,
  UpdateHoldingDto,
  UpdateVideoDto,
  VideoContextDto,
  VideoDetailDto,
  VideoListDto,
} from './videos.dto.js';
import { VideosService } from './videos.service.js';

@ApiTags('videos')
@ApiCookieAuth()
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get('mine')
  @ApiOperation({
    summary: 'Videos uploaded by the current user, newest first',
  })
  @ApiOkResponse({ type: VideoListDto })
  listMine(
    @CurrentUser() user: RequestUser,
    @Query() query: ListMineQueryDto,
  ): Promise<VideoListDto> {
    return this.videos.listMine(user.id, query);
  }

  @Public()
  @Get('code/:code')
  @ApiOperation({
    summary:
      'A video by its short code (/<code> links) and the page it opens in',
  })
  @ApiOkResponse({ type: VideoContextDto })
  byCode(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
  ): Promise<VideoContextDto> {
    return this.videos.context(user, { code });
  }

  @Public()
  @Get(':id/context')
  @ApiOperation({
    summary: 'Which user page an old /v/:id link should open in',
  })
  @ApiOkResponse({ type: VideoContextDto })
  context(
    @OptionalUser() user: RequestUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoContextDto> {
    return this.videos.context(user, { id });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Own video with its extracted frames' })
  @ApiOkResponse({ type: VideoDetailDto })
  getOwn(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoDetailDto> {
    return this.videos.getOwnDto(user.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @ApiOkResponse({ type: VideoDetailDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoDetailDto> {
    return this.videos.update(user.id, id, dto);
  }

  @Put(':id/thumbnail')
  @RequireVerifiedEmail()
  @ApiOperation({
    summary:
      'Choose the thumbnail: a frame index (instant) or a timestamp (background job)',
  })
  @ApiOkResponse({ type: VideoDetailDto })
  setThumbnail(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetThumbnailDto,
  ): Promise<VideoDetailDto> {
    return this.videos.setThumbnail(user.id, id, dto);
  }

  @Delete(':id')
  @RequireVerifiedEmail()
  @ApiOperation({
    summary:
      'Delete own video (soft delete: it disappears for everyone, admins can purge later)',
  })
  @ApiOkResponse({ type: OkDto })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.videos.softDelete(user, id);
    return { ok: true };
  }

  @Post(':id/collection')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a public video to my collection (bookmark)' })
  @ApiOkResponse({ type: OkDto })
  async addToCollection(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddToCollectionDto,
  ): Promise<OkDto> {
    await this.videos.addToCollection(user, id, dto.code);
    return { ok: true };
  }

  @Patch(':id/holding')
  @ApiOperation({
    summary: 'My holding of this video: hide/show (received only) and category',
  })
  @ApiOkResponse({ type: OkDto })
  async updateHolding(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHoldingDto,
  ): Promise<OkDto> {
    await this.videos.updateHolding(user, id, dto);
    return { ok: true };
  }
}

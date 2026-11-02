import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import { VideosService } from '../videos/videos.service.js';
import {
  BulkResultDto,
  DeleteVideosDto,
  DuplicateCheckDto,
  DuplicateCheckResultDto,
  DuplicateGroupsDto,
  InboxDoneDto,
  RenameManyDto,
  SetFeaturedDto,
  MoveDto,
  OrderDto,
  UpdateHoldingsDto,
  UpdateVideosDto,
} from './collection.dto.js';
import { MyCollectionService } from './my-collection.service.js';

/** Bulk actions of the file-manager view. */
@ApiTags('collection')
@ApiCookieAuth()
@Controller('me/collection')
export class MyCollectionController {
  constructor(
    private readonly mine: MyCollectionService,
    private readonly videos: VideosService,
  ) {}

  @Post('inbox/done')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Keep Inbox videos as they are, without a category',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async inboxDone(
    @CurrentUser() user: RequestUser,
    @Body() dto: InboxDoneDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.mine.inboxDone(user, dto.videoIds) };
  }

  @Patch('titles')
  @ApiOperation({
    summary:
      'New titles at once (a cleanup): own videos are renamed, received ones get my name',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async renameMany(
    @CurrentUser() user: RequestUser,
    @Body() dto: RenameManyDto,
  ): Promise<BulkResultDto> {
    const sources = await this.mine.sources(
      user.id,
      dto.items.map((i) => i.videoId),
    );
    let updated = 0;
    for (const item of dto.items) {
      const source = sources.get(item.videoId);
      if (!source) continue;
      if (source === 'AUTHOR')
        await this.videos.update(user.id, item.videoId, { title: item.title });
      else
        await this.videos.updateHolding(user, item.videoId, {
          title: item.title,
        });
      updated++;
    }
    return { updated };
  }

  @Post('duplicates/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Which files about to be uploaded are on my shelf already',
  })
  @ApiOkResponse({ type: DuplicateCheckResultDto })
  duplicatesCheck(
    @CurrentUser() user: RequestUser,
    @Body() dto: DuplicateCheckDto,
  ): Promise<DuplicateCheckResultDto> {
    return this.mine.duplicatesCheck(user, dto);
  }

  @Get('duplicates')
  @ApiOperation({
    summary: 'Videos of my shelf that look like the same one',
  })
  @ApiOkResponse({ type: DuplicateGroupsDto })
  duplicates(@CurrentUser() user: RequestUser): Promise<DuplicateGroupsDto> {
    return this.mine.duplicateGroups(user);
  }

  @Patch('holdings')
  @ApiOperation({
    summary: 'Move videos to a category and/or hide/show received ones',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async updateHoldings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateHoldingsDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.mine.updateHoldings(user, dto) };
  }

  @Patch('videos')
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Change visibility / download permission of my own videos',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async updateVideos(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateVideosDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.videos.bulkUpdate(user, dto) };
  }

  @Post('videos/delete')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete my own videos (soft delete, like DELETE /videos/:id)',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async deleteVideos(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteVideosDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.videos.softDeleteMany(user, dto.videoIds) };
  }

  @Post('videos/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Take received videos off my shelf: only my copy goes, the video stays with its author and other holders',
  })
  @ApiOkResponse({ type: BulkResultDto })
  async removeVideos(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteVideosDto,
  ): Promise<BulkResultDto> {
    return { updated: await this.mine.removeReceived(user, dto.videoIds) };
  }

  @Put('featured')
  @ApiOperation({
    summary:
      'The “Featured” strip of my page: pin, unpin and reorder in one',
  })
  @ApiOkResponse({ type: OkDto })
  async setFeatured(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetFeaturedDto,
  ): Promise<OkDto> {
    await this.mine.setFeatured(user, dto.keys);
    return { ok: true };
  }

  @Put('order')
  @ApiOperation({ summary: 'Manual order of my videos (drag and drop)' })
  @ApiOkResponse({ type: OkDto })
  async order(
    @CurrentUser() user: RequestUser,
    @Body() dto: OrderDto,
  ): Promise<OkDto> {
    await this.mine.order(user, dto.videoIds);
    return { ok: true };
  }

  @Post('order/move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move videos (and whole stacks) next to another video on my shelf',
  })
  @ApiOkResponse({ type: OkDto })
  async move(
    @CurrentUser() user: RequestUser,
    @Body() dto: MoveDto,
  ): Promise<OkDto> {
    await this.mine.move(user, dto);
    return { ok: true };
  }
}

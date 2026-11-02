import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  CollectionBucketsDto,
  CollectionBucketsQueryDto,
  CollectionDto,
  CollectionQueryDto,
  CollectionSummaryDto,
  FeaturedDto,
  ShelfFoldersDto,
  VideoPageDto,
} from './collection.dto.js';
import { CollectionService } from './collection.service.js';

/** Public (guest-readable) views of a user's page; access rules decide what each viewer sees. */
@ApiTags('collection')
@Public()
@Controller('users/:username')
export class CollectionController {
  constructor(private readonly collection: CollectionService) {}

  @Get('collection')
  @ApiOperation({
    summary:
      'Videos on a user’s page: visitor sections or the owner’s full list',
  })
  @ApiOkResponse({ type: CollectionDto })
  list(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
    @Query() query: CollectionQueryDto,
  ): Promise<CollectionDto> {
    return this.collection.collection(user, username, query);
  }

  @Get('collection/buckets')
  @ApiOperation({
    summary:
      'How the listing divides: months added (newest first) or first letters (by title)',
  })
  @ApiOkResponse({ type: CollectionBucketsDto })
  buckets(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
    @Query() query: CollectionBucketsQueryDto,
  ): Promise<CollectionBucketsDto> {
    return this.collection.buckets(user, username, query);
  }

  @Get('collection/summary')
  @ApiOperation({ summary: 'Folder and category counts of a user’s page' })
  @ApiOkResponse({ type: CollectionSummaryDto })
  summary(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
  ): Promise<CollectionSummaryDto> {
    return this.collection.summary(user, username);
  }

  @Get('collection/featured')
  @ApiOperation({
    summary: 'The owner’s “Featured” strip on top of “All videos”',
  })
  @ApiOkResponse({ type: FeaturedDto })
  featured(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
  ): Promise<FeaturedDto> {
    return this.collection.featured(user, username);
  }

  @Get('collection/folders')
  @ApiOperation({
    summary: 'The categories as cards of the “Folders” view',
  })
  @ApiOkResponse({ type: ShelfFoldersDto })
  folders(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
  ): Promise<ShelfFoldersDto> {
    return this.collection.folders(user, username);
  }

  @Get('videos/:videoId')
  @ApiOperation({
    summary:
      'A video in the context of this page, with what the viewer may do with it',
  })
  @ApiOkResponse({ type: VideoPageDto })
  video(
    @OptionalUser() user: RequestUser | undefined,
    @Param('username') username: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<VideoPageDto> {
    return this.collection.videoPage(user, username, videoId);
  }
}

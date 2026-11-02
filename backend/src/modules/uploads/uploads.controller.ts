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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AppTokenAccess } from '../../common/decorators/app-token.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import { VideoDto } from '../videos/videos.dto.js';
import {
  CompleteUploadDto,
  CreateUploadDto,
  PresignedPartsDto,
  StorageQuotaDto,
  UploadPartsDto,
  UploadSessionDto,
} from './uploads.dto.js';
import { UploadsService } from './uploads.service.js';
import { RateLimit } from '../../common/rate-limits.js';

/** Every route here also takes the browser extension's token: it saves videos by uploading. */
@ApiTags('uploads')
@ApiCookieAuth()
@ApiBearerAuth()
@AppTokenAccess()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get('quota')
  @ApiOkResponse({ type: StorageQuotaDto })
  quota(@CurrentUser() user: RequestUser): Promise<StorageQuotaDto> {
    return this.uploads.quota(user);
  }

  @Get()
  @ApiOperation({
    summary:
      'Unfinished uploads of the current user (for resuming after a reload)',
  })
  @ApiOkResponse({ type: [UploadSessionDto] })
  listActive(@CurrentUser() user: RequestUser): Promise<UploadSessionDto[]> {
    return this.uploads.listActive(user);
  }

  @Post()
  @RequireVerifiedEmail()
  @RateLimit('uploadStart')
  @ApiOperation({
    summary:
      'Start a multipart upload (checks file size limit and storage quota)',
  })
  @ApiOkResponse({ type: UploadSessionDto })
  @HttpCode(HttpStatus.OK)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateUploadDto,
  ): Promise<UploadSessionDto> {
    return this.uploads.create(user, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: UploadSessionDto })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UploadSessionDto> {
    return this.uploads.get(user, id);
  }

  @Post(':id/parts')
  @RequireVerifiedEmail()
  @RateLimit('uploadParts')
  @ApiOperation({ summary: 'Presigned PUT URLs for a batch of parts' })
  @ApiOkResponse({ type: PresignedPartsDto })
  @HttpCode(HttpStatus.OK)
  presignParts(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadPartsDto,
  ): Promise<PresignedPartsDto> {
    return this.uploads.presignParts(user, id, dto.partNumbers, dto.track);
  }

  @Post(':id/complete')
  @RequireVerifiedEmail()
  @RateLimit('uploadComplete')
  @ApiOperation({
    summary: 'Finish the upload: creates the video and queues processing',
  })
  @ApiOkResponse({ type: VideoDto })
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<VideoDto> {
    return this.uploads.complete(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel an unfinished upload' })
  @ApiOkResponse({ type: OkDto })
  async abort(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.uploads.abort(user, id);
    return { ok: true };
  }
}

import {
  Body,
  Controller,
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
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import {
  OfflineCheckDto,
  OfflineCheckRequestDto,
  OfflineCopyDto,
  OfflineQuoteDto,
  OfflineQuoteRequestDto,
} from './offline.dto.js';
import { OfflineService } from './offline.service.js';

/** Videos saved to the phone app for watching without a network. */
@ApiTags('offline')
@ApiCookieAuth()
@Controller()
export class OfflineController {
  constructor(private readonly offline: OfflineService) {}

  @RateLimit('offlineQuote')
  @Post('offline/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'What saving these videos to the phone would take: sizes, which cost traffic, what is left',
  })
  @ApiOkResponse({ type: OfflineQuoteDto })
  quote(
    @CurrentUser() user: RequestUser,
    @Body() body: OfflineQuoteRequestDto,
  ): Promise<OfflineQuoteDto> {
    return this.offline.quote(user, body.videoIds);
  }

  @RateLimit('offlineSave')
  @Post('videos/:id/offline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Save a video to the phone: its playlist, segment links and key; charged like a view the first time, free again within a week',
  })
  @ApiOkResponse({ type: OfflineCopyDto })
  @ApiTooManyRequestsResponse({
    description: 'trafficLimitReached; details.resetAt',
  })
  save(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfflineCopyDto> {
    return this.offline.save(user, id);
  }

  @RateLimit('offlineCheck')
  @Post('offline/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'The phone’s copies against the server: keep, remove (no longer watchable) or update (edited)',
  })
  @ApiOkResponse({ type: OfflineCheckDto })
  check(
    @CurrentUser() user: RequestUser,
    @Body() body: OfflineCheckRequestDto,
  ): Promise<OfflineCheckDto> {
    return this.offline.check(user, body.copies);
  }
}

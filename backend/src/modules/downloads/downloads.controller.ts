import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import { ThrottleStream } from './download-rules.js';
import { DownloadInfoDto, DownloadTicketDto } from './downloads.dto.js';
import { DownloadsService, SLOT_HEARTBEAT_MS } from './downloads.service.js';

@ApiTags('downloads')
@ApiCookieAuth()
@Controller()
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get('downloads/:code')
  @ApiOperation({
    summary: 'The wait page: the video, the limits and the user’s standing',
  })
  @ApiOkResponse({ type: DownloadInfoDto })
  info(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
  ): Promise<DownloadInfoDto> {
    return this.downloads.info(user, code);
  }

  @Post('videos/:id/download')
  @RateLimit('download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start a download: a one-time file link (limited tiers) or a storage link (direct)',
  })
  @ApiOkResponse({ type: DownloadTicketDto })
  @ApiTooManyRequestsResponse({
    description:
      'downloadLimitReached (details.resetAt) or downloadBusy (another download is running)',
  })
  ticket(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DownloadTicketDto> {
    return this.downloads.ticket(user, id);
  }

  /** Old-style link: storage for direct downloads, the wait page for limited ones. */
  @Get('videos/:id/download')
  @RateLimit('download')
  @ApiExcludeEndpoint()
  async redirect(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(HttpStatus.FOUND, await this.downloads.redirect(user, id));
  }

  @Get('videos/:id/download/file')
  @RateLimit('downloadFile')
  @ApiExcludeEndpoint()
  async file(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('t') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const dl = await this.downloads.open(user, id, token, range);
    const heartbeat = setInterval(() => void dl.touch(), SLOT_HEARTBEAT_MS);
    res.once('close', () => {
      clearInterval(heartbeat);
      dl.body.destroy();
      void dl.release();
    });
    res.status(dl.status).set(dl.headers);
    // HEAD reaches this GET route too: headers only, the slot freed on 'close'.
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    // A client that goes away mid-file is normal; the slot is freed on 'close' either way.
    const done = () => undefined;
    if (dl.speed > 0)
      pipeline(dl.body, new ThrottleStream(dl.speed), res, done);
    else pipeline(dl.body, res, done);
  }
}

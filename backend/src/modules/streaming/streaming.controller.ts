import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import type { RequestUser } from '../../common/auth/request-user.js';
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PlaybackDto } from './streaming.dto.js';
import { StreamingService } from './streaming.service.js';
import { RateLimit } from '../../common/rate-limits.js';

const M3U8 = 'application/vnd.apple.mpegurl';

@ApiTags('streaming')
@Controller()
export class StreamingController {
  constructor(private readonly streaming: StreamingService) {}

  @Public()
  @RateLimit('playback')
  @Post('videos/:id/playback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start playback: returns the tokenized master playlist URL (guests: public videos only)',
  })
  @ApiOkResponse({ type: PlaybackDto })
  @ApiQuery({
    name: 'source',
    required: false,
    type: Boolean,
    description:
      'The original of an edited video, for its editor (author or admin)',
  })
  playback(
    @OptionalUser() user: RequestUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('source') source?: string,
  ): Promise<PlaybackDto> {
    return this.streaming.createPlayback(
      user,
      id,
      source === 'true' || source === '1',
    );
  }

  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Get('stream/:id/master.m3u8')
  async master(
    @OptionalUser() user: RequestUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('t') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.streaming.masterPlaylist(id, token, user);
    res.type(M3U8).setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }

  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Get('stream/:id/index.m3u8')
  async media(
    @OptionalUser() user: RequestUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('t') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.streaming.mediaPlaylist(id, token, user);
    res.type(M3U8).setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }

  @Public()
  @RateLimit('streamKey')
  @ApiExcludeEndpoint()
  @Get('stream/:id/key')
  async key(
    @OptionalUser() user: RequestUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('t') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const key = await this.streaming.key(id, token, user);
    res
      .type('application/octet-stream')
      .setHeader('Cache-Control', 'private, max-age=60');
    res.send(key);
  }
}

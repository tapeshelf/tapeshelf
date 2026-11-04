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
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream';

import type {
  AppRequest,
  RequestUser,
} from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { localeFromAcceptLanguage } from '../../common/i18n/i18n.js';
import { RateLimit } from '../../common/rate-limits.js';
import type { Env } from '../../config/env.js';
import { PlaybackDto } from '../streaming/streaming.dto.js';
import {
  CreateLinkDto,
  LinkPageDto,
  MyLinkDto,
  SaveLinkDto,
  SaveLinkResultDto,
  UnlockLinkDto,
} from './links.dto.js';
import { type LinkPass, LinksService } from './links.service.js';

const CODE = /^[A-Za-z0-9_-]{12}$/;

/** Temporary links: mine, and the page of one for whoever has it. */
@ApiTags('links')
@Controller()
export class LinksController {
  private readonly secure: boolean;

  constructor(
    private readonly links: LinksService,
    config: ConfigService<Env, true>,
  ) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Post('me/links')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RateLimit('linkCreate')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'A temporary link to some of my videos (Pro)' })
  @ApiOkResponse({ type: MyLinkDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateLinkDto,
  ): Promise<MyLinkDto> {
    return this.links.create(user, dto);
  }

  @Get('me/links')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'My temporary links that still work' })
  @ApiOkResponse({ type: [MyLinkDto] })
  mine(@CurrentUser() user: RequestUser): Promise<MyLinkDto[]> {
    return this.links.mine(user.id);
  }

  @Delete('me/links/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Take a link back: it is a 404 from now on' })
  @ApiNoContentResponse()
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.links.revoke(user.id, id);
  }

  @Public()
  @Get('links/:code')
  @ApiOperation({
    summary:
      'The page of a link: who sends, until when, and the videos once it is open to this browser',
  })
  @ApiOkResponse({ type: LinkPageDto })
  page(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Req() req: AppRequest,
  ): Promise<LinkPageDto> {
    return this.links.page(checked(code), user, passOf(req, code));
  }

  @Public()
  @Post('links/:code/unlock')
  @HttpCode(HttpStatus.OK)
  @RateLimit('linkUnlock')
  @ApiOperation({
    summary: 'The password or the emailed code; this browser remembers it',
  })
  @ApiOkResponse({ type: LinkPageDto })
  async unlock(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Body() dto: UnlockLinkDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LinkPageDto> {
    const { pass, page } = await this.links.unlock(
      checked(code),
      user,
      passOf(req, code),
      dto,
    );
    res.cookie(passCookie(code), JSON.stringify(pass), {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      signed: true,
      path: `/api/links/${code}`,
      maxAge: Math.max(0, new Date(page.expiresAt).getTime() - Date.now()),
    });
    return page;
  }

  @Public()
  @Post('links/:code/code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('linkCode')
  @ApiOperation({ summary: 'Send a code to the address the link is for' })
  @ApiNoContentResponse()
  async sendCode(
    @Param('code') code: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.links.sendCode(
      checked(code),
      req.locale ?? localeFromAcceptLanguage(req.headers['accept-language']),
    );
  }

  @Public()
  @Post('links/:code/videos/:videoId/playback')
  @HttpCode(HttpStatus.OK)
  @RateLimit('playback')
  @ApiOperation({ summary: 'Play a video of the link' })
  @ApiOkResponse({ type: PlaybackDto })
  playback(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Req() req: AppRequest,
  ): Promise<PlaybackDto> {
    return this.links.playback(
      checked(code),
      videoId,
      user,
      passOf(req, code),
      { guestId: req.guestId, ip: req.ip },
    );
  }

  @Public()
  @Get('links/:code/videos/:videoId/download')
  @RateLimit('linkDownload')
  @ApiOperation({
    summary:
      'Browser navigation: the file straight from storage, at full speed',
  })
  async download(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Req() req: AppRequest,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.links.download(
      checked(code),
      videoId,
      user,
      passOf(req, code),
      { guestId: req.guestId, ip: req.ip },
      req.method !== 'HEAD',
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(HttpStatus.FOUND, url);
  }

  @Public()
  @Get('links/:code/zip')
  @RateLimit('linkZip')
  @ApiOperation({ summary: 'Browser navigation: every video in one ZIP' })
  @ApiProduces('application/zip')
  async zip(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Req() req: AppRequest,
    @Res() res: Response,
  ): Promise<void> {
    const zip = await this.links.zip(
      checked(code),
      user,
      passOf(req, code),
      { guestId: req.guestId, ip: req.ip },
      req.method !== 'HEAD',
    );
    res.status(HttpStatus.OK).set({
      'Content-Type': 'application/zip',
      'Content-Length': String(zip.size),
      'Content-Disposition': `attachment; filename="${zip.filename.replace(/[^\w.-]+/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    });
    // HEAD reaches this GET route too: the archive is never begun, or the whole of it would be
    // read from the storage and thrown away.
    if (req.method === 'HEAD') {
      zip.body.destroy();
      res.end();
      return;
    }
    // A broken source or a closed tab ends the stream; the archive is simply cut off.
    pipeline(zip.body, res, () => undefined);
  }

  @Post('links/:code/save')
  // Adding to a shelf, as everywhere else, waits for a confirmed email.
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Put videos of the link on my shelf, as a copy the sender shared',
  })
  @ApiOkResponse({ type: SaveLinkResultDto })
  save(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body() dto: SaveLinkDto,
    @Req() req: AppRequest,
  ): Promise<SaveLinkResultDto> {
    return this.links.save(checked(code), user, passOf(req, code), dto);
  }
}

const passCookie = (code: string) => `tl_${code}`;

/** A code that cannot be one is a 404 like any other link that does not exist. */
function checked(code: string): string {
  if (!CODE.test(code))
    throw new AppException(
      HttpStatus.NOT_FOUND,
      'linkNotFound',
      'errors.links.notFound',
    );
  return code;
}

function passOf(req: AppRequest, code: string): LinkPass | null {
  const raw = req.signedCookies?.[passCookie(code)];
  if (typeof raw !== 'string') return null;
  try {
    const pass = JSON.parse(raw) as LinkPass;
    return typeof pass?.l === 'string' ? pass : null;
  } catch {
    return null;
  }
}

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
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type {
  AppRequest,
  RequestUser,
} from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import { OkDto } from '../auth/auth.dto.js';
import { PlaybackDto } from '../streaming/streaming.dto.js';
import { PresignedPartsDto, UploadSessionDto } from '../uploads/uploads.dto.js';
import {
  CreateExchangeLinkDto,
  ExchangeInviteDto,
  GuestAcceptDto,
  GuestCounterDto,
  GuestDealDto,
  GuestDealStartedDto,
  GuestDeclineDto,
  GuestEmailDto,
  GuestKeyDto,
  GuestSendDto,
  GuestUploadCompleteDto,
  GuestUploadPartsDto,
  GuestUploadStartDto,
  MyExchangeLinkDto,
  StartGuestDealDto,
} from './deals.dto.js';
import { ExchangeLinksService } from './exchange-links.service.js';
import { GuestDealsService } from './guest-deals.service.js';
import { GUEST_COOKIE } from './guest-keys.js';

/** Links for an exchange: the owner's side. */
@ApiTags('deals')
@ApiCookieAuth()
@Controller('me/exchange-links')
export class ExchangeLinksController {
  constructor(private readonly links: ExchangeLinksService) {}

  @Post()
  @RateLimit('linkCreate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'A link offering these videos for an exchange (the same set: the same link)',
  })
  @ApiOkResponse({ type: MyExchangeLinkDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateExchangeLinkDto,
  ): Promise<MyExchangeLinkDto> {
    return this.links.create(user, dto.videoIds);
  }

  @Get()
  @ApiOkResponse({ type: MyExchangeLinkDto, isArray: true })
  mine(@CurrentUser() user: RequestUser): Promise<MyExchangeLinkDto[]> {
    return this.links.mine(user.id);
  }

  @Delete(':id')
  @ApiOkResponse({ type: OkDto })
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.links.revoke(user.id, id);
    return { ok: true };
  }
}

/** The page of an exchange link and everything a guest does in their deal. */
@ApiTags('deals')
@Controller()
export class DealsController {
  constructor(
    private readonly links: ExchangeLinksService,
    private readonly guests: GuestDealsService,
  ) {}

  @Public()
  @Get('exchange-links/:code')
  @ApiOperation({ summary: 'Who offers which videos for an exchange' })
  @ApiOkResponse({ type: ExchangeInviteDto })
  async invite(
    @OptionalUser() user: RequestUser | undefined,
    @Param('code') code: string,
    @Req() req: AppRequest,
  ): Promise<ExchangeInviteDto> {
    // The deal going on from here: this browser's guest's, or the signed-in person's own (a deal
    // started as a guest moves into the account on sign-in, and the old link still leads to it).
    const guest = user ? null : await this.guests.guestOf(req);
    return this.links.invite(
      code,
      user,
      (from) => this.guests.dealFrom(user?.id ?? guest?.id ?? null, from),
      await this.guests.guestFileBytes(),
    );
  }

  @Public()
  @Get('exchange-offers/:holder/:code')
  @ApiOperation({
    summary:
      'One private video on a holder’s shelf, offered for an exchange',
  })
  @ApiOkResponse({ type: ExchangeInviteDto })
  async single(
    @OptionalUser() user: RequestUser | undefined,
    @Param('holder') holder: string,
    @Param('code') code: string,
    @Req() req: AppRequest,
  ): Promise<ExchangeInviteDto> {
    const guest = user ? null : await this.guests.guestOf(req);
    return this.links.single(
      holder,
      code,
      user,
      (from) => this.guests.dealFrom(user?.id ?? guest?.id ?? null, from),
      await this.guests.guestFileBytes(),
    );
  }

  @Public()
  @Post('guest/deals')
  @RateLimit('guestDeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'A guest starts a deal (a draft): from an exchange link or a private video; sets the guest’s cookie',
  })
  @ApiOkResponse({ type: GuestDealStartedDto })
  start(
    @Body() dto: StartGuestDealDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuestDealStartedDto> {
    return this.guests.start(req, res, dto);
  }

  @Public()
  @Post('guest/claim')
  @RateLimit('guestDeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A deal’s link opened elsewhere: its key lets this browser in',
  })
  @ApiOkResponse({ type: OkDto })
  async claim(
    @Body() dto: GuestKeyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.guests.claim(dto.key, res);
    return { ok: true };
  }

  /** A signed-in person who was a guest in this browser: their deals and videos move over. */
  @Post('guest/adopt')
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OkDto })
  async adopt(
    @CurrentUser() user: RequestUser,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    const guest = await this.guests.guestOf(req);
    if (guest) await this.guests.adopt(guest.id, user.id);
    if (req.cookies?.[GUEST_COOKIE]) this.guests.clearCookie(res);
    return { ok: true };
  }

  @Public()
  @Get('guest/deals/:id')
  @ApiOkResponse({ type: GuestDealDto })
  async view(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    const guest = await this.guests.mustGuest(req);
    return this.guests.view(await this.guests.keepLocale(guest, req), id);
  }

  @Public()
  @Post('guest/deals/:id/email')
  @RateLimit('resendVerification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Where to hear about the deal (no confirmation); the deal’s link goes there',
  })
  @ApiOkResponse({ type: GuestDealDto })
  async email(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestEmailDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    const guest = await this.guests.mustGuest(req);
    await this.guests.setEmail(guest, id, dto.email);
    return this.guests.view(await this.guests.mustGuest(req), id);
  }

  @Public()
  @Post('guest/deals/:id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send the draft: it reaches the holder once the videos are ready',
  })
  @ApiOkResponse({ type: GuestDealDto })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestSendDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.send(await this.guests.mustGuest(req), id, dto.message);
  }

  @Public()
  @Post('guest/deals/:id/uploads')
  @RateLimit('uploadStart')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UploadSessionDto })
  async uploadStart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestUploadStartDto,
    @Req() req: AppRequest,
  ): Promise<UploadSessionDto> {
    return this.guests.uploadStart(await this.guests.mustGuest(req), id, dto);
  }

  @Public()
  @Post('guest/deals/:id/uploads/:sessionId/parts')
  @RateLimit('uploadParts')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PresignedPartsDto })
  async uploadParts(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: GuestUploadPartsDto,
    @Req() req: AppRequest,
  ): Promise<PresignedPartsDto> {
    return this.guests.uploadParts(
      await this.guests.mustGuest(req),
      sessionId,
      dto.partNumbers,
    );
  }

  @Public()
  @Post('guest/deals/:id/uploads/:sessionId/complete')
  @RateLimit('uploadComplete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuestDealDto })
  async uploadComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: GuestUploadCompleteDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.uploadComplete(
      await this.guests.mustGuest(req),
      id,
      sessionId,
      dto,
    );
  }

  @Public()
  @Delete('guest/deals/:id/videos/:videoId')
  @ApiOperation({
    summary: 'An upload not on the table: deleted and erased at once',
  })
  @ApiOkResponse({ type: GuestDealDto })
  async removeUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.removeUpload(
      await this.guests.mustGuest(req),
      id,
      videoId,
    );
  }

  @Public()
  @Post('guest/deals/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuestDealDto })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestAcceptDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.accept(
      await this.guests.mustGuest(req),
      id,
      dto.offerId,
    );
  }

  @Public()
  @Post('guest/deals/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuestDealDto })
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestDeclineDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.decline(
      await this.guests.mustGuest(req),
      id,
      dto.comment,
    );
  }

  @Public()
  @Post('guest/deals/:id/counter')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GuestDealDto })
  async counter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestCounterDto,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto> {
    return this.guests.counter(await this.guests.mustGuest(req), id, dto);
  }

  @Public()
  @Post('guest/deals/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw; a draft the holder never saw is gone (null)',
  })
  @ApiOkResponse({ type: GuestDealDto })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<GuestDealDto | null> {
    return this.guests.cancel(await this.guests.mustGuest(req), id);
  }

  @Public()
  @Post('guest/deals/:id/videos/:videoId/playback')
  @RateLimit('playback')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PlaybackDto })
  async playback(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Req() req: AppRequest,
  ): Promise<PlaybackDto> {
    return this.guests.playback(await this.guests.mustGuest(req), id, videoId);
  }

  @Public()
  @Get('guest/deals/:id/videos/:videoId/download')
  @RateLimit('linkDownload')
  @ApiOperation({
    summary: 'Browser navigation: the file straight from storage',
  })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Req() req: AppRequest,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.guests.download(
      await this.guests.mustGuest(req),
      id,
      videoId,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(HttpStatus.FOUND, url);
  }
}

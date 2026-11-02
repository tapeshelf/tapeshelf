import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import {
  AcceptOfferDto,
  CounterOfferDto,
  CreateRequestDto,
  CreateRequestResultDto,
  DeclineRequestDto,
  ExchangeListQueryDto,
  ExchangeSummaryDto,
  HintStateDto,
  OfferOptionsDto,
  OfferableDto,
  RequestDetailDto,
  RequestListDto,
} from './exchange.dto.js';
import { ExchangeService } from './exchange.service.js';
import { RateLimit } from '../../common/rate-limits.js';

@ApiTags('exchange')
@ApiCookieAuth()
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchange: ExchangeService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Counters for the navigation (requests awaiting me, my open ones)',
  })
  @ApiOkResponse({ type: ExchangeSummaryDto })
  summary(@CurrentUser() user: RequestUser): Promise<ExchangeSummaryDto> {
    return this.exchange.summary(user.id);
  }

  @Get()
  @ApiOperation({
    summary:
      'Incoming (awaiting me), outgoing (awaiting them) or finished requests',
  })
  @ApiOkResponse({ type: RequestListDto })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ExchangeListQueryDto,
  ): Promise<RequestListDto> {
    return this.exchange.list(user.id, query);
  }

  @Get('hint')
  @ApiOperation({
    summary: 'State of the "how requests work" hint',
  })
  @ApiOkResponse({ type: HintStateDto })
  hint(@CurrentUser() user: RequestUser): Promise<HintStateDto> {
    return this.exchange.hint(user.id);
  }

  @Post('hint/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: HintStateDto })
  hintSeen(@CurrentUser() user: RequestUser): Promise<HintStateDto> {
    return this.exchange.hintSeen(user.id);
  }

  @Post('hint/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Allowed once the hint was shown enough times' })
  @ApiOkResponse({ type: HintStateDto })
  hintDismiss(@CurrentUser() user: RequestUser): Promise<HintStateDto> {
    return this.exchange.hintDismiss(user.id);
  }

  @Post()
  @RequireVerifiedEmail()
  @RateLimit('exchangeCreate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request one or more videos from a page holder (round 0)',
  })
  @ApiCreatedResponse({ type: CreateRequestResultDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateRequestDto,
  ): Promise<CreateRequestResultDto> {
    return this.exchange.create(user, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: RequestDetailDto })
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetailDto> {
    return this.exchange.detail(user.id, id);
  }

  @Get('offerable/:username')
  @ApiOperation({
    summary:
      'My videos that may be offered in return when requesting from this person',
  })
  @ApiOkResponse({ type: OfferableDto })
  offerable(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<OfferableDto> {
    return this.exchange.offerableTo(user, username);
  }

  @Get(':id/options')
  @ApiOperation({ summary: 'Videos each side may put into a counter-offer' })
  @ApiOkResponse({ type: OfferOptionsDto })
  options(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferOptionsDto> {
    return this.exchange.options(user.id, id);
  }

  @Post(':id/share')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Holder: give the requested videos for free' })
  @ApiOkResponse({ type: RequestDetailDto })
  share(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetailDto> {
    return this.exchange.share(user, id);
  }

  @Post(':id/block')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Holder: block the requester (closes every open request between you)',
  })
  @ApiOkResponse({ type: RequestDetailDto })
  block(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetailDto> {
    return this.exchange.block(user, id);
  }

  @Post(':id/accept')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Awaiting side: accept the current offer (409 if it changed)',
  })
  @ApiOkResponse({ type: RequestDetailDto })
  accept(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptOfferDto,
  ): Promise<RequestDetailDto> {
    return this.exchange.accept(user, id, dto.offerId);
  }

  @Post(':id/decline')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Awaiting side: decline (starts the cooldown for the requester)',
  })
  @ApiOkResponse({ type: RequestDetailDto })
  decline(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineRequestDto,
  ): Promise<RequestDetailDto> {
    return this.exchange.decline(user, id, dto.comment);
  }

  @Post(':id/counter')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Awaiting side: propose an exchange (new round)' })
  @ApiOkResponse({ type: RequestDetailDto })
  counter(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterOfferDto,
  ): Promise<RequestDetailDto> {
    return this.exchange.counter(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Requester: withdraw the request' })
  @ApiOkResponse({ type: RequestDetailDto })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDetailDto> {
    return this.exchange.cancel(user, id);
  }
}

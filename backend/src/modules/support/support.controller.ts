import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import type { UploadedPicture } from './support-images.js';
import { SupportFaqService } from './support-faq.service.js';
import { SupportOpenGuard } from './support-open.guard.js';
import {
  AdminSupportListDto,
  AdminSupportQueryDto,
  AdminSupportReplyDto,
  AdminSupportTicketDto,
  AdminSupportUpdateDto,
  CreateSupportTicketDto,
  SUPPORT_FILE_MAX_BYTES,
  SUPPORT_FILES_MAX,
  SupportFaqItemDto,
  SupportListQueryDto,
  SupportRatingDto,
  SupportReplyDto,
  SupportSummaryDto,
  SupportTicketDto,
  SupportTicketListDto,
  SupportVideoDto,
  SupportVideosQueryDto,
} from './support.dto.js';
import { SupportService } from './support.service.js';

/** Up to five pictures of 10 MB with a message; more or larger is refused by multer (400 / 413). */
const PICTURES = FilesInterceptor('files', SUPPORT_FILES_MAX, {
  limits: { fileSize: SUPPORT_FILE_MAX_BYTES, files: SUPPORT_FILES_MAX },
});

/** A user's support tickets. */
@ApiTags('support')
@ApiCookieAuth()
@UseGuards(SupportOpenGuard)
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly faq: SupportFaqService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'My tickets, the latest activity first' })
  @ApiOkResponse({ type: SupportTicketListDto })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: SupportListQueryDto,
  ): Promise<SupportTicketListDto> {
    return this.support.list(user.id, query);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'How many of my tickets have an answer I have not read',
  })
  @ApiOkResponse({ type: SupportSummaryDto })
  async summary(@CurrentUser() user: RequestUser): Promise<SupportSummaryDto> {
    return { unread: await this.support.unreadCount(user.id) };
  }

  @Get('faq')
  @ApiOperation({
    summary: 'The operator site’s FAQ, for hints while a subject is typed',
  })
  @ApiOkResponse({ type: [SupportFaqItemDto] })
  faqList(@CurrentUser() user: RequestUser): Promise<SupportFaqItemDto[]> {
    return this.faq.list(user.locale);
  }

  @Get('videos')
  @ApiOperation({ summary: 'My own uploads, to attach one to a ticket' })
  @ApiOkResponse({ type: [SupportVideoDto] })
  videos(
    @CurrentUser() user: RequestUser,
    @Query() query: SupportVideosQueryDto,
  ): Promise<SupportVideoDto[]> {
    return this.support.videos(user.id, query.q);
  }

  @Post('tickets')
  @HttpCode(HttpStatus.OK)
  @RateLimit('supportTicket')
  @UseInterceptors(PICTURES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateSupportTicketDto })
  @ApiOperation({
    summary:
      'Open a ticket: a question, a bug report, an account matter or an idea',
  })
  @ApiOkResponse({ type: SupportTicketDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSupportTicketDto,
    @UploadedFiles() files: UploadedPicture[] | undefined,
  ): Promise<SupportTicketDto> {
    return this.support.create(user, dto, files ?? []);
  }

  @Get('tickets/:id')
  @ApiOperation({
    summary: 'A ticket with its messages; what support wrote is read now',
  })
  @ApiOkResponse({ type: SupportTicketDto })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupportTicketDto> {
    return this.support.get(user.id, id);
  }

  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.OK)
  @RateLimit('supportMessage')
  @UseInterceptors(PICTURES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SupportReplyDto })
  @ApiOperation({
    summary: 'Write again: the ticket waits for support (and opens again)',
  })
  @ApiOkResponse({ type: SupportTicketDto })
  reply(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupportReplyDto,
    @UploadedFiles() files: UploadedPicture[] | undefined,
  ): Promise<SupportTicketDto> {
    return this.support.reply(user, id, dto, files ?? []);
  }

  @Post('tickets/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'My question is solved' })
  @ApiOkResponse({ type: SupportTicketDto })
  resolve(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupportTicketDto> {
    return this.support.resolve(user.id, id);
  }

  @Put('tickets/:id/rating')
  @ApiOperation({
    summary: 'Say whether the answer helped (solved or closed tickets)',
  })
  @ApiOkResponse({ type: SupportTicketDto })
  rate(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupportRatingDto,
  ): Promise<SupportTicketDto> {
    return this.support.rate(user.id, id, dto.helped);
  }
}

/** The admins' side of support. */
@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@UseGuards(SupportOpenGuard)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({
    summary:
      'Tickets: waiting for support first, then by priority and activity',
  })
  @ApiOkResponse({ type: AdminSupportListDto })
  list(@Query() query: AdminSupportQueryDto): Promise<AdminSupportListDto> {
    return this.support.adminList(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminSupportTicketDto })
  get(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSupportTicketDto> {
    return this.support.adminGet(id, admin.id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PICTURES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminSupportReplyDto })
  @ApiOperation({
    summary:
      'Answer as "Support" (the author is told) or leave a note for admins',
  })
  @ApiOkResponse({ type: AdminSupportTicketDto })
  reply(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSupportReplyDto,
    @UploadedFiles() files: UploadedPicture[] | undefined,
  ): Promise<AdminSupportTicketDto> {
    return this.support.adminReply(admin, id, dto, files ?? []);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Set the status (solved tells the author) or the priority',
  })
  @ApiOkResponse({ type: AdminSupportTicketDto })
  update(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSupportUpdateDto,
  ): Promise<AdminSupportTicketDto> {
    return this.support.adminUpdate(admin, id, dto);
  }
}

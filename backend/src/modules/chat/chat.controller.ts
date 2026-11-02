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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  ChatUnreadDto,
  ConversationListDto,
  MarkReadDto,
  MessageDto,
  MessagePageDto,
  MessagesQueryDto,
  SendMessageDto,
  ThreadDto,
} from './chat.dto.js';
import { ChatService } from './chat.service.js';
import { RateLimit } from '../../common/rate-limits.js';

/** Messages between friends. */
@ApiTags('chat')
@ApiCookieAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'My conversations, newest first' })
  @ApiOkResponse({ type: ConversationListDto })
  list(@CurrentUser() user: RequestUser): Promise<ConversationListDto> {
    return this.chat.conversations(user.id);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: ChatUnreadDto })
  async unread(@CurrentUser() user: RequestUser): Promise<ChatUnreadDto> {
    return { count: await this.chat.unreadCount(user.id) };
  }

  @Get('with/:username')
  @ApiOperation({
    summary:
      'The conversation with a user (may not exist yet) and whether I can write',
  })
  @ApiOkResponse({ type: ThreadDto })
  thread(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<ThreadDto> {
    return this.chat.thread(user.id, username);
  }

  @Post('with/:username/messages')
  @RequireVerifiedEmail()
  @RateLimit('chatSend')
  @ApiOperation({
    summary:
      'Send a message to a friend; creates the conversation on the first one',
  })
  @ApiOkResponse({ type: MessageDto })
  send(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(user.id, username, dto);
  }

  @Get(':id/messages')
  @ApiOkResponse({ type: MessagePageDto })
  messages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<MessagePageDto> {
    return this.chat.messages(user.id, id, query);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the conversation read up to a message' })
  @ApiOkResponse({ type: OkDto })
  async read(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReadDto,
  ): Promise<OkDto> {
    await this.chat.markRead(user.id, id, dto.messageId);
    return { ok: true };
  }
}

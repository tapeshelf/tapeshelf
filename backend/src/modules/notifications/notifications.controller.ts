import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { OkDto } from '../auth/auth.dto.js';
import {
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationsQueryDto,
  UnreadCountDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiCookieAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'My notifications, newest first' })
  @ApiOkResponse({ type: NotificationListDto })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(user.id, query);
  }

  @Get('notifications/unread-count')
  @ApiOkResponse({ type: UnreadCountDto })
  async unread(@CurrentUser() user: RequestUser): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OkDto })
  async readAll(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.notifications.markAllRead(user.id);
    return { ok: true };
  }

  /** Opening a request's thread: its notifications are dealt with, as a chat's are when read. */
  @Post('notifications/requests/:requestId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OkDto })
  async readRequest(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<OkDto> {
    await this.notifications.markRequestRead(user.id, requestId);
    return { ok: true };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OkDto })
  async read(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  @Get('me/notification-preferences')
  @ApiOperation({
    summary: 'Channel switches per notification type (in-app / email)',
  })
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  preferences(
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationPreferenceDto[]> {
    return this.notifications.getPreferences(user.id, user.role === 'ADMIN');
  }

  @Put('me/notification-preferences')
  @ApiOkResponse({ type: [NotificationPreferenceDto] })
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceDto[]> {
    return this.notifications.updatePreferences(
      user.id,
      dto.items,
      user.role === 'ADMIN',
    );
  }
}

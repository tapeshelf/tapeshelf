import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { RequestUser } from '../../common/auth/request-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/rate-limits.js';
import { OkDto } from '../auth/auth.dto.js';
import {
  DeviceDto,
  DeviceKeyDto,
  PushMessageDto,
  PushesQueryDto,
  RegisterDeviceDto,
} from './push.dto.js';
import { PushService } from './push.service.js';

/** The header a phone reads its pushes with (DeviceKeyDto.key). */
export const DEVICE_KEY_HEADER = 'x-tapeshelf-device';

/** The phone app's devices and pushes. */
@ApiTags('push')
@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  @ApiCookieAuth()
  @RateLimit('deviceRegister')
  @Put('me/device')
  @ApiOperation({
    summary:
      'The phone app of this session: where its pushes go; returns the key it reads them with',
  })
  @ApiOkResponse({ type: DeviceKeyDto })
  register(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceKeyDto> {
    return this.push.register(user.id, user.sessionId, dto);
  }

  @ApiCookieAuth()
  @Delete('me/device')
  @ApiOperation({ summary: 'The phone app of this session wants no more news' })
  @ApiOkResponse({ type: OkDto })
  @HttpCode(HttpStatus.OK)
  async unregister(@CurrentUser() user: RequestUser): Promise<OkDto> {
    await this.push.unregister(user.sessionId);
    return { ok: true };
  }

  @ApiCookieAuth()
  @Get('me/devices')
  @ApiOperation({
    summary:
      'Phones with the app signed in to this account (the web shows the Push column when there is one)',
  })
  @ApiOkResponse({ type: [DeviceDto] })
  devices(@CurrentUser() user: RequestUser): Promise<DeviceDto[]> {
    return this.push.list(user.id, user.sessionId);
  }

  @Public()
  @RateLimit('devicePushes')
  @Get('device/pushes')
  @ApiHeader({ name: DEVICE_KEY_HEADER, required: true })
  @ApiOperation({
    summary:
      'What was pushed to this phone since the last one it saw (a phone without push signals asks itself)',
  })
  @ApiOkResponse({ type: [PushMessageDto] })
  since(
    @Headers(DEVICE_KEY_HEADER) key: string | undefined,
    @Query() query: PushesQueryDto,
  ): Promise<PushMessageDto[]> {
    return this.push.since(key, query.after);
  }

  @Public()
  @RateLimit('devicePushes')
  @Get('device/pushes/:id')
  @ApiHeader({ name: DEVICE_KEY_HEADER, required: true })
  @ApiOperation({ summary: 'One push, for the phone its signal woke' })
  @ApiOkResponse({ type: PushMessageDto })
  read(
    @Headers(DEVICE_KEY_HEADER) key: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PushMessageDto> {
    return this.push.read(key, id);
  }
}

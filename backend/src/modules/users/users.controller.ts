import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { MeDto } from '../auth/auth.dto.js';
import {
  PROFILE_IMAGE_MAX_BYTES,
  ProfileMediaService,
  type UploadedImage,
} from './profile-media.service.js';
import {
  ChangeUsernameDto,
  ProfileImageUploadDto,
  PublicUserDto,
  UpdatePageSettingsDto,
  UpdateProfileDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';
import { RateLimit } from '../../common/rate-limits.js';

const IMAGE_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: PROFILE_IMAGE_MAX_BYTES, files: 1 },
});

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly media: ProfileMediaService,
  ) {}

  @Patch('me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeDto> {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/username')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  changeUsername(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangeUsernameDto,
  ): Promise<MeDto> {
    return this.users.changeUsername(user.id, dto.username);
  }

  @Put('me/page')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'How my page is laid out for everyone' })
  @ApiOkResponse({ type: MeDto })
  updatePageSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdatePageSettingsDto,
  ): Promise<MeDto> {
    return this.users.updatePageSettings(user, dto);
  }

  @Put('me/avatar')
  @ApiCookieAuth()
  @RateLimit('profileImage')
  @UseInterceptors(IMAGE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ProfileImageUploadDto })
  @ApiOperation({ summary: 'Upload a new avatar (JPEG/PNG/WebP/GIF, ≤ 5 MiB)' })
  @ApiOkResponse({ type: MeDto })
  async setAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<MeDto> {
    await this.media.set(user.id, 'avatar', file);
    return this.users.getMe(user.id);
  }

  @Delete('me/avatar')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  async removeAvatar(@CurrentUser() user: RequestUser): Promise<MeDto> {
    await this.media.remove(user.id, 'avatar');
    return this.users.getMe(user.id);
  }

  @Put('me/cover')
  @ApiCookieAuth()
  @RateLimit('profileImage')
  @UseInterceptors(IMAGE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ProfileImageUploadDto })
  @ApiOperation({
    summary: 'Upload a new page cover (JPEG/PNG/WebP/GIF, ≤ 5 MiB)',
  })
  @ApiOkResponse({ type: MeDto })
  async setCover(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<MeDto> {
    await this.media.set(user.id, 'cover', file);
    return this.users.getMe(user.id);
  }

  @Delete('me/cover')
  @ApiCookieAuth()
  @ApiOkResponse({ type: MeDto })
  async removeCover(@CurrentUser() user: RequestUser): Promise<MeDto> {
    await this.media.remove(user.id, 'cover');
    return this.users.getMe(user.id);
  }

  @Public()
  @Get('users/:username')
  @ApiOkResponse({ type: PublicUserDto })
  getPublicProfile(
    @OptionalUser() viewer: RequestUser | undefined,
    @Param('username') username: string,
  ): Promise<PublicUserDto> {
    return this.users.getPublicProfile(username, viewer);
  }
}

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { OptionalUser } from '../../common/decorators/optional-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequireVerifiedEmail } from '../../common/decorators/verified.decorator.js';
import {
  RelationDto,
  SocialListDto,
  SocialListQueryDto,
} from './social.dto.js';
import { SocialService } from './social.service.js';
import { RateLimit } from '../../common/rate-limits.js';

/** Follows and the public friends/followers/following lists. */
@ApiTags('social')
@Controller('users/:username')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Public()
  @Get('social')
  @ApiOperation({
    summary: 'Friends, followers or following of a user (public)',
  })
  @ApiOkResponse({ type: SocialListDto })
  list(
    @OptionalUser() viewer: RequestUser | undefined,
    @Param('username') username: string,
    @Query() query: SocialListQueryDto,
  ): Promise<SocialListDto> {
    return this.social.list(username, query, viewer);
  }

  @Post('follow')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RateLimit('follow')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Add as friend (follow); mutual follows make friends',
  })
  @ApiOkResponse({ type: RelationDto })
  follow(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<RelationDto> {
    return this.social.follow(user.id, username);
  }

  @Delete('follow')
  @RateLimit('follow')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Unfollow; ends a friendship' })
  @ApiOkResponse({ type: RelationDto })
  unfollow(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<RelationDto> {
    return this.social.unfollow(user.id, username);
  }
}

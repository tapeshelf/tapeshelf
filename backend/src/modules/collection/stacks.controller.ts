import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { OkDto } from '../auth/auth.dto.js';
import {
  CreateStackDto,
  StackDto,
  StackRemoveDto,
  StackRemoveResultDto,
  StackVideosDto,
  UpdateStackDto,
} from './collection.dto.js';
import { StacksService } from './stacks.service.js';

/** Stacks on the own shelf. */
@ApiTags('collection')
@ApiCookieAuth()
@Controller('me/collection/stacks')
export class StacksController {
  constructor(private readonly stacks: StacksService) {}

  @Get()
  @ApiOperation({
    summary: 'The own stacks with their category and size, by name',
  })
  @ApiOkResponse({ type: [StackDto] })
  list(@CurrentUser() user: RequestUser): Promise<StackDto[]> {
    return this.stacks.list(user);
  }

  @Post()
  @ApiOperation({
    summary:
      'Stack videos together: a new stack where the first video sits, or the stack one of them is already in',
  })
  @ApiCreatedResponse({ type: StackDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateStackDto,
  ): Promise<StackDto> {
    return this.stacks.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Name a stack (empty clears the name) and/or choose its cover',
  })
  @ApiOkResponse({ type: StackDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStackDto,
  ): Promise<StackDto> {
    return this.stacks.update(user, id, dto);
  }

  @Post(':id/videos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put videos into a stack, behind the ones there' })
  @ApiOkResponse({ type: StackDto })
  add(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StackVideosDto,
  ): Promise<StackDto> {
    return this.stacks.add(user, id, dto);
  }

  @Post(':id/videos/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Take videos out of a stack; one left with fewer than two is dissolved',
  })
  @ApiOkResponse({ type: StackRemoveResultDto })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StackRemoveDto,
  ): Promise<StackRemoveResultDto> {
    return this.stacks.remove(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Dissolve a stack: its videos stay on the shelf' })
  @ApiOkResponse({ type: OkDto })
  async dissolve(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkDto> {
    await this.stacks.dissolve(user, id);
    return { ok: true };
  }
}

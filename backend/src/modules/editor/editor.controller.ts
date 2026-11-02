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
import { EditStateDto, SaveEditDto } from './editor.dto.js';
import { EditorService } from './editor.service.js';

/** The video editor: Pro authors on their videos, admins on any. */
@ApiTags('editor')
@ApiCookieAuth()
@Controller('videos/:id/edit')
export class EditorController {
  constructor(private readonly editor: EditorService) {}

  @Get()
  @ApiOperation({
    summary:
      'What the editor starts from: the original, the applied edit, a pending render',
  })
  @ApiOkResponse({ type: EditStateDto })
  state(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EditStateDto> {
    return this.editor.state(user, id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @ApiOperation({
    summary:
      'Save an edit into the same video or as a copy; the render runs in the background',
  })
  @ApiOkResponse({ type: EditStateDto })
  save(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveEditDto,
  ): Promise<EditStateDto> {
    return this.editor.save(user, id, dto);
  }

  @Delete()
  @ApiOperation({
    summary: 'Cancel a pending render, or put away a failed one',
  })
  @ApiOkResponse({ type: EditStateDto })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EditStateDto> {
    return this.editor.cancel(user, id);
  }
}

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
  Put,
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
  CategoryDto,
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './categories.dto.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@ApiCookieAuth()
@Controller('me/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'My categories in sidebar order, with counts' })
  @ApiOkResponse({ type: [CategoryDto] })
  list(@CurrentUser() user: RequestUser): Promise<CategoryDto[]> {
    return this.categories.listMine(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CategoryDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.create(user.id, dto);
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder my categories' })
  @ApiOkResponse({ type: [CategoryDto] })
  reorder(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<CategoryDto[]> {
    return this.categories.reorder(user.id, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename or hide/show a category' })
  @ApiOkResponse({ type: CategoryDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a category; its videos stay, uncategorized',
  })
  @ApiOkResponse({ type: OkDto })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkDto> {
    await this.categories.remove(user.id, id);
    return { ok: true };
  }
}

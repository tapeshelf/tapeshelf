import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

import {
  CATEGORY_ROWS_MAX,
  TILE_SCALES,
  type TileScale,
} from '../users/page-settings.js';

export const CATEGORY_NAME_MAX = 50;
/** Flat list, so a hard cap keeps the sidebar sane (default). */
export const CATEGORIES_MAX = 100;

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ description: 'Not listed on the page for visitors' })
  hidden!: boolean;
  @ApiProperty({ description: 'Videos in this category visible to the caller' })
  count!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The video whose picture the category’s card shows; owner only, else null',
  })
  coverVideoId!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Its own rows in “All videos” by category, 0 = all; null = the page’s setting',
  })
  previewRows!: number | null;
  @ApiProperty({
    nullable: true,
    enum: TILE_SCALES,
    enumName: 'TileScale',
    description: 'Its own tile size; null = the page’s setting',
  })
  tileScale!: TileScale | null;
}

export class CreateCategoryDto {
  @ApiProperty({ maxLength: CATEGORY_NAME_MAX })
  @IsString()
  @Length(1, CATEGORY_NAME_MAX)
  name!: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: CATEGORY_NAME_MAX })
  @IsOptional()
  @IsString()
  @Length(1, CATEGORY_NAME_MAX)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description:
      'A video of this category for its card in the “Folders” view; null: the latest four',
  })
  @IsOptional()
  @IsUUID()
  coverVideoId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    minimum: 0,
    maximum: CATEGORY_ROWS_MAX,
    description:
      'Its own rows in “All videos” by category, 0 = all; null: the page’s setting',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(CATEGORY_ROWS_MAX)
  previewRows?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: TILE_SCALES,
    enumName: 'TileScale',
    description: 'Its own tile size; null: the page’s setting',
  })
  @IsOptional()
  @IsIn(TILE_SCALES)
  tileScale?: TileScale | null;
}

export class ReorderCategoriesDto {
  @ApiProperty({
    type: [String],
    description: 'Category ids in the wanted order (unlisted ones go last)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATEGORIES_MAX)
  @IsUUID('all', { each: true })
  ids!: string[];
}

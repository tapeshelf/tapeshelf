import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { Transform } from 'class-transformer';

import { trimText } from '../../common/validation/text.js';
import { Locale, Theme } from '../../generated/prisma/enums.js';
import {
  COLLECTION_SORTS,
  type CollectionSort,
  FIRST_VIEWS,
  type FirstView,
  PAGE_LAYOUTS,
  type PageLayout,
  CATEGORY_ROWS_MAX,
  SHELF_GROUPINGS,
  type ShelfGrouping,
  TILE_SCALES,
  type TileScale,
  TILE_SIZES,
  type TileSize,
} from './page-settings.js';
import { RelationDto, SocialCountsDto } from '../social/social.dto.js';

/** A name shown everywhere (headings, lists, chats). */
export const DISPLAY_NAME_MAX = 50;
/**
 * The profile's words: short enough that the page's head stays a head, the videos below
 * being the page.
 */
export const BIO_MAX = 300;
/** "Looking for" and "Please don't offer": a line or two each. */
export const EXCHANGE_PREFS_MAX = 200;

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: DISPLAY_NAME_MAX })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(1, DISPLAY_NAME_MAX)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: BIO_MAX, nullable: true })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(0, BIO_MAX)
  bio?: string;

  @ApiPropertyOptional({
    maxLength: EXCHANGE_PREFS_MAX,
    description: 'What they look for in exchanges; empty clears it',
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(0, EXCHANGE_PREFS_MAX)
  exchangeWants?: string;

  @ApiPropertyOptional({
    maxLength: EXCHANGE_PREFS_MAX,
    description: 'What not to offer them; empty clears it',
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(0, EXCHANGE_PREFS_MAX)
  exchangeAvoid?: string;

  @ApiPropertyOptional({
    description: 'Show the two on the shelf too (off by default)',
  })
  @IsOptional()
  @IsBoolean()
  showExchangePrefs?: boolean;

  @ApiPropertyOptional({
    description:
      'Guests may start an exchange from this user’s private videos (on by default)',
  })
  @IsOptional()
  @IsBoolean()
  acceptGuestExchanges?: boolean;

  @ApiPropertyOptional({ enum: Locale, enumName: 'Locale' })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @ApiPropertyOptional({ enum: Theme, enumName: 'Theme' })
  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @ApiPropertyOptional({
    description:
      'Show videos marked sensitive without the consent dialog',
  })
  @IsOptional()
  @IsBoolean()
  showSensitive?: boolean;

  @ApiPropertyOptional({
    example: '#7c5cff',
    nullable: true,
    description: 'Hex color or null to use the default',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$|^$/)
  accentColor?: string;

  @ApiPropertyOptional({
    example: 81723,
    description:
      'Pattern of the generated cover (any number picks another one)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  coverPattern?: number;
}

export class ChangeUsernameDto {
  @ApiProperty({ example: 'ann_v' })
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,30}$/)
  username!: string;
}

/** How the owner wants their page shown. */
export class PageSettingsDto {
  @ApiProperty({ enum: PAGE_LAYOUTS, enumName: 'PageLayout' })
  layout!: PageLayout;
  @ApiProperty({ enum: TILE_SIZES, enumName: 'TileSize' })
  tileSize!: TileSize;
  @ApiProperty({
    enum: COLLECTION_SORTS,
    enumName: 'CollectionSort',
    description: 'Default order of videos on the page',
  })
  sort!: CollectionSort;
  @ApiProperty({
    description: 'Show the coloured cover above the page',
  })
  showCover!: boolean;
  @ApiProperty({
    enum: FIRST_VIEWS,
    enumName: 'FirstView',
    description: 'What visitors see first in “All videos”',
  })
  firstView!: FirstView;
  @ApiProperty({
    enum: SHELF_GROUPINGS,
    enumName: 'ShelfGrouping',
    description: 'How “All videos” divides for visitors',
  })
  grouping!: ShelfGrouping;
  @ApiProperty({
    minimum: 0,
    maximum: CATEGORY_ROWS_MAX,
    description:
      'Rows of each category in “All videos” by category, 0 = all',
  })
  categoryRows!: number;
  @ApiProperty({
    enum: TILE_SCALES,
    enumName: 'TileScale',
    description: 'The owner’s size of the tiles; visitors zoom from it',
  })
  tileScale!: TileScale;
}

export class UpdatePageSettingsDto {
  @ApiPropertyOptional({ enum: PAGE_LAYOUTS, enumName: 'PageLayout' })
  @IsOptional()
  @IsIn(PAGE_LAYOUTS)
  layout?: PageLayout;

  @ApiPropertyOptional({ enum: TILE_SIZES, enumName: 'TileSize' })
  @IsOptional()
  @IsIn(TILE_SIZES)
  tileSize?: TileSize;

  @ApiPropertyOptional({ enum: COLLECTION_SORTS, enumName: 'CollectionSort' })
  @IsOptional()
  @IsIn(COLLECTION_SORTS)
  sort?: CollectionSort;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCover?: boolean;

  @ApiPropertyOptional({ enum: FIRST_VIEWS, enumName: 'FirstView' })
  @IsOptional()
  @IsIn(FIRST_VIEWS)
  firstView?: FirstView;

  @ApiPropertyOptional({ enum: SHELF_GROUPINGS, enumName: 'ShelfGrouping' })
  @IsOptional()
  @IsIn(SHELF_GROUPINGS)
  grouping?: ShelfGrouping;

  @ApiPropertyOptional({ minimum: 0, maximum: CATEGORY_ROWS_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(CATEGORY_ROWS_MAX)
  categoryRows?: number;

  @ApiPropertyOptional({ enum: TILE_SCALES, enumName: 'TileScale' })
  @IsOptional()
  @IsIn(TILE_SCALES)
  tileScale?: TileScale;

  @ApiPropertyOptional({
    description:
      'Hide the whole page from everyone but me and admins: Pro or admin; everyone self-hosted',
  })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

/** Multipart upload of a profile image (avatar or cover): field `file`, up to 5 MiB. */
export class ProfileImageUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: unknown;
}

export class PublicUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'Canonical username; redirect if it differs from the one requested. Opened through an anonymous link (`~<code>`): that handle, never the username',
  })
  username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) coverUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String }) accentColor!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Pattern of the generated cover; null derives it from the id',
  })
  coverPattern!: number | null;
  @ApiProperty({ type: PageSettingsDto }) pageSettings!: PageSettingsDto;
  @ApiProperty({ description: 'Videos uploaded by this user' })
  videoCount!: number;
  @ApiProperty({ type: SocialCountsDto }) counts!: SocialCountsDto;
  @ApiProperty({
    type: RelationDto,
    nullable: true,
    description:
      'The signed-in viewer’s relation; null for guests and for the owner',
  })
  relation!: RelationDto | null;
  @ApiProperty({
    description:
      'Has Pro right now: a small badge by the name (cloud only)',
  })
  pro!: boolean;
  @ApiProperty({
    description:
      'The owner hid the page; only they and admins get it, with a quiet mark',
  })
  pageHidden!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'What they look for in exchanges, when they show it on the shelf',
  })
  exchangeWants!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What not to offer them, when they show it on the shelf',
  })
  exchangeAvoid!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Length,
  ValidateNested,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';

import { trimText } from '../../common/validation/text.js';
import { AccessSource, Visibility } from '../../generated/prisma/enums.js';
import type { RequestBlocker } from '../access/access-policy.js';
import { CategoryDto } from '../categories/categories.dto.js';
import { RequestStateDto } from '../exchange/exchange.dto.js';
import { COLLECTION_SORTS } from '../users/page-settings.js';
import { VideoAuthorDto, VideoCardDto } from './video-card.dto.js';
import { TITLE_MAX } from '../uploads/uploads.dto.js';

// Kept here for the many importers; the classes live apart so exchange.dto can use them without a cycle.
export { VideoAuthorDto, VideoCardDto };

/** Visitor sections in display order. */
export const COLLECTION_SECTIONS = ['PUBLIC', 'PRIVATE', 'OTHERS'] as const;
export type CollectionSection = (typeof COLLECTION_SECTIONS)[number];

/** Sidebar folders of the owner; visitors may use the first three. */
export const COLLECTION_FILTERS = [
  'PUBLIC',
  'PRIVATE',
  'OTHERS',
  'HIDDEN',
  /** The owner's unsorted uploads: no category, no stack, not "kept as is" yet. */
  'INBOX',
] as const;
export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];

export const REQUEST_BLOCKERS = [
  'guest',
  'ownPage',
  'bookmark',
  'notReady',
  'hidden',
  'alreadyWatchable',
] as const;

/**
 * The orders a listing takes: the page's own three, and the owner's table columns — length,
 * file size, quality, category, visibility.
 */
export const LIST_SORTS = [
  ...COLLECTION_SORTS,
  'duration',
  'size',
  'quality',
  'category',
  'visibility',
] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Up to this many videos per bulk call (default). */
export const BULK_MAX = 200;
/**
 * A drag moves what is selected, however much of the shelf is loaded: the whole order is rewritten
 * anyway, and 2000 ids stay inside the 100 kB a JSON body may have.
 */
export const MOVE_MAX = 2000;

/** The stack a video sits in on this shelf. */
export class StackRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The video whose picture the stack shows; null = its first video',
  })
  coverVideoId!: string | null;
  @ApiProperty({
    description:
      'How many videos of the stack this very listing holds (a visitor counts what they may see; a stack of one shows as a plain video)',
  })
  size!: number;
  @ApiPropertyOptional({
    type: [VideoCardDto],
    description:
      'Its first pictures (the cover first, up to four), on the first row of a stack whose videos this page does not all hold: the tile looks the same however far the shelf has loaded',
  })
  peek?: VideoCardDto[];
}

export class CollectionItemDto {
  @ApiProperty({ enum: COLLECTION_SECTIONS, enumName: 'CollectionSection' })
  section!: CollectionSection;
  @ApiProperty({ type: VideoCardDto }) video!: VideoCardDto;
  @ApiProperty({ enum: AccessSource, enumName: 'AccessSource' })
  source!: AccessSource;
  @ApiProperty({
    description:
      'Hidden by the holder (only ever true for the holder’s own view)',
  })
  hidden!: boolean;
  @ApiProperty({
    description:
      'Received by exchange or share and not opened yet; only ever true for the holder',
  })
  unseen!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The author’s title when `video.title` is the holder’s own name for it',
  })
  originalTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null;
  @ApiProperty({ nullable: true, type: StackRefDto })
  stack!: StackRefDto | null;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) addedAt!: string;
}

export class CollectionDto {
  @ApiProperty({ enum: ['OWNER', 'VISITOR'], enumName: 'CollectionMode' })
  mode!: 'OWNER' | 'VISITOR';
  @ApiProperty({ enum: LIST_SORTS, enumName: 'ListSort' })
  sort!: ListSort;
  @ApiProperty() total!: number;
  @ApiProperty() offset!: number;
  @ApiProperty({ type: [CollectionItemDto] }) items!: CollectionItemDto[];
}

/** The longest search on a shelf: a title is at most 200 characters, a search far less. */
export const SHELF_SEARCH_MAX = 100;

export class CollectionQueryDto {
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: COLLECTION_FILTERS,
    enumName: 'CollectionFilter',
    description: 'A sidebar folder; HIDDEN is meaningful for the owner only',
  })
  @IsOptional()
  @IsEnum(COLLECTION_FILTERS)
  section?: CollectionFilter;

  @ApiPropertyOptional({
    description:
      'A category id of the page owner, or "none" for uncategorized videos',
  })
  @IsOptional()
  @Matches(/^(none|[0-9a-f-]{36})$/i)
  categoryId?: string;

  @ApiPropertyOptional({
    enum: LIST_SORTS,
    enumName: 'ListSort',
    description:
      'Defaults to the owner’s page setting; the table columns are for the owner',
  })
  @IsOptional()
  @IsIn(LIST_SORTS)
  sort?: ListSort;

  @ApiPropertyOptional({
    enum: SORT_DIRECTIONS,
    enumName: 'SortDirection',
    description:
      'The way of a table column’s order; each column has its own default (manual: none)',
  })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  dir?: SortDirection;

  @ApiPropertyOptional({
    description:
      'One feed for a visitor: no public → private → others order first (grouping “none” or “category”)',
  })
  @IsOptional()
  // The raw value: the implicit conversion makes "false" true.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    [true, 'true'].includes(obj[key] as string),
  )
  @IsBoolean()
  flat?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only the videos of this stack',
  })
  @IsOptional()
  @IsUUID()
  stackId?: string;

  @ApiPropertyOptional({
    maxLength: SHELF_SEARCH_MAX,
    description:
      'A search: the title, description, category, stack and author, case aside, and from four letters near misses; found in the title first',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SHELF_SEARCH_MAX)
  q?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Only videos added to the shelf after this (new since the last visit)',
  })
  @IsOptional()
  @IsISO8601()
  addedAfter?: string;
}

/** What the listing is divided by: the same filters as the list, and the viewer's time zone. */
export class CollectionBucketsQueryDto extends OmitType(CollectionQueryDto, [
  'offset',
  'limit',
  'stackId',
  'flat',
] as const) {
  @ApiPropertyOptional({
    description:
      'IANA time zone for the months (e.g. Europe/Paris); UTC otherwise',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;
}

export class CollectionBucketDto {
  @ApiProperty({
    description: '"2026-10" (a month) or "A" / "#" (a first letter)',
  })
  key!: string;
  @ApiProperty() count!: number;
}

export class CollectionBucketsDto {
  @ApiProperty({
    nullable: true,
    enum: ['month', 'letter'],
    description:
      'Null when the order has no such parts (manual order, a search)',
  })
  by!: 'month' | 'letter' | null;
  @ApiProperty({
    type: [CollectionBucketDto],
    description: 'In the listing’s order',
  })
  buckets!: CollectionBucketDto[];
}

/** Folder counts for the sidebar / filter chips, as visible to the caller. */
export class CollectionSummaryDto {
  @ApiProperty({
    description: 'Everything shown in “All” (owner: excluding hidden)',
  })
  all!: number;
  @ApiProperty() public!: number;
  @ApiProperty() private!: number;
  @ApiProperty() others!: number;
  @ApiProperty({ description: 'Hidden holdings (owner only, else 0)' })
  hidden!: number;
  @ApiProperty() uncategorized!: number;
  @ApiProperty({
    description: 'Owner only: unsorted uploads waiting in the Inbox',
  })
  inbox!: number;
  @ApiProperty({
    description:
      'Videos of “All” that sit in a stack: the shelf draws all − stacked + stacks tiles',
  })
  stacked!: number;
  @ApiProperty({ description: 'Stacks among the videos of “All”' })
  stacks!: number;
  @ApiProperty({
    description: 'Owner only: own deleted videos that can still be restored',
  })
  trash!: number;
  @ApiProperty({
    type: [CategoryDto],
    description: 'Owner: all categories; visitors: only the ones not hidden',
  })
  categories!: CategoryDto[];
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'A signed-in visitor who was here before: videos added after this are new to them. Null on a first visit, for guests and for the owner',
  })
  newSince!: string | null;
  @ApiProperty({
    description: 'How many videos are new to that visitor; 0 without newSince',
  })
  newCount!: number;
}

export class PageHolderDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'A username, or `~<code>` for someone known here by their anonymous link: their page is /p/<code>, and `~` alone when the link no longer opens. Never shown as @name then',
  })
  username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What they look for in exchanges: shown by the request',
  })
  exchangeWants!: string | null;
  @ApiProperty({ nullable: true, type: String }) exchangeAvoid!: string | null;
}

export class VideoPageAuthorDto extends VideoAuthorDto {
  @ApiProperty({ description: 'Videos uploaded by the author' })
  videoCount!: number;
  @ApiProperty({
    description:
      'Their page opens for this viewer; false once they hid it: the name goes without a link',
  })
  pageVisible!: boolean;
}

export class PageFrameDto {
  @ApiProperty() index!: number;
  @ApiProperty() timestampSec!: number;
  @ApiProperty() url!: string;
}

export class VideoPageVideoDto extends VideoCardDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Full-size thumbnail for the player poster (thumbnailUrl is the small tile copy)',
  })
  posterUrl!: string | null;
  @ApiProperty({
    type: [PageFrameDto],
    description: 'The 16 extracted frames (timeline previews)',
  })
  frames!: PageFrameDto[];
}

export class CategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class VideoPageHoldingDto {
  @ApiProperty({ enum: AccessSource, enumName: 'AccessSource' })
  source!: AccessSource;
  @ApiProperty() hidden!: boolean;
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null;
  @ApiProperty({ nullable: true, type: CategoryRefDto })
  category!: CategoryRefDto | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The holder’s own name for the video, if they gave one',
  })
  customTitle!: string | null;
  @ApiProperty({ nullable: true, type: String })
  customDescription!: string | null;
}

/** What the author called it, when this shelf's holder named it their own way. */
export class VideoOriginalDto {
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
}

export class ViewerCapabilitiesDto {
  @ApiProperty({
    description:
      'May open the video editor: its Pro author (any author self-hosted) or an admin',
  })
  canEdit!: boolean;
  @ApiProperty() canView!: boolean;
  @ApiProperty() canStream!: boolean;
  @ApiProperty() canDownload!: boolean;
  @ApiProperty() canAddToCollection!: boolean;
  @ApiProperty() canManage!: boolean;
  @ApiProperty({
    description: 'The viewer is this page’s holder and may hide/show the video',
  })
  canHide!: boolean;
  @ApiProperty({ description: 'The viewer holds this video (any source)' })
  inCollection!: boolean;
  @ApiProperty({
    description:
      'The viewer holds it in a way a temporary link may carry: their upload or a copy, ready; the tier is checked on creating it',
  })
  canSendLink!: boolean;
  @ApiProperty() isHolder!: boolean;
  @ApiProperty({
    description:
      'A guest may offer an exchange for it: private, requestable, its holder takes guests',
  })
  guestExchange!: boolean;
  @ApiProperty({
    description:
      'Why the request button is not offered; null when requesting is possible in principle',
    enum: REQUEST_BLOCKERS,
    nullable: true,
  })
  requestBlocker!: RequestBlocker | null;
  @ApiProperty({
    nullable: true,
    type: () => RequestStateDto, // lazy: exchange.dto imports VideoCardDto from here
    description:
      'Open request / cooldown / block / daily limit for this viewer; null when requestBlocker is set',
  })
  request!: RequestStateDto | null;
}

export class VideoPageDto {
  @ApiProperty({ type: VideoPageVideoDto }) video!: VideoPageVideoDto;
  @ApiProperty({ type: PageHolderDto }) holder!: PageHolderDto;
  @ApiProperty({ type: VideoPageHoldingDto }) holding!: VideoPageHoldingDto;
  @ApiProperty({
    nullable: true,
    type: VideoOriginalDto,
    description:
      'Set when the page shows the holder’s own name or description: the author’s, to show small',
  })
  original!: VideoOriginalDto | null;
  @ApiProperty({ type: VideoPageAuthorDto }) author!: VideoPageAuthorDto;
  @ApiProperty({ type: ViewerCapabilitiesDto }) viewer!: ViewerCapabilitiesDto;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The page the video was saved from by the browser extension: only to its author, else null',
  })
  sourceUrl!: string | null;
}

// ---------------------------------------------------------------------------
// Owner operations on the own collection (/me/collection)
// ---------------------------------------------------------------------------

class VideoIdsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX)
  @IsUUID('all', { each: true })
  videoIds!: string[];
}

/** Category and hidden flag of my holdings (hidden applies to received videos only). */
export class UpdateHoldingsDto extends VideoIdsDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'One of my categories, or null to clear',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

/** Visibility / sensitive switch of my own videos (others in the list are skipped). */
export class UpdateVideosDto extends VideoIdsDto {
  @ApiPropertyOptional({ enum: Visibility, enumName: 'Visibility' })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ description: 'Mark as sensitive' })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;
}

export class DeleteVideosDto extends VideoIdsDto {}

export class OrderDto extends VideoIdsDto {}

/**
 * A drag on the shelf: these videos (and every video of these stacks, loaded or not)
 * move right before or after the anchor video, in the shelf's full order, not just the loaded part.
 * `adopt`: the sort shown now; when it is not manual, the whole shelf in that order
 * becomes the manual order first, and the page's sort turns manual.
 */
export class MoveDto extends VideoIdsDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: MOVE_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MOVE_MAX)
  @IsUUID('all', { each: true })
  declare videoIds: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MOVE_MAX)
  @IsUUID('all', { each: true })
  stackIds?: string[];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  anchorId!: string;

  @ApiProperty({ enum: ['before', 'after'] })
  @IsIn(['before', 'after'])
  side!: 'before' | 'after';

  @ApiPropertyOptional({ enum: LIST_SORTS, enumName: 'ListSort' })
  @IsOptional()
  @IsIn(LIST_SORTS)
  adopt?: ListSort;

  @ApiPropertyOptional({
    enum: SORT_DIRECTIONS,
    enumName: 'SortDirection',
    description: 'The way of the adopted order (a table column)',
  })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  adoptDir?: SortDirection;
}

// --- stacks ---------------------------------------------------

/** The category every video of the stack gets; absent = the videos must already agree. */
class StackCategoryDto extends VideoIdsDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description:
      'Give the whole stack this category (null = none); without it, videos of different categories are refused (409 stackCategories)',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class CreateStackDto extends StackCategoryDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'At least two; the first is where the stack lands and its cover',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(BULK_MAX)
  @IsUUID('all', { each: true })
  declare videoIds: string[];

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}

export class StackVideosDto extends StackCategoryDto {}

export class StackRemoveDto extends VideoIdsDto {}

export class UpdateStackDto {
  @ApiPropertyOptional({ maxLength: 60, description: 'Empty clears the name' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description:
      'One of the stack’s videos as its cover; null = the first video again',
  })
  @IsOptional()
  @IsUUID()
  coverVideoId?: string | null;
}

export class StackDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({ nullable: true, type: String }) coverVideoId!: string | null;
  @ApiProperty({ description: 'Live videos in the stack' }) size!: number;
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null;
}

export class StackRemoveResultDto {
  @ApiProperty({ description: 'Videos left in the stack (0 when dissolved)' })
  size!: number;
  @ApiProperty() dissolved!: boolean;
}

export class BulkResultDto {
  @ApiProperty({ description: 'How many videos the call changed' })
  updated!: number;
}

// ---- Inbox, titles, duplicates

/** Videos that leave the Inbox as they are: kept without a category. */
export class InboxDoneDto extends VideoIdsDto {}

export class RenameItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() videoId!: string;
  @ApiProperty({ minLength: 1, maxLength: TITLE_MAX })
  @Transform(trimText)
  @IsString()
  @Length(1, TITLE_MAX)
  title!: string;
}

/** New titles for many videos at once (a cleanup): an own video's title, a received one's own name. */
export class RenameManyDto {
  @ApiProperty({ type: [RenameItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => RenameItemDto)
  items!: RenameItemDto[];
}

export class DuplicateFileDto {
  @ApiProperty({ maxLength: 255 }) @IsString() @MaxLength(255) name!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) size!: number;
}

/** Files about to be uploaded: which of them are on my shelf already. */
export class DuplicateCheckDto {
  @ApiProperty({ type: [DuplicateFileDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DuplicateFileDto)
  files!: DuplicateFileDto[];
}

export class DuplicateMatchDto {
  @ApiProperty({ description: 'Position of the file in the request' })
  index!: number;
  @ApiProperty() videoId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
}

export class DuplicateCheckResultDto {
  @ApiProperty({ type: [DuplicateMatchDto] }) matches!: DuplicateMatchDto[];
}

export const DUPLICATE_REASONS = ['file', 'name', 'similar'] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

export class DuplicateVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ format: 'date-time' }) addedAt!: string;
  @ApiProperty({ enum: AccessSource, enumName: 'AccessSource' })
  source!: AccessSource;
  @ApiProperty() sensitive!: boolean;
}

export class DuplicateGroupDto {
  @ApiProperty({
    enum: DUPLICATE_REASONS,
    description:
      'file: the same file; name: the same file name and length; similar: a close title and the same length',
  })
  reason!: DuplicateReason;
  @ApiProperty({ type: [DuplicateVideoDto] }) videos!: DuplicateVideoDto[];
}

export class DuplicateGroupsDto {
  @ApiProperty({ type: [DuplicateGroupDto] }) groups!: DuplicateGroupDto[];
}

/** Up to this many videos and stacks in the "Featured" strip. */
export const FEATURED_MAX = 12;
/** A tile's key, as the shelf names it: `video:<id>` or `stack:<id>`. */
const TILE_KEY = /^(video|stack):[0-9a-f-]{36}$/i;

/** The owner's "Featured" strip on top of "All videos", as the viewer may see it. */
export class FeaturedDto {
  @ApiProperty({
    type: [CollectionItemDto],
    description:
      'Pinned videos (without their stack) and, of each pinned stack, up to four videos, its cover first',
  })
  items!: CollectionItemDto[];
  @ApiProperty({
    type: [String],
    description: 'The strip’s order: `video:<id>` and `stack:<id>` keys',
  })
  order!: string[];
}

export class SetFeaturedDto {
  @ApiProperty({
    type: [String],
    maxItems: FEATURED_MAX,
    description:
      'The whole strip in its order: `video:<id>` and `stack:<id>` keys of my shelf; [] empties it',
  })
  @IsArray()
  @ArrayMaxSize(FEATURED_MAX)
  @Matches(TILE_KEY, { each: true })
  keys!: string[];
}

export class FolderPictureDto {
  @ApiProperty() videoId!: string;
  @ApiProperty() url!: string;
  @ApiProperty() sensitive!: boolean;
  @ApiProperty() authorId!: string;
}

/** A category as a card of the "Folders" view. */
export class ShelfFolderDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Not listed for visitors (the owner sees it)' })
  hidden!: boolean;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'The videos’ length together, in seconds' })
  durationSec!: number;
  @ApiProperty({
    type: [FolderPictureDto],
    description:
      'The chosen cover alone, else up to four of the latest videos with a picture',
  })
  pictures!: FolderPictureDto[];
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The chosen cover video (owner only, else null)',
  })
  coverVideoId!: string | null;
}

export class ShelfFoldersDto {
  @ApiProperty({ type: [ShelfFolderDto] }) folders!: ShelfFolderDto[];
}

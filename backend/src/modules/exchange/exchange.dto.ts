import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  GivingSide,
  OfferStatus,
  RequestStatus,
} from '../../generated/prisma/enums.js';
import { VideoCardDto } from '../collection/video-card.dto.js';
import { REQUEST_ACTIONS, type RequestAction } from './exchange-rules.js';

/** / (defaults). */
export const MAX_VIDEOS_PER_REQUEST = 20;
export const REQUEST_MESSAGE_MAX = 1000;

export const EXCHANGE_TABS = ['incoming', 'outgoing', 'history'] as const;
export type ExchangeTab = (typeof EXCHANGE_TABS)[number];

export const SKIP_REASONS = [
  'notFound',
  'notRequestable',
  'alreadyWatchable',
  'alreadyRequested',
  'cooldown',
  'limit',
  'blocked',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export class RequestUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'A username, or `~<code>` for someone known here by their anonymous link: their page is /p/<code>, and `~` alone when the link no longer opens. Never shown as @name then',
  })
  username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({
    description: 'They hid their page: show the name without a link',
  })
  pageHidden!: boolean;
  @ApiProperty({
    description:
      'A guest without an account: shown as "Guest", no page',
  })
  guest!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What they look for in exchanges',
  })
  exchangeWants!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'What not to offer them',
  })
  exchangeAvoid!: string | null;
}

export class OfferItemDto {
  @ApiProperty({ enum: GivingSide, enumName: 'GivingSide' })
  givingSide!: GivingSide;
  @ApiProperty({ type: VideoCardDto }) video!: VideoCardDto;
}

export class OfferDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: '0 = the request itself' }) round!: number;
  @ApiProperty({ type: RequestUserDto }) proposedBy!: RequestUserDto;
  @ApiProperty({ enum: OfferStatus, enumName: 'OfferStatus' })
  status!: OfferStatus;
  @ApiProperty({ nullable: true, type: String }) message!: string | null;
  @ApiProperty({ type: [OfferItemDto] }) items!: OfferItemDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  respondedAt!: string | null;
}

/** The current offer seen from the viewer: how many videos they give and get, the last words said. */
export class DealDto {
  @ApiProperty() give!: number;
  @ApiProperty() get!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The current offer’s message, else the request’s',
  })
  lastMessage!: string | null;
}

export class RequestSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: RequestStatus,
    enumName: 'RequestStatus',
    description: 'BLOCKED is shown to the blocked side as DECLINED',
  })
  status!: RequestStatus;
  @ApiProperty() round!: number;
  @ApiProperty({ enum: ['holder', 'requester'], enumName: 'RequestRole' })
  role!: 'holder' | 'requester';
  @ApiProperty({ type: RequestUserDto }) counterpart!: RequestUserDto;
  @ApiProperty({ description: 'The viewer must act now' }) awaitingMe!: boolean;
  @ApiProperty({ nullable: true, type: String }) message!: string | null;
  @ApiProperty({
    type: [VideoCardDto],
    description: 'What was asked for in round 0',
  })
  requested!: VideoCardDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  resolvedAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'A deal with a guest ends then unless someone makes a new round; null = never',
  })
  expiresAt!: string | null;
  @ApiProperty({
    type: () => DealDto,
    description: 'What the current offer means for the viewer',
  })
  deal!: DealDto;
  @ApiProperty({
    type: () => RequestAnonymousLinkDto,
    nullable: true,
    description:
      'To the holder only: asked through their anonymous link, so the requester does not know who they are',
  })
  anonymousLink!: RequestAnonymousLinkDto | null;
}

export class RequestAnonymousLinkDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: "The holder's own note for the link",
  })
  note!: string | null;
}

export class RequestDetailDto extends RequestSummaryDto {
  @ApiProperty({ type: RequestUserDto }) holder!: RequestUserDto;
  @ApiProperty({ type: RequestUserDto }) requester!: RequestUserDto;
  @ApiProperty({ nullable: true, type: String }) currentOfferId!: string | null;
  @ApiProperty({ nullable: true, type: String }) declineComment!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  resetAt!: string | null;
  @ApiProperty({ type: [OfferDto], description: 'Timeline, oldest first' })
  offers!: OfferDto[];
  @ApiProperty({
    enum: REQUEST_ACTIONS,
    isArray: true,
    enumName: 'RequestAction',
  })
  actions!: RequestAction[];
}

/** Admin view of a request: the raw status and who must act now. */
export class AdminRequestDto extends RequestDetailDto {
  @ApiProperty({ nullable: true, type: String }) awaitingUserId!: string | null;
}

export class AdminRequestListDto {
  @ApiProperty({ type: [AdminRequestDto] }) items!: AdminRequestDto[];
  @ApiProperty() total!: number;
}

export class RequestListDto {
  @ApiProperty({ type: [RequestSummaryDto] }) items!: RequestSummaryDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ExchangeListQueryDto {
  @ApiProperty({ enum: EXCHANGE_TABS, enumName: 'ExchangeTab' })
  @IsIn(EXCHANGE_TABS)
  tab!: ExchangeTab;

  @ApiPropertyOptional({
    description: 'Id of the last item of the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExchangeSummaryDto {
  @ApiProperty({ description: 'Open requests waiting for my decision' })
  awaitingMe!: number;
  @ApiProperty({ description: 'My open outgoing requests' }) outgoing!: number;
}

export class CreateRequestDto {
  @ApiProperty({
    description: 'Page owner (holder) the videos are requested from',
  })
  @IsString()
  @MaxLength(30)
  holderUsername!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VIDEOS_PER_REQUEST)
  @IsUUID('all', { each: true })
  videoIds!: string[];

  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'What the requester offers in return from the start: the holder may accept the exchange, share for free, counter or decline',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VIDEOS_PER_REQUEST)
  @IsUUID('all', { each: true })
  offerVideoIds?: string[];

  @ApiPropertyOptional({
    description: 'The exchange link it starts from, when it does',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  exchangeLink?: string;
}

export class SkippedVideoDto {
  @ApiProperty() videoId!: string;
  @ApiProperty({ enum: SKIP_REASONS, enumName: 'SkipReason' })
  reason!: SkipReason;
}

export class CreateRequestResultDto {
  @ApiProperty({ type: RequestDetailDto }) request!: RequestDetailDto;
  @ApiProperty({
    type: [SkippedVideoDto],
    description: 'Videos left out of the request and why',
  })
  skipped!: SkippedVideoDto[];
}

export class AcceptOfferDto {
  @ApiProperty({
    description: 'The offer the viewer saw; 409 when it is no longer current',
  })
  @IsUUID()
  offerId!: string;
}

export class DeclineRequestDto {
  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  comment?: string;
}

export class CounterOfferDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Videos the holder gives',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VIDEOS_PER_REQUEST)
  @IsUUID('all', { each: true })
  holderGives!: string[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Videos the requester gives',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VIDEOS_PER_REQUEST)
  @IsUUID('all', { each: true })
  requesterGives!: string[];

  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  message?: string;
}

/** A video that may go into an offer, with where it sits on its holder's shelf. */
export class OfferVideoDto extends VideoCardDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Its category on that shelf (a hidden category of the other side: null)',
  })
  categoryId!: string | null;
  @ApiProperty({
    description: 'Received from another author (not the holder’s own)',
  })
  received!: boolean;
}

export class OfferCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class OfferOptionsDto {
  @ApiProperty({
    type: [OfferVideoDto],
    description: 'The other side’s videos the viewer may ask for',
  })
  theirs!: OfferVideoDto[];
  @ApiProperty({
    type: [OfferVideoDto],
    description: 'The viewer’s videos they may give',
  })
  mine!: OfferVideoDto[];
  @ApiProperty({
    type: [OfferCategoryDto],
    description:
      'Categories of the other side that hold some of `theirs` (filter)',
  })
  theirCategories!: OfferCategoryDto[];
  @ApiProperty({ type: [OfferCategoryDto], description: 'The same for `mine`' })
  myCategories!: OfferCategoryDto[];
}

/** My videos that may go into an offer to this person before any request exists. */
export class OfferableDto {
  @ApiProperty({ type: [OfferVideoDto] }) mine!: OfferVideoDto[];
  @ApiProperty({ type: [OfferCategoryDto] }) myCategories!: OfferCategoryDto[];
}

export class HintStateDto {
  @ApiProperty() seenCount!: number;
  @ApiProperty() dismissed!: boolean;
  @ApiProperty({
    description: 'Shows needed before "don’t show again" is allowed',
  })
  minShows!: number;
  @ApiProperty({
    description: 'The viewer holds no videos (the modal adds a tip)',
  })
  collectionEmpty!: boolean;
}

/** Dynamic part of "can request" for the video page (button states). */
export class RequestStateDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'My open request containing this video',
  })
  openRequestId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  cooldownUntil!: string | null;
  @ApiProperty({ description: 'A block exists in either direction' })
  blocked!: boolean;
  @ApiProperty({ description: 'Today’s request allowance is used up' })
  limitReached!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'When the allowance has room again (limitReached only)',
  })
  limitFreesAt!: string | null;
}

export class BlockedUserDto {
  @ApiProperty({ type: RequestUserDto }) user!: RequestUserDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RequestStatusQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus, enumName: 'RequestStatus' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { trimText } from '../../common/validation/text.js';

import { VideoCardDto } from '../collection/video-card.dto.js';
import {
  REQUEST_MESSAGE_MAX,
  RequestDetailDto,
} from '../exchange/exchange.dto.js';
import { TITLE_MAX } from '../uploads/uploads.dto.js';

export class CreateExchangeLinkDto {
  @ApiProperty({ type: [String], description: 'The videos offered (1–50)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  videoIds!: string[];
}

export class MyExchangeLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The link is <PUBLIC_URL>/x/<code>' })
  code!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [VideoCardDto] }) videos!: VideoCardDto[];
  @ApiProperty({ description: 'Deals started from it' }) deals!: number;
}

export class ExchangeOwnerDto {
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() pageHidden!: boolean;
  @ApiProperty({ nullable: true, type: String }) exchangeWants!: string | null;
  @ApiProperty({ nullable: true, type: String }) exchangeAvoid!: string | null;
}

/** What /x/<code> shows: who offers which videos for an exchange. */
export class ExchangeInviteDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The exchange link’s code; null for one private video',
  })
  code!: string | null;
  @ApiProperty({ type: ExchangeOwnerDto }) owner!: ExchangeOwnerDto;
  @ApiProperty({ type: [VideoCardDto] }) videos!: VideoCardDto[];
  @ApiProperty({ description: 'The viewer is the owner' }) own!: boolean;
  @ApiProperty({
    description:
      'A guest may offer their videos here (a link: always; a video: if its holder takes guests)',
  })
  guestExchange!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'This browser’s guest already has a deal going on from here: its id',
  })
  guestDeal!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The signed-in viewer already has an exchange going on from here (their own, or one they started as a guest and took into the account): its id',
  })
  request!: string | null;

  @ApiProperty({
    format: 'int64',
    description:
      'The largest file a guest may upload here, bytes (a Free account’s); 0 = no limit',
  })
  guestFileBytes!: number;
}

export class GuestSendDto {
  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  message?: string;
}

/** Where a guest's deal starts: an exchange link, or a private video on a holder's shelf. */
export class StartGuestDealDto {
  @ApiPropertyOptional({ description: 'An exchange link’s code' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  link?: string;

  @ApiPropertyOptional({ description: 'A private video …' })
  @IsOptional()
  @IsUUID()
  videoId?: string;

  @ApiPropertyOptional({ description: '… on this holder’s shelf' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  holder?: string;

  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({ description: 'Where to hear about the deal' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description: 'The human check, when the site has one',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class GuestDealStartedDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'The guest’s key: the deal’s address carries it so it opens from any device',
  })
  key!: string;
}

export class GuestUploadStartDto {
  @ApiProperty() @IsString() @Length(1, 255) filename!: string;
  @ApiProperty({ format: 'int64' }) @IsInt() @Min(1) size!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;
}

export class GuestUploadPartsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  partNumbers!: number[];
}

export class GuestCompletedPartDto {
  @ApiProperty() @IsInt() @Min(1) partNumber!: number;
  @ApiProperty() @IsString() @MaxLength(256) etag!: string;
  @ApiProperty() @IsInt() @Min(0) size!: number;
}

export class GuestUploadCompleteDto {
  @ApiProperty({ type: [GuestCompletedPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuestCompletedPartDto)
  parts!: GuestCompletedPartDto[];

  @ApiProperty({ maxLength: TITLE_MAX })
  @Transform(trimText)
  @IsString()
  @Length(1, TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ description: 'Marked sensitive' })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;
}

export class GuestUploadDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    type: [String],
    description: 'Presigned PUT URLs by part number',
  })
  urls!: string[];
  @ApiProperty() partSize!: number;
  @ApiProperty() partCount!: number;
}

export class GuestEmailDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
}

export class GuestKeyDto {
  @ApiProperty() @IsString() @Length(1, 128) key!: string;
}

export class GuestCounterDto {
  @ApiProperty({
    type: [String],
    description: 'The holder’s videos the guest asks for',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  holderGives!: string[];

  @ApiProperty({
    type: [String],
    description: 'The guest’s uploads for this deal they give',
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  requesterGives!: string[];

  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  message?: string;
}

export class GuestAcceptDto {
  @ApiProperty({ description: 'The offer the guest saw' })
  @IsUUID()
  offerId!: string;
}

export class GuestDeclineDto {
  @ApiPropertyOptional({ maxLength: REQUEST_MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(REQUEST_MESSAGE_MAX)
  comment?: string;
}

export class GuestDealVideoDto extends VideoCardDto {
  @ApiProperty({ description: 'In the offer now on the table' })
  inOffer!: boolean;
}

/** A guest's deal page: the thread as the guest sees it, plus what only a guest needs. */
export class GuestDealDto {
  @ApiProperty({ type: RequestDetailDto }) deal!: RequestDetailDto;
  @ApiProperty({
    description:
      'Sent to the holder, waiting only for the videos to be ready (a draft)',
  })
  sent!: boolean;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Seconds until the deal runs out, by the server’s clock',
  })
  expiresInSec!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  accessUntil!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Seconds left to watch and download what was received',
  })
  accessInSec!: number | null;
  @ApiProperty({
    type: [GuestDealVideoDto],
    description: 'What the guest uploaded for this deal',
  })
  uploads!: GuestDealVideoDto[];
  @ApiProperty({
    type: [VideoCardDto],
    description: 'What the guest received, while they may watch it',
  })
  received!: VideoCardDto[];
  @ApiProperty({
    type: [VideoCardDto],
    description: 'The holder’s videos the guest may ask for in a counter-offer',
  })
  holderVideos!: VideoCardDto[];
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The guest’s address, partly hidden',
  })
  email!: string | null;
  @ApiProperty() maxUploads!: number;
  @ApiProperty({
    format: 'int64',
    description:
      'The largest file a guest may upload, bytes (a Free account’s); 0 = no limit',
  })
  maxFileBytes!: number;
}

export class GuestDownloadDto {
  @ApiProperty() url!: string;
}

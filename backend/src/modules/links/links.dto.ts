import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { VideoCardDto } from '../collection/video-card.dto.js';
import {
  LINK_MAX_VIDEOS,
  LINK_PASSWORD_MAX,
  LINK_PASSWORD_MIN,
  LINK_TTLS,
  type LinkTtl,
} from './link-rules.js';

/** A new temporary link. */
export class CreateLinkDto {
  @ApiProperty({
    type: [String],
    description: `In this order on the page; own uploads and received videos, 1–${LINK_MAX_VIDEOS}`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LINK_MAX_VIDEOS)
  @IsUUID('all', { each: true })
  videoIds!: string[];

  @ApiProperty({ enum: LINK_TTLS, enumName: 'LinkTtl' })
  @IsIn(LINK_TTLS)
  ttl!: LinkTtl;

  @ApiPropertyOptional({
    description: `Opens only with it; ${LINK_PASSWORD_MIN}–${LINK_PASSWORD_MAX} characters`,
  })
  @IsOptional()
  @IsString()
  @Length(LINK_PASSWORD_MIN, LINK_PASSWORD_MAX)
  password?: string;

  @ApiPropertyOptional({
    description:
      'Only for this address: it gets the link, and the page asks for a code sent there',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

/** One of my links. */
export class MyLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The page is /t/<code>' }) code!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({
    description:
      'Seconds left, by the server’s clock: the page counts down from when it got it, whatever the device’s clock says',
  })
  expiresInSec!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ description: 'Videos it still carries' }) count!: number;
  @ApiProperty({
    type: [String],
    description: 'The first few pictures, for the row in "My links"',
  })
  pictures!: string[];
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ description: 'Someone else has opened it' }) opened!: boolean;
}

export class LinkSenderDto {
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({
    description: 'They hid their page: the name without a link',
  })
  pageHidden!: boolean;
}

export class LinkVideoDto {
  @ApiProperty({ type: VideoCardDto }) video!: VideoCardDto;
  @ApiProperty({
    format: 'int64',
    description: 'What a download gives: the file people watch',
  })
  fileBytes!: number;
  @ApiProperty({
    description:
      'On the viewer’s shelf already (theirs, or a copy that is not a bookmark)',
  })
  onShelf!: boolean;
}

/** What /t/<code> shows; the videos only once the link is open to this browser. */
export class LinkPageDto {
  @ApiProperty({ type: LinkSenderDto }) sender!: LinkSenderDto;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({
    description:
      'Seconds left, by the server’s clock: the page counts down from when it got it, whatever the device’s clock says',
  })
  expiresInSec!: number;
  @ApiProperty({ description: 'Videos it carries' }) count!: number;
  @ApiProperty({
    enum: ['open', 'locked'],
    enumName: 'LinkAccess',
  })
  access!: 'open' | 'locked';
  @ApiProperty({ description: 'Still needs the password' })
  needsPassword!: boolean;
  @ApiProperty({ description: 'Still needs the code sent to its address' })
  needsCode!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The address, partly hidden: “a•••@example.com”',
  })
  emailHint!: string | null;
  @ApiProperty({ description: 'The viewer sent it' }) own!: boolean;
  @ApiProperty({ type: [LinkVideoDto] }) videos!: LinkVideoDto[];
  @ApiProperty({ format: 'int64', description: 'All the files together' })
  totalBytes!: number;
  @ApiProperty({
    format: 'int64',
    description: 'The ZIP of them all: a little more than the files',
  })
  zipBytes!: number;
  @ApiProperty({
    description:
      'The sender has no traffic left this month: the videos neither play nor download',
  })
  senderTrafficReached!: boolean;
}

export class UnlockLinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ description: 'The six digits from the email' })
  @IsOptional()
  @Matches(/^\s*\d{6}\s*$/)
  code?: string;
}

export class SaveLinkDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Only these; all of them when left out',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LINK_MAX_VIDEOS)
  @IsUUID('all', { each: true })
  videoIds?: string[];
}

export class SaveLinkResultDto {
  @ApiProperty({ description: 'Put on the shelf now' }) added!: number;
  @ApiProperty({
    type: [String],
    description: 'Every video of the request that is on the shelf now',
  })
  onShelf!: string[];
}

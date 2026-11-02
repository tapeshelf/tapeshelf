import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  SupportMessageKind,
  SupportPriority,
  SupportStatus,
  SupportTopic,
  VideoStatus,
} from '../../generated/prisma/enums.js';
import { AdminUserRefDto } from '../admin/admin.dto.js';

/** Limits of a ticket; the database checks the lengths too. */
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 5000;
export const SUPPORT_FILES_MAX = 5;
export const SUPPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** Tickets waiting for support or for their author at once. */
export const SUPPORT_OPEN_MAX = 5;
/** The browser's description of itself, as JSON text. */
export const SUPPORT_CONTEXT_MAX = 4000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/**
 * Multipart fields arrive as text: "true" / "false". Read from the request as sent: the implicit
 * conversion before it had already made "false" true.
 */
const bool = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const value = obj[key];
  return value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : value;
};

const FILES = {
  type: 'array',
  items: { type: 'string', format: 'binary' },
  maxItems: SUPPORT_FILES_MAX,
  description: `Pictures: PNG, JPG or WebP, up to ${SUPPORT_FILES_MAX} of 10 MB each`,
} as const;

export class SupportAttachmentDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'Presigned, valid for an hour: reload the ticket for fresh links',
  })
  url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

/** The author's own video the ticket is about. */
export class SupportVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status!: VideoStatus;
  @ApiProperty({ description: 'In the trash' }) deleted!: boolean;
}

export class SupportMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SupportMessageKind, enumName: 'SupportMessageKind' })
  kind!: SupportMessageKind;
  @ApiProperty() body!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [SupportAttachmentDto] })
  attachments!: SupportAttachmentDto[];
  @ApiPropertyOptional({
    type: AdminUserRefDto,
    nullable: true,
    description:
      'Admins only: who wrote it (the author sees answers signed "Support")',
  })
  author?: AdminUserRefDto | null;
}

export class SupportTicketSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: SupportTopic, enumName: 'SupportTopic' })
  topic!: SupportTopic;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: SupportStatus, enumName: 'SupportStatus' })
  status!: SupportStatus;
  @ApiProperty({ description: 'Support wrote since the author last opened it' })
  unread!: boolean;
  @ApiProperty({ format: 'date-time' }) activityAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class SupportTicketListDto {
  @ApiProperty({ type: [SupportTicketSummaryDto] })
  items!: SupportTicketSummaryDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class SupportTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: SupportTopic, enumName: 'SupportTopic' })
  topic!: SupportTopic;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: SupportStatus, enumName: 'SupportStatus' })
  status!: SupportStatus;
  @ApiProperty({
    nullable: true,
    type: Boolean,
    description: 'The author’s rating, once solved',
  })
  helped!: boolean | null;
  @ApiProperty({ type: SupportVideoDto, nullable: true })
  video!: SupportVideoDto | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'What the browser said about itself (bug reports)',
  })
  context!: Record<string, string> | null;
  @ApiProperty({ format: 'date-time' }) activityAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [SupportMessageDto] }) messages!: SupportMessageDto[];
}

export class SupportSummaryDto {
  @ApiProperty({ description: 'Tickets with an answer not yet read' })
  unread!: number;
}

/** A question of the operator site's FAQ, suggested while the subject is typed. */
export class SupportFaqItemDto {
  @ApiProperty() key!: string;
  @ApiProperty() question!: string;
  @ApiProperty({ description: 'Plain text' }) answer!: string;
  @ApiProperty() url!: string;
}

export class SupportListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SupportVideosQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** A new ticket (multipart: the fields and up to five pictures as `files`). */
export class CreateSupportTicketDto {
  @ApiProperty({ enum: SupportTopic, enumName: 'SupportTopic' })
  @IsEnum(SupportTopic)
  topic!: SupportTopic;

  @ApiProperty({ minLength: 1, maxLength: SUPPORT_SUBJECT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUPPORT_SUBJECT_MAX)
  subject!: string;

  @ApiProperty({ minLength: 1, maxLength: SUPPORT_BODY_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SUPPORT_BODY_MAX)
  body!: string;

  @ApiPropertyOptional({ description: 'One of the author’s own videos' })
  @IsOptional()
  @IsUUID()
  videoId?: string;

  @ApiPropertyOptional({
    maxLength: SUPPORT_CONTEXT_MAX,
    description:
      'JSON object of strings: browser, screen, page, version (kept for bug reports)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SUPPORT_CONTEXT_MAX)
  context?: string;

  /** Taken by multer; declared for the API description. */
  @ApiPropertyOptional(FILES)
  @IsOptional()
  files?: unknown[];
}

/** The author writes again (multipart). Words or pictures, or both. */
export class SupportReplyDto {
  @ApiPropertyOptional({ maxLength: SUPPORT_BODY_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SUPPORT_BODY_MAX)
  body?: string;

  /** Taken by multer; declared for the API description. */
  @ApiPropertyOptional(FILES)
  @IsOptional()
  files?: unknown[];
}

export class SupportRatingDto {
  @ApiProperty() @IsBoolean() helped!: boolean;
}

// ------------------------------------------------------------------- admin

export class AdminSupportRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: SupportTopic, enumName: 'SupportTopic' })
  topic!: SupportTopic;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: SupportStatus, enumName: 'SupportStatus' })
  status!: SupportStatus;
  @ApiProperty({ enum: SupportPriority, enumName: 'SupportPriority' })
  priority!: SupportPriority;
  @ApiProperty({ nullable: true, type: Boolean }) helped!: boolean | null;
  @ApiProperty({ type: AdminUserRefDto }) user!: AdminUserRefDto;
  @ApiProperty({
    description: 'Messages of the author and of support, notes not counted',
  })
  messages!: number;
  @ApiProperty({ format: 'date-time' }) statusAt!: string;
  @ApiProperty({ format: 'date-time' }) activityAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminSupportListDto {
  @ApiProperty({ type: [AdminSupportRowDto] }) items!: AdminSupportRowDto[];
  @ApiProperty() total!: number;
}

export class AdminSupportQueryDto {
  @ApiPropertyOptional({
    description: 'Number, subject, username or email',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: SupportStatus, enumName: 'SupportStatus' })
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @ApiPropertyOptional({ enum: SupportTopic, enumName: 'SupportTopic' })
  @IsOptional()
  @IsEnum(SupportTopic)
  topic?: SupportTopic;

  @ApiPropertyOptional({ enum: SupportPriority, enumName: 'SupportPriority' })
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminSupportTicketDto extends SupportTicketDto {
  @ApiProperty({ enum: SupportPriority, enumName: 'SupportPriority' })
  priority!: SupportPriority;
  @ApiProperty({ type: AdminUserRefDto }) user!: AdminUserRefDto;
  @ApiProperty({ nullable: true, type: String }) userEmail!: string | null;
  @ApiProperty({ format: 'date-time' }) statusAt!: string;
}

/** An answer to the author, or a note for admins (multipart). */
export class AdminSupportReplyDto {
  @ApiPropertyOptional({ maxLength: SUPPORT_BODY_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SUPPORT_BODY_MAX)
  body?: string;

  @ApiPropertyOptional({
    description: 'Only for admins: no status change, nobody is told',
  })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  note?: boolean;

  @ApiPropertyOptional({
    description: 'Answer and mark the ticket solved at once',
  })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  resolve?: boolean;

  /** Taken by multer; declared for the API description. */
  @ApiPropertyOptional(FILES)
  @IsOptional()
  files?: unknown[];
}

export class AdminSupportUpdateDto {
  @ApiPropertyOptional({ enum: SupportStatus, enumName: 'SupportStatus' })
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @ApiPropertyOptional({ enum: SupportPriority, enumName: 'SupportPriority' })
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;
}

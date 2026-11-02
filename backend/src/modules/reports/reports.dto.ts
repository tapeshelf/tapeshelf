import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
  ReportReason,
  ReportStatus,
  ReportTarget,
} from '../../generated/prisma/enums.js';

export const REPORT_COMMENT_MAX = 1000;
export const REPORT_NOTE_MAX = 1000;
/** What an admin writes to the author of a removed video. */
export const TAKEDOWN_MESSAGE_MAX = 1000;

/** What the admin did when resolving (dismissing is a separate action). */
export const REPORT_ACTIONS = ['DELETE_VIDEO', 'BAN_USER', 'NONE'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** "Report" on a video (`videoId`) or on a profile (`userId`). */
export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget, enumName: 'ReportTarget' })
  @IsEnum(ReportTarget)
  targetType!: ReportTarget;

  @ApiProperty({ description: 'Video id for VIDEO, user id for USER' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: REPORT_COMMENT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(REPORT_COMMENT_MAX)
  comment?: string;
}

export class ReportCreatedDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'False when an open report of yours on this target already existed',
  })
  created!: boolean;
}

export class ReportUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'BANNED', 'DELETED'] }) status!: string;
}

export class ReportVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ description: 'Marked sensitive' })
  sensitive!: boolean;
  @ApiProperty() visibility!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  deletedAt!: string | null;
}

export class AdminReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ReportTarget, enumName: 'ReportTarget' })
  targetType!: ReportTarget;
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  reason!: ReportReason;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  status!: ReportStatus;
  @ApiProperty({ nullable: true, type: String }) action!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ type: ReportUserDto }) reporter!: ReportUserDto;
  @ApiProperty({
    type: ReportUserDto,
    description: 'The reported account, or the author of the reported video',
  })
  targetUser!: ReportUserDto;
  @ApiProperty({ type: ReportVideoDto, nullable: true })
  video!: ReportVideoDto | null;
  @ApiProperty({
    description: 'Open reports on the same target, this one included',
  })
  openOnTarget!: number;
  @ApiProperty({ nullable: true, type: String }) resolvedBy!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  resolvedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminReportListDto {
  @ApiProperty({ type: [AdminReportDto] }) items!: AdminReportDto[];
  @ApiProperty() total!: number;
}

export class AdminReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, enumName: 'ReportStatus' })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTarget, enumName: 'ReportTarget' })
  @IsOptional()
  @IsEnum(ReportTarget)
  targetType?: ReportTarget;

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

export class ResolveReportDto {
  @ApiProperty({ enum: REPORT_ACTIONS, enumName: 'ReportAction' })
  @IsIn(REPORT_ACTIONS)
  action!: ReportAction;

  @ApiPropertyOptional({
    maxLength: REPORT_NOTE_MAX,
    description: 'Internal note; for BAN_USER also the ban reason',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(REPORT_NOTE_MAX)
  note?: string;

  @ApiPropertyOptional({
    maxLength: TAKEDOWN_MESSAGE_MAX,
    description:
      'DELETE_VIDEO: words to the author, shown with the reported rule',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TAKEDOWN_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({
    description: 'DELETE_VIDEO: put the file on the blocklist (default true)',
  })
  @IsOptional()
  @IsBoolean()
  blockFile?: boolean;
}

export class DismissReportDto {
  @ApiPropertyOptional({ maxLength: REPORT_NOTE_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(REPORT_NOTE_MAX)
  note?: string;
}

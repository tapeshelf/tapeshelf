import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  DeleteReason,
  ReportReason,
  RequestStatus,
  Role,
  Tier,
  TierSource,
  TrashExit,
  UserStatus,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit.service.js';
import {
  InstanceLimitsDto,
  PlanSubscriptionDto,
  TiersDto,
} from '../plans/plans.dto.js';
import { TAKEDOWN_MESSAGE_MAX } from '../reports/reports.dto.js';
import { AdminReportDto } from '../reports/reports.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---------------------------------------------------------------- shared

export class PageQueryDto {
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

export class AdminUserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;
}

// ---------------------------------------------------------------- dashboard

export class QueueStatsDto {
  @ApiProperty() name!: string;
  @ApiProperty() waiting!: number;
  @ApiProperty() active!: number;
  @ApiProperty() delayed!: number;
  @ApiProperty() failed!: number;
}

/** The browser extension's funnel, counted on the server alone: the last 7 days. */
export class ExtensionFunnelDto {
  @ApiProperty({ description: 'Extensions connected in the last 7 days' })
  connections!: number;
  @ApiProperty({
    description:
      'Accounts made in the last 7 days that connected the extension within a day of signing up',
  })
  signups!: number;
  @ApiProperty({
    description:
      'Videos saved to shelves through the extension in the last 7 days',
  })
  shelfSaves!: number;
  @ApiProperty({ description: 'People with the extension connected now' })
  connected!: number;
}

export class DashboardDto {
  @ApiProperty() usersTotal!: number;
  @ApiProperty() usersActive!: number;
  @ApiProperty() usersBanned!: number;
  @ApiProperty() usersDeleted!: number;
  @ApiProperty({ description: 'Registered in the last 7 days' })
  usersNew!: number;
  @ApiProperty({ description: 'Videos on the site (not deleted)' })
  videosTotal!: number;
  @ApiProperty() videosReady!: number;
  @ApiProperty() videosProcessing!: number;
  @ApiProperty() videosFailed!: number;
  @ApiProperty({ description: 'Sum of original files of videos on the site' })
  originalsBytes!: number;
  @ApiProperty() trashCount!: number;
  @ApiProperty({
    description:
      'Trash size: measured S3 bytes where known, the original size otherwise',
  })
  trashBytes!: number;
  @ApiProperty() openReports!: number;
  @ApiProperty() openRequests!: number;
  @ApiProperty({ description: 'Support tickets waiting for support' })
  openSupport!: number;
  @ApiProperty({ description: 'Outbox events not delivered yet' })
  outboxPending!: number;
  @ApiProperty({ type: [QueueStatsDto] }) queues!: QueueStatsDto[];
  @ApiProperty({ type: ExtensionFunnelDto }) extension!: ExtensionFunnelDto;
}

// ---------------------------------------------------------------- users

export const USER_SORTS = [
  'created',
  'lastLogin',
  'storage',
  'username',
] as const;
export type UserSort = (typeof USER_SORTS)[number];

export class AdminUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Email, username or display name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: Tier, enumName: 'Tier' })
  @IsOptional()
  @IsEnum(Tier)
  tier?: Tier;

  @ApiPropertyOptional({ enum: USER_SORTS, enumName: 'AdminUserSort' })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: UserSort;
}

export class AdminUserRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
  @ApiProperty({ enum: Tier, enumName: 'Tier' }) tier!: Tier;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;
  @ApiProperty({ description: 'They hid their page' })
  pageHidden!: boolean;
  @ApiProperty() storageUsedBytes!: number;
  @ApiProperty({ description: 'Authored videos on the site' })
  videoCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt!: string | null;
}

export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserRowDto] }) items!: AdminUserRowDto[];
  @ApiProperty() total!: number;
}

export class AdminSessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastUsedAt!: string;
}

export class AdminUserCountsDto {
  @ApiProperty() videos!: number;
  @ApiProperty({ description: 'Videos received from others (and bookmarks)' })
  received!: number;
  @ApiProperty() followers!: number;
  @ApiProperty() following!: number;
  @ApiProperty() openRequests!: number;
  @ApiProperty() reportsAgainst!: number;
  @ApiProperty() reportsFiled!: number;
}

export class AdminVideoRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: AdminUserRefDto }) author!: AdminUserRefDto;
  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status!: VideoStatus;
  @ApiProperty({ enum: Visibility, enumName: 'Visibility' })
  visibility!: Visibility;
  @ApiProperty({ description: 'Marked sensitive' })
  sensitive!: boolean;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) failReason!: string | null;
  @ApiProperty({ description: 'People holding it besides the author' })
  holders!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  deletedAt!: string | null;
  @ApiProperty({ nullable: true, enum: DeleteReason, enumName: 'DeleteReason' })
  deleteReason!: DeleteReason | null;
  @ApiProperty({ type: AdminUserRefDto, nullable: true })
  deletedBy!: AdminUserRefDto | null;
  @ApiProperty({
    nullable: true,
    enum: TrashExit,
    enumName: 'TrashExit',
    description:
      'Why it left its author’s trash for good; null while live or still restorable by the author',
  })
  trashExit!: TrashExit | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  trashExitAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'Still in its author’s trash: when it leaves it (trash list only)',
  })
  restorableUntil!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Measured S3 bytes (trash only)',
  })
  storedBytes!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  purgedAt!: string | null;
  @ApiProperty({
    nullable: true,
    enum: ReportReason,
    enumName: 'ReportReason',
    description: 'Rule given to the author when an admin removed it',
  })
  takedownRule!: ReportReason | null;
  @ApiProperty({ nullable: true, type: String }) takedownNote!: string | null;
  @ApiProperty({ description: 'Its file may not be uploaded again' })
  blocked!: boolean;
  @ApiProperty({
    description: 'The author hid it from their page, "only for me"',
  })
  hiddenByAuthor!: boolean;
}

/** An admin removal: the rule broken, words to the author, no re-upload. */
export class AdminDeleteVideoDto {
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  @IsEnum(ReportReason)
  rule!: ReportReason;

  @ApiPropertyOptional({
    maxLength: TAKEDOWN_MESSAGE_MAX,
    description: 'Shown to the author with the rule',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(TAKEDOWN_MESSAGE_MAX)
  message?: string;

  @ApiPropertyOptional({
    description: 'Put the file on the blocklist: it cannot be uploaded again',
  })
  @IsOptional()
  @IsBoolean()
  blockFile?: boolean;
}

export class AdminUserDetailDto extends AdminUserRowDto {
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  bannedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) banReason!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  deletedAt!: string | null;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty({ description: 'Two-step sign-in is on' })
  twoFactor!: boolean;
  @ApiProperty({ type: [String] }) providers!: string[];
  @ApiProperty({ description: 'Storage quota of the tier' })
  quotaBytes!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'End of PREMIUM; null = no end',
  })
  tierUntil!: string | null;
  @ApiProperty({ nullable: true, enum: TierSource, enumName: 'TierSource' })
  tierSource!: TierSource | null;
  @ApiProperty({
    type: PlanSubscriptionDto,
    nullable: true,
    description: 'The current Pro subscription (cloud only)',
  })
  subscription!: PlanSubscriptionDto | null;
  @ApiProperty({ type: AdminUserCountsDto }) counts!: AdminUserCountsDto;
  @ApiProperty({ type: [AdminSessionDto] }) sessions!: AdminSessionDto[];
  @ApiProperty({
    type: [AdminReportDto],
    description: 'Latest reports about the account',
  })
  reports!: AdminReportDto[];
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: Tier, enumName: 'Tier' })
  @IsOptional()
  @IsEnum(Tier)
  tier?: Tier;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'End of PREMIUM (in the future); null = no end. Ignored for BASIC; omitted = unchanged',
  })
  @IsOptional()
  @IsDateString()
  tierUntil?: string | null;
}

export class BanUserDto {
  /** As long as a report's note, which becomes the reason when a report bans (REPORT_NOTE_MAX). */
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class AdminDeleteUserDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class NoticeDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class ViewAsDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
}

// ---------------------------------------------------------------- videos

export const VIDEO_SCOPES = ['live', 'trash', 'purged', 'all'] as const;
export type VideoScope = (typeof VIDEO_SCOPES)[number];
export const VIDEO_SORTS = ['created', 'size', 'title'] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

export class AdminVideosQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Title fragment or exact video id' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  q?: string;

  @ApiPropertyOptional({ description: 'Author username' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  author?: string;

  @ApiPropertyOptional({ enum: VideoStatus, enumName: 'VideoStatus' })
  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;

  @ApiPropertyOptional({ enum: Visibility, enumName: 'Visibility' })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    enum: VIDEO_SCOPES,
    enumName: 'AdminVideoScope',
    default: 'live',
  })
  @IsOptional()
  @IsIn(VIDEO_SCOPES)
  scope?: VideoScope;

  @ApiPropertyOptional({ enum: VIDEO_SORTS, enumName: 'AdminVideoSort' })
  @IsOptional()
  @IsIn(VIDEO_SORTS)
  sort?: VideoSort;
}

export class AdminVideoListDto {
  @ApiProperty({ type: [AdminVideoRowDto] }) items!: AdminVideoRowDto[];
  @ApiProperty() total!: number;
}

export class AdminFrameDto {
  @ApiProperty() index!: number;
  @ApiProperty() timestampSec!: number;
  @ApiProperty() url!: string;
}

export class SourceMetadataEntryDto {
  @ApiProperty({
    description:
      'Where it was: `format` (the file), `stream:<index>:<type>`, `chapter:<index>`',
  })
  scope!: string;
  @ApiProperty() key!: string;
  @ApiProperty() value!: string;
}

export class RemovedStreamDto {
  @ApiProperty() index!: number;
  @ApiProperty({ description: 'data, attachment, cover…' }) type!: string;
  @ApiProperty() codec!: string;
}

/** What the uploaded file said about itself before it was cleaned of it. */
export class SourceMetadataDto {
  @ApiProperty({ type: [SourceMetadataEntryDto] })
  entries!: SourceMetadataEntryDto[];
  @ApiProperty({ type: [RemovedStreamDto] })
  removedStreams!: RemovedStreamDto[];
}

export class AdminVideoDetailDto extends AdminVideoRowDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() originalFilename!: string;
  @ApiProperty({ nullable: true, type: String }) mimeType!: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'ffprobe summary',
  })
  probe!: Record<string, unknown> | null;
  @ApiProperty({
    nullable: true,
    type: SourceMetadataDto,
    description:
      "The uploaded file's own metadata, kept before it was cleaned of it; null — uploaded before the cleaning",
  })
  sourceMetadata!: SourceMetadataDto | null;
  @ApiProperty({ nullable: true, type: String }) failDetail!: string | null;
  @ApiProperty() processingAttempts!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  processedAt!: string | null;
  @ApiProperty() keyVersion!: number;
  @ApiProperty({ nullable: true, type: Number }) segmentCount!: number | null;
  @ApiProperty({ nullable: true, type: String }) contactSheetUrl!:
    string | null;
  @ApiProperty({ type: [AdminFrameDto] }) frames!: AdminFrameDto[];
  @ApiProperty() openRequests!: number;
  @ApiProperty() openReports!: number;
}

export class UpdateAdminVideoDto {
  @ApiPropertyOptional({ enum: Visibility, enumName: 'Visibility' })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    description: 'Set or clear the sensitive mark',
  })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;
}

// ---------------------------------------------------------------- trash

export const ADMIN_TRASH_STATES = ['out', 'user'] as const;
export type AdminTrashState = (typeof ADMIN_TRASH_STATES)[number];

export class AdminTrashQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_TRASH_STATES,
    enumName: 'AdminTrashState',
    description:
      'out: left its author’s trash for good, waiting for the admin; user: still in its author’s trash',
  })
  @IsOptional()
  @IsIn(ADMIN_TRASH_STATES)
  state?: AdminTrashState;

  @ApiPropertyOptional({ enum: TrashExit, enumName: 'TrashExit' })
  @IsOptional()
  @IsEnum(TrashExit)
  exit?: TrashExit;

  @ApiPropertyOptional({ description: 'Title fragment or author username' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  q?: string;
}

export class AdminTrashListDto {
  @ApiProperty({ type: [AdminVideoRowDto] }) items!: AdminVideoRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty({
    description: 'Size of the whole trash (see DashboardDto.trashBytes)',
  })
  totalBytes!: number;
  @ApiProperty({
    description:
      'Videos out of their authors’ trash, waiting for the admin (whole trash)',
  })
  waiting!: number;
  @ApiProperty({
    description: 'Videos still in their authors’ trash (whole trash)',
  })
  inUserTrash!: number;
}

export class VideoIdsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  videoIds!: string[];
}

export class TrashResultDto {
  @ApiProperty({ description: 'Videos actually processed' }) done!: number;
  @ApiProperty({ description: 'Bytes erased from S3 (purge only)' })
  bytes!: number;
  @ApiProperty({
    type: [String],
    description:
      'Ids skipped (not in the trash, purged, or the author is gone)',
  })
  skipped!: string[];
}

/** The same removal for several videos: each author gets the rule and the message. */
export class AdminDeleteVideosDto extends AdminDeleteVideoDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  videoIds!: string[];
}

export class AdminBulkResultDto {
  @ApiProperty({ description: 'Videos done' }) done!: number;
  @ApiProperty({
    type: [String],
    description: 'Ids skipped (could not be done for that video)',
  })
  skipped!: string[];
}

// ---------------------------------------------------------------- requests

export class AdminRequestsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus, enumName: 'RequestStatus' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ description: 'Username of either side' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  q?: string;
}

// ---------------------------------------------------------------- settings

/** Every admin-editable site setting; applied without a restart. */
export class SiteSettingsDto {
  @ApiProperty({ minimum: 0, maximum: 3650 })
  @IsInt()
  @Min(0)
  @Max(3650)
  usernameChangeDays!: number;

  @ApiProperty({ minimum: 0, maximum: 3650 })
  @IsInt()
  @Min(0)
  @Max(3650)
  requestCooldownDays!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  requestHintMinShows!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 60,
    description: 'Days Pro is kept after a failed renewal (cloud); 0 = none',
  })
  @IsInt()
  @Min(0)
  @Max(60)
  paymentGraceDays!: number;

  @ApiProperty({ description: 'Whether new accounts can be made' })
  @IsOptional()
  @IsBoolean()
  registrationOpen!: boolean;

  @ApiProperty({ type: TiersDto, description: 'Limits per tier (cloud only)' })
  @ValidateNested()
  @Type(() => TiersDto)
  tiers!: TiersDto;

  @ApiProperty({
    type: InstanceLimitsDto,
    description: 'The one set of limits of a self-hosted instance',
  })
  @ValidateNested()
  @Type(() => InstanceLimitsDto)
  limits!: InstanceLimitsDto;
}

// ---------------------------------------------------------------- audit

export class AdminAuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_ACTIONS, enumName: 'AuditAction' })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @ApiPropertyOptional({ description: 'Actor username' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  actor?: string;

  @ApiPropertyOptional({ enum: AUDIT_TARGETS, enumName: 'AuditTarget' })
  @IsOptional()
  @IsIn(AUDIT_TARGETS)
  targetType?: (typeof AUDIT_TARGETS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;
}

export class AuditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AUDIT_ACTIONS, enumName: 'AuditAction' })
  action!: string;
  @ApiProperty({ type: AdminUserRefDto, nullable: true })
  actor!: AdminUserRefDto | null;
  @ApiProperty({ enum: AUDIT_TARGETS, enumName: 'AuditTarget' })
  targetType!: string;
  @ApiProperty({ nullable: true, type: String }) targetId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  meta!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AuditListDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty() total!: number;
}

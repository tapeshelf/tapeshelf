import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { trimText } from '../../common/validation/text.js';
import { UploadStatus, Visibility } from '../../generated/prisma/enums.js';

export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 2000;

/**
 * The second track of a video that comes as separate video and audio (a DASH stream saved by the
 * browser extension): uploaded beside the first, muxed by the worker without re-encoding.
 */
export class AudioTrackDto {
  @ApiProperty({ maxLength: 255, example: 'audio.m4a' })
  @IsString()
  @Length(1, 255)
  filename!: string;

  @ApiProperty({ description: 'File size in bytes', format: 'int64' })
  @IsInt()
  @Min(1)
  size!: number;

  @ApiPropertyOptional({ maxLength: 100, example: 'audio/mp4' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;
}

export class CreateUploadDto {
  @ApiProperty({ maxLength: 255, example: 'holiday.mp4' })
  @IsString()
  @Length(1, 255)
  filename!: string;

  @ApiProperty({
    description: 'File size in bytes',
    format: 'int64',
    example: 734003200,
  })
  @IsInt()
  @Min(1)
  size!: number;

  @ApiPropertyOptional({ maxLength: 100, example: 'video/mp4' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @ApiPropertyOptional({
    type: AudioTrackDto,
    description:
      'Audio as a second file, muxed with the video by the worker',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AudioTrackDto)
  audio?: AudioTrackDto;

  @ApiPropertyOptional({
    description:
      'The sizes are the most the files can be: a stream whose length is known only at its end (browser extension). Reserved as given; the finished files may be smaller.',
  })
  @IsOptional()
  @IsBoolean()
  sizeIsMax?: boolean;
}

export type UploadTrack = 'video' | 'audio';

export class UploadPartsDto {
  @ApiProperty({
    type: [Number],
    description: 'Part numbers to presign (1-based)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10_000, { each: true })
  partNumbers!: number[];

  @ApiPropertyOptional({
    enum: ['video', 'audio'],
    description: 'Which file of a two-track upload; video by default',
  })
  @IsOptional()
  @IsIn(['video', 'audio'])
  track?: UploadTrack;
}

export class CompletedPartDto {
  @ApiProperty() @IsInt() @Min(1) partNumber!: number;
  @ApiProperty({
    description: 'ETag returned by S3 for the part (quotes optional)',
  })
  @IsString()
  @Length(1, 100)
  etag!: string;
}

export class VideoMetaDto {
  @ApiProperty({ maxLength: TITLE_MAX })
  @Transform(trimText)
  @IsString()
  @Length(1, TITLE_MAX)
  title!: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ enum: Visibility, enumName: 'Visibility' })
  @IsEnum(Visibility)
  visibility!: Visibility;

  @ApiPropertyOptional({
    description: 'Mark as sensitive; off by default',
  })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;

  @ApiPropertyOptional({
    description: 'One of the uploader’s categories',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class CompleteUploadDto extends VideoMetaDto {
  @ApiProperty({ type: [CompletedPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts!: CompletedPartDto[];

  @ApiPropertyOptional({
    type: [CompletedPartDto],
    description: 'Parts of the audio file of a two-track upload',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  audioParts?: CompletedPartDto[];

  @ApiPropertyOptional({
    maxLength: 2048,
    description:
      'The page the video was saved from (browser extension): shown to the author alone',
  })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  sourceUrl?: string;
}

export class UploadedPartDto {
  @ApiProperty() partNumber!: number;
  @ApiProperty() etag!: string;
  @ApiProperty() size!: number;
}

export class UploadAudioDto {
  @ApiProperty() filename!: string;
  @ApiProperty({ format: 'int64' }) size!: number;
  @ApiProperty() partCount!: number;
  @ApiProperty({ type: [UploadedPartDto] }) uploadedParts!: UploadedPartDto[];
}

export class UploadSessionDto {
  @ApiProperty() id!: string;
  @ApiProperty() filename!: string;
  @ApiProperty({ format: 'int64' }) size!: number;
  @ApiProperty() partSize!: number;
  @ApiProperty() partCount!: number;
  @ApiProperty({ enum: UploadStatus, enumName: 'UploadStatus' })
  status!: UploadStatus;
  @ApiProperty({
    type: [UploadedPartDto],
    description: 'Parts already stored in S3',
  })
  uploadedParts!: UploadedPartDto[];
  @ApiProperty({ nullable: true, type: String }) videoId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiPropertyOptional({
    type: UploadAudioDto,
    description: 'The audio file of a two-track upload',
  })
  audio?: UploadAudioDto;
}

export class PresignedPartDto {
  @ApiProperty() partNumber!: number;
  @ApiProperty() url!: string;
}

export class PresignedPartsDto {
  @ApiProperty({ type: [PresignedPartDto] }) parts!: PresignedPartDto[];
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class StorageQuotaDto {
  @ApiProperty({ format: 'int64', description: 'Bytes of finished originals' })
  usedBytes!: number;
  @ApiProperty({
    format: 'int64',
    description: 'Bytes reserved by uploads in progress',
  })
  reservedBytes!: number;
  @ApiProperty({ format: 'int64', description: '0 = no limit' })
  quotaBytes!: number;
  @ApiProperty({ format: 'int64', description: '0 = no limit' })
  maxFileBytes!: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ProcessingStage,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';
import { DESCRIPTION_MAX, TITLE_MAX } from '../uploads/uploads.dto.js';

export class VideoDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'Short link code: the video opens at /<code>',
  })
  code!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: Visibility, enumName: 'Visibility' })
  visibility!: Visibility;
  @ApiProperty({
    description: 'Marked sensitive by the author',
  })
  sensitive!: boolean;
  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status!: VideoStatus;
  @ApiProperty({
    enum: ProcessingStage,
    enumName: 'ProcessingStage',
    nullable: true,
  })
  stage!: ProcessingStage | null;
  @ApiProperty({ description: 'Processing progress 0–100' }) progress!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Failure code when status = FAILED',
  })
  failReason!: string | null;
  @ApiProperty() originalFilename!: string;
  @ApiProperty({ format: 'int64' }) sizeBytes!: number;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactSheetUrl!:
    string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The picture a tile shows: the small copy when there is one, as the listings give it',
  })
  tileThumbnailUrl!: string | null;
  @ApiProperty({
    type: [String],
    description:
      'The 16 frames for a tile’s preview, small copies when there are',
  })
  tileFrameUrls!: string[];
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Frame used as thumbnail; null for a custom time',
  })
  thumbnailFrameIndex!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  processedAt!: string | null;
}

export class VideoFrameDto {
  @ApiProperty() index!: number;
  @ApiProperty() timestampSec!: number;
  @ApiProperty() url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class VideoDetailDto extends VideoDto {
  @ApiProperty({ type: [VideoFrameDto] }) frames!: VideoFrameDto[];
}

export class VideoListDto {
  @ApiProperty({ type: [VideoDto] }) items!: VideoDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

export class ListMineQueryDto {
  @ApiPropertyOptional({
    description: 'Id of the last item of the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateVideoDto {
  @ApiPropertyOptional({ maxLength: TITLE_MAX })
  @IsOptional()
  @IsString()
  @Length(1, TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ enum: Visibility, enumName: 'Visibility' })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ description: 'Mark as sensitive' })
  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;
}

export class SetThumbnailDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 15,
    description: 'Use one of the extracted frames (instant)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  frameIndex?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Extract a new frame at this second (background job)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timestampSec?: number;
}

/** My holding of a video: hidden (received videos only) and/or category. */
export class UpdateHoldingDto {
  @ApiPropertyOptional({
    description:
      'Hide the video from visitors of your page (your own copy stays)',
  })
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'One of your categories, or null to clear',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: TITLE_MAX,
    description:
      'Your own name for someone else’s video on your shelf; empty or null goes back to the author’s',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX)
  title?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: DESCRIPTION_MAX,
    description:
      'Your own description for it; empty or null goes back to the author’s',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX)
  description?: string | null;
}

/** Bookmarking from a page: the code it was opened by, for the anonymous link it may carry. */
export class AddToCollectionDto {
  @ApiPropertyOptional({
    description:
      'The /<code> the video page was opened by: through an anonymous link, the copy keeps its owner masked',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

export class VideoContextDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'Short link code: the video opens at /<code>',
  })
  code!: string;
  @ApiProperty({
    description:
      'Page whose context the video should be opened in (the viewer\u2019s own if they hold it, else the author\u2019s); for a code seen through an anonymous link, `~<code>` of that link unless the viewer holds the video through it',
  })
  username!: string;
}

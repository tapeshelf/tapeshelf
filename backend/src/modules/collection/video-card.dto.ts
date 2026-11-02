import { ApiProperty } from '@nestjs/swagger';

import {
  ProcessingStage,
  VideoStatus,
  Visibility,
} from '../../generated/prisma/enums.js';

// A file of its own, importing no other DTO: exchange.dto and collection.dto both need these
// classes and import each other, and decorator metadata reads a property's class at load time.

export class VideoAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'A username, or `~<code>` for someone known here by their anonymous link: their page is /p/<code>, and `~` alone when the link no longer opens. Never shown as @name then',
  })
  username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({
    description: 'Uploaded by a guest in an exchange: "Guest", no page',
  })
  guest!: boolean;
}

/** What a tile or a page header needs; no stream information ever appears here. */
export class VideoCardDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'Short link code: the video opens at /<code>',
  })
  code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: Visibility, enumName: 'Visibility' })
  visibility!: Visibility;
  @ApiProperty({ enum: VideoStatus, enumName: 'VideoStatus' })
  status!: VideoStatus;
  @ApiProperty({
    enum: ProcessingStage,
    enumName: 'ProcessingStage',
    nullable: true,
  })
  stage!: ProcessingStage | null;
  @ApiProperty() progress!: number;
  @ApiProperty({ nullable: true, type: String }) failReason!: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ format: 'int64' }) sizeBytes!: number;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactSheetUrl!:
    string | null;
  @ApiProperty({
    type: [String],
    description:
      'The 16 extracted frames for hover scrubbing (empty until processed)',
  })
  frameUrls!: string[];
  @ApiProperty({
    description: 'Marked sensitive by the author',
  })
  sensitive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: VideoAuthorDto }) author!: VideoAuthorDto;
}

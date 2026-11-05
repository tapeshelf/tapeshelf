import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Most videos asked about at once: a category or a stack saved whole. */
export const OFFLINE_QUOTE_MAX = 500;
/** Most copies one phone checks at once. */
export const OFFLINE_CHECK_MAX = 2000;

export class OfflineQuoteRequestDto {
  @ApiProperty({ type: [String], maxItems: OFFLINE_QUOTE_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(OFFLINE_QUOTE_MAX)
  @IsUUID('all', { each: true })
  videoIds!: string[];
}

export class OfflineQuoteVideoDto {
  @ApiProperty() videoId!: string;
  @ApiProperty({
    description: 'The person may save it: it plays for them now',
  })
  allowed!: boolean;
  @ApiProperty({ description: 'What the copy weighs, in bytes' })
  bytes!: number;
  @ApiProperty({
    description:
      'Saving it now takes its size off the month’s traffic: not one’s own, not watched or saved lately',
  })
  spends!: boolean;
}

export class OfflineTrafficDto {
  @ApiProperty() usedBytes!: number;
  @ApiProperty({ description: '0 = no limit' }) limitBytes!: number;
  @ApiProperty({ format: 'date-time' }) resetAt!: string;
}

/** What saving these videos to the phone would take, for the sheet that asks first. */
export class OfflineQuoteDto {
  @ApiProperty({ type: [OfflineQuoteVideoDto] })
  videos!: OfflineQuoteVideoDto[];
  @ApiProperty({ type: OfflineTrafficDto })
  traffic!: OfflineTrafficDto;
}

/** Everything a phone needs to keep a video: the playlist, its segments' links and the key. */
export class OfflineCopyDto {
  @ApiProperty() videoId!: string;
  @ApiProperty({
    description:
      'The version of the video the copy holds; an edit makes a new one',
  })
  keyVersion!: number;
  @ApiProperty({
    description: 'The AES-128 key of the segments, base64; keep it as a secret',
  })
  key!: string;
  @ApiProperty({
    description:
      'The media playlist: the key addressed as "key", each segment by a signed link to the storage',
  })
  playlist!: string;
  @ApiProperty({ description: 'What the copy weighs, in bytes' })
  bytes!: number;
  @ApiProperty({
    format: 'date-time',
    description:
      'When the segment links stop working; ask again then, which within a week costs nothing',
  })
  expiresAt!: string;
}

export class OfflineHeldDto {
  @ApiProperty() @IsUUID() videoId!: string;
  @ApiProperty() @IsInt() @Min(0) keyVersion!: number;
}

export class OfflineCheckRequestDto {
  @ApiProperty({ type: [OfflineHeldDto], maxItems: OFFLINE_CHECK_MAX })
  @IsArray()
  @ArrayMaxSize(OFFLINE_CHECK_MAX)
  @ValidateNested({ each: true })
  @Type(() => OfflineHeldDto)
  copies!: OfflineHeldDto[];
}

export const OFFLINE_STATES = ['keep', 'remove', 'update'] as const;
export type OfflineState = (typeof OFFLINE_STATES)[number];

export class OfflineVerdictDto {
  @ApiProperty() videoId!: string;
  @ApiProperty({
    enum: OFFLINE_STATES,
    enumName: 'OfflineState',
    description:
      'keep; remove: the person may no longer watch it; update: an edit replaced it, save it again (free within a week)',
  })
  state!: OfflineState;
}

export class OfflineCheckDto {
  @ApiProperty({ type: [OfflineVerdictDto] })
  copies!: OfflineVerdictDto[];
}

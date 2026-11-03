import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  CAPTION_MAX,
  MAX_CUTS,
  MAX_ITEMS,
  ROTATIONS,
  type Rotation,
} from './edit-spec.js';

/**
 * The editor's edit as the API takes it. The shape is checked here; what the
 * numbers mean against the video (times inside it, areas big enough) is `normalizeEdit`.
 */

export class RectDto {
  @ApiProperty({ description: 'Left edge, fraction of the frame (0–1)' })
  @IsNumber()
  x!: number;
  @ApiProperty() @IsNumber() y!: number;
  @ApiProperty() @IsNumber() w!: number;
  @ApiProperty() @IsNumber() h!: number;
}

export class TimeRangeDto {
  @ApiProperty({ description: 'Seconds of the original' })
  @IsNumber()
  start!: number;
  @ApiProperty() @IsNumber() end!: number;
}

export class BlurDto extends TimeRangeDto {
  @ApiProperty({ type: RectDto, description: 'Fractions of the turned frame' })
  @ValidateNested()
  @Type(() => RectDto)
  rect!: RectDto;
  @ApiProperty({ enum: ['blur', 'box'], enumName: 'BlurMode' })
  @IsIn(['blur', 'box'])
  mode!: 'blur' | 'box';
}

export class TimerDto extends TimeRangeDto {
  @ApiProperty({ description: 'Plate corner, fraction of the output frame' })
  @IsNumber()
  x!: number;
  @ApiProperty() @IsNumber() y!: number;
  @ApiProperty({ description: 'Digit height, fraction of the output height' })
  @IsNumber()
  size!: number;
}

export class CaptionDto extends TimerDto {
  @ApiProperty({ maxLength: CAPTION_MAX })
  @IsString()
  @MaxLength(CAPTION_MAX * 2)
  text!: string;
}

export class EditSpecDto {
  @ApiProperty({ enum: ROTATIONS, description: 'Clockwise degrees' })
  @IsIn(ROTATIONS as unknown as number[])
  rotate!: Rotation;
  @ApiProperty() @IsBoolean() flipH!: boolean;
  @ApiProperty() @IsBoolean() flipV!: boolean;

  @ApiPropertyOptional({ type: RectDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => RectDto)
  crop!: RectDto | null;

  @ApiProperty({ type: TimeRangeDto })
  @ValidateNested()
  @Type(() => TimeRangeDto)
  trim!: TimeRangeDto;

  @ApiProperty({ type: [TimeRangeDto] })
  @IsArray()
  @ArrayMaxSize(MAX_CUTS)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  cuts!: TimeRangeDto[];

  @ApiProperty({ type: [BlurDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BlurDto)
  blurs!: BlurDto[];

  @ApiProperty({ type: [TimerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TimerDto)
  timers!: TimerDto[];

  @ApiProperty({ type: [CaptionDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CaptionDto)
  captions!: CaptionDto[];

  @ApiProperty({ description: '1 = as recorded, 0 = no sound, up to 2' })
  @IsNumber()
  volume!: number;

  @ApiProperty({ description: 'Even loudness (EBU R128)' })
  @IsBoolean()
  normalize!: boolean;
}

export class SaveEditDto {
  @ApiProperty({ type: EditSpecDto })
  @ValidateNested()
  @Type(() => EditSpecDto)
  spec!: EditSpecDto;

  @ApiProperty({
    enum: ['replace', 'copy'],
    enumName: 'EditSaveMode',
    description:
      'replace: the same video, the original kept; copy: a new video of the author',
  })
  @IsIn(['replace', 'copy'])
  mode!: 'replace' | 'copy';
}

export class EditSourceDto {
  @ApiProperty() durationSec!: number;
  @ApiProperty({
    description: 'Display size of the video as it is now (for its shape)',
  })
  width!: number;
  @ApiProperty() height!: number;
  @ApiProperty() hasAudio!: boolean;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Frames per second, when the probe says it (the step of one frame)',
  })
  fps!: number | null;
}

export class EditJobDto {
  @ApiProperty({ enum: ['replace', 'copy'], enumName: 'EditMode' })
  mode!: 'replace' | 'copy';
  @ApiProperty({
    enum: ['queued', 'rendering', 'failed'],
    enumName: 'EditJobStatus',
  })
  status!: 'queued' | 'rendering' | 'failed';
  @ApiProperty({ description: '0–100' }) progress!: number;
  @ApiProperty({
    nullable: true,
    enum: ['render', 'internal'],
    enumName: 'EditError',
  })
  error!: 'render' | 'internal' | null;
  @ApiProperty({
    type: () => EditSpecDto,
    nullable: true,
    description:
      'What was saved: shown while it renders, and after a failure the editor starts from it again',
  })
  spec!: EditSpecDto | null;
}

export class EditStateDto {
  @ApiProperty() videoId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({
    type: EditSourceDto,
    description:
      'The video as it is now: every edit starts from it (an earlier edit is part of it)',
  })
  source!: EditSourceDto;
  @ApiProperty({
    type: [String],
    description:
      'Frames along the video, in order, for the timeline; empty until it has them',
  })
  frameUrls!: string[];
  @ApiProperty({ type: EditJobDto, nullable: true }) job!: EditJobDto | null;
  @ApiProperty({ description: 'A copy is possible (own videos only)' })
  canCopy!: boolean;
  @ApiProperty({
    description: 'An admin editing someone else’s video: the author is told',
  })
  foreign!: boolean;
}

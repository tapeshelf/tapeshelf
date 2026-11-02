import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { VideoCardDto } from '../collection/video-card.dto.js';

export const WHATS_NEW_PAGE = 30;

export class WhatsNewQueryDto {
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: WHATS_NEW_PAGE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** A new video of someone the viewer follows. */
export class WhatsNewItemDto {
  @ApiProperty({ type: VideoCardDto }) video!: VideoCardDto;
  @ApiProperty({
    format: 'date-time',
    description: 'When the video first became ready: its place in the list',
  })
  at!: string;
  @ApiProperty({
    description:
      'Appeared after the viewer last opened “What’s new” and after they followed its author',
  })
  isNew!: boolean;
}

export class WhatsNewListDto {
  @ApiProperty({ type: [WhatsNewItemDto] }) items!: WhatsNewItemDto[];
  @ApiProperty({ description: 'More items after this page' }) hasMore!: boolean;
  @ApiProperty() offset!: number;
}

export class WhatsNewStateDto {
  @ApiProperty({
    description: 'Something new since “What’s new” was last opened',
  })
  hasNew!: boolean;
}

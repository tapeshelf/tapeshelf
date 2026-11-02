import { ApiProperty } from '@nestjs/swagger';

import { VideoCardDto } from '../collection/video-card.dto.js';

/** A video the owner deleted that can still come back. */
export class TrashItemDto {
  @ApiProperty({ type: VideoCardDto }) video!: VideoCardDto;
  @ApiProperty({ format: 'date-time' }) deletedAt!: string;
  @ApiProperty({
    format: 'date-time',
    description:
      'When it leaves the trash and can no longer be restored (the plan’s trash days)',
  })
  purgeAt!: string;
}

export class TrashListDto {
  @ApiProperty({ type: [TrashItemDto] }) items!: TrashItemDto[];
  @ApiProperty({ description: 'Days a deleted video stays here on this plan' })
  retentionDays!: number;
}

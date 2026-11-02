import { ApiProperty } from '@nestjs/swagger';

export class PlaybackDto {
  @ApiProperty({
    description: 'Absolute URL of the master playlist, token included',
  })
  playlistUrl!: string;
  @ApiProperty({
    format: 'date-time',
    description: 'When the token stops working; request a new playback then',
  })
  expiresAt!: string;
}

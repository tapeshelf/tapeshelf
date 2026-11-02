import { ApiProperty } from '@nestjs/swagger';

/** What the wait page needs: the video, the limits and where the user stands. */
export class DownloadInfoDto {
  @ApiProperty() videoId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'Size of the original' }) sizeBytes!: number;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({ description: 'Marked sensitive (the page blurs the cover)' })
  sensitive!: boolean;

  @ApiProperty({
    description:
      'Straight from storage, no waiting (Pro, admins); false = the wait page and a throttled stream',
  })
  direct!: boolean;
  @ApiProperty({ description: 'Downloads per month; 0 = no limit' })
  limit!: number;
  @ApiProperty({ description: 'Counted downloads this month' }) used!: number;
  @ApiProperty({
    format: 'date-time',
    description: 'Start of the next month (UTC)',
  })
  resetAt!: string;
  @ApiProperty({ description: 'Speed through the API; 0 = full speed' })
  speedBytesPerSec!: number;
  @ApiProperty({ description: 'Downloads at once; 0 = no limit' })
  concurrency!: number;
  @ApiProperty({
    description:
      'Downloaded within the last hour: this one does not count (a retry)',
  })
  repeat!: boolean;
  @ApiProperty({
    description: 'The viewer uploaded it: it never counts',
  })
  own!: boolean;
  @ApiProperty({
    description: 'Another download is running and that is the most allowed',
  })
  busy!: boolean;
  @ApiProperty({
    description: 'Over the monthly limit (a repeat is still allowed)',
  })
  limitReached!: boolean;
  @ApiProperty({ description: 'Seconds to count down before starting' })
  waitSec!: number;
}

export class DownloadTicketDto {
  @ApiProperty({
    description:
      'Where the browser fetches the file: a one-time API link (2 minutes) or, for direct downloads, storage',
  })
  url!: string;
  @ApiProperty() direct!: boolean;
}

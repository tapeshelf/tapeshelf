import { ApiProperty } from '@nestjs/swagger';

export class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down'] })
  db!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'] })
  redis!: 'up' | 'down';
}

export class OpsReportDto {
  @ApiProperty({ enum: ['ok', 'alert'] }) status!: 'ok' | 'alert';
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Seconds since the last worker heartbeat',
  })
  workerSeenSecAgo!: number | null;
  @ApiProperty() outboxPending!: number;
  @ApiProperty({ nullable: true, type: Number }) outboxOldestSec!:
    number | null;
  @ApiProperty({
    description: 'Events given up after every retry in the last day',
  })
  outboxParked24h!: number;
  @ApiProperty({
    description:
      'Videos "processing" with no change for an hour: stuck past the watchdog',
  })
  videosStuck!: number;
  @ApiProperty({
    description:
      'Videos whose processing failed in the last day (not an alert)',
  })
  videosFailed24h!: number;
}

export class HealthReportDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ type: HealthChecksDto })
  checks!: HealthChecksDto;

  @ApiProperty()
  uptimeSec!: number;

  @ApiProperty({
    description:
      'Commit the API was built from (12 characters), "dev" outside an image',
  })
  version!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

import {
  SubscriptionStatus,
  Tier,
  TierSource,
} from '../../generated/prisma/enums.js';

const MiB = 1024 ** 2;
const TiB = 1024 ** 4;

/** Limits of one tier: read by everyone, edited by admins. */
export class TierLimitsDto {
  @ApiProperty({
    minimum: 0,
    maximum: TiB,
    description: 'Set per tier from 1 MiB; 0 = no limit (a self-hosted plan)',
  })
  @IsInt()
  @Min(MiB)
  @Max(TiB)
  maxFileBytes!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100 * TiB,
    description: 'Set per tier from 1 MiB; 0 = no limit (a self-hosted plan)',
  })
  @IsInt()
  @Min(MiB)
  @Max(100 * TiB)
  storageQuotaBytes!: number;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  requestsPerDay!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100000,
    description: 'Downloads per calendar month (UTC); 0 = no limit',
  })
  @IsInt()
  @Min(0)
  @Max(100000)
  downloadsPerMonth!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 10 * 1024 * MiB,
    description:
      'Download speed through the API; 0 = straight from storage at full speed',
  })
  @IsInt()
  @Min(0)
  @Max(10 * 1024 * MiB)
  downloadSpeedBytesPerSec!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description: 'Downloads at once; 0 = no limit',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  downloadConcurrency!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 1024 * TiB,
    description:
      'Views and downloads per calendar month (UTC), by the size of each file; 0 = no limit',
  })
  @IsInt()
  @Min(0)
  @Max(1024 * TiB)
  trafficBytesPerMonth!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 3650,
    description:
      'Days a video the author deleted stays restorable before its files are erased',
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  trashRetentionDays!: number;

  @ApiProperty({
    minimum: 0.1,
    maximum: 100,
    description: 'Rate limits of signed-in users are multiplied by this',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(100)
  apiRateMultiplier!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 10_000,
    description:
      'Videos a day (UTC) through the browser extension; 0 = no limit',
  })
  @IsInt()
  @Min(0)
  @Max(10_000)
  extensionPerDay!: number;
}

/** Limits of a self-hosted instance: one set for everyone; 0 = no limit on file or shelf. */
export class InstanceLimitsDto {
  @ApiProperty({ minimum: 0, maximum: TiB, description: '0 = no limit' })
  @IsInt()
  @Min(0)
  @Max(TiB)
  maxFileBytes!: number;

  @ApiProperty({ minimum: 0, maximum: 100 * TiB, description: '0 = no limit' })
  @IsInt()
  @Min(0)
  @Max(100 * TiB)
  storageQuotaBytes!: number;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  requestsPerDay!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 3650,
    description:
      'Days a video the author deleted stays restorable before its files are erased',
  })
  @IsInt()
  @Min(1)
  @Max(3650)
  trashRetentionDays!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 10_000,
    description:
      'Videos a day (UTC) through the browser extension; 0 = no limit',
  })
  @IsInt()
  @Min(0)
  @Max(10_000)
  extensionPerDay!: number;
}

export class TiersDto {
  @ApiProperty({ type: TierLimitsDto })
  @ValidateNested()
  @Type(() => TierLimitsDto)
  BASIC!: TierLimitsDto;

  @ApiProperty({ type: TierLimitsDto })
  @ValidateNested()
  @Type(() => TierLimitsDto)
  PREMIUM!: TierLimitsDto;
}

export const EDITIONS = ['community', 'cloud'] as const;
export type Edition = (typeof EDITIONS)[number];

/** Public: the tiers of this instance and their limits; the only source of numbers for texts. */
export class PlansDto {
  @ApiProperty({ enum: EDITIONS, enumName: 'Edition' }) edition!: Edition;
  @ApiProperty({ type: TiersDto }) tiers!: TiersDto;
}

export class PlanUsageDto {
  @ApiProperty({ description: 'Authored originals on the shelf' })
  storageBytes!: number;

  @ApiProperty({ description: 'Downloads counted this calendar month (UTC)' })
  downloadsThisMonth!: number;

  @ApiProperty({
    format: 'date-time',
    description: 'When the monthly download count starts over',
  })
  downloadsResetAt!: string;

  @ApiProperty({
    format: 'int64',
    description:
      'Views and downloads counted this calendar month (UTC); starts over with the downloads',
  })
  trafficBytesThisMonth!: number;
}

/** The user's Pro subscription (cloud): what the plan tab says about it. */
export class PlanSubscriptionDto {
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  status!: SubscriptionStatus;
  @ApiProperty({ enum: ['month', 'year'] }) interval!: string;
  @ApiProperty({
    description: "Paddle's id of this customer, for Paddle Retain",
  })
  customerId!: string;
  @ApiProperty({
    description: 'Renews by itself (no cancel or pause scheduled)',
  })
  renews!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'End of the current billing period: the next renewal',
  })
  periodEndsAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'A cancelled subscription ends then',
  })
  endsAt!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'A failed renewal: Pro is kept until then unless payment goes through',
  })
  graceUntil!: string | null;
}

/** The signed-in user's plan: effective tier, its end and limits, current usage. */
export class PlanDto {
  @ApiProperty({
    enum: Tier,
    enumName: 'Tier',
    description: 'Effective tier: an expired PREMIUM is already BASIC',
  })
  tier!: Tier;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'End of PREMIUM; null = no end',
  })
  until!: string | null;

  @ApiProperty({
    nullable: true,
    enum: TierSource,
    enumName: 'TierSource',
  })
  source!: TierSource | null;

  @ApiProperty({ type: TierLimitsDto }) limits!: TierLimitsDto;
  @ApiProperty({ type: PlanUsageDto }) usage!: PlanUsageDto;
  @ApiProperty({
    type: PlanSubscriptionDto,
    nullable: true,
    description: 'The current Pro subscription (cloud only)',
  })
  subscription!: PlanSubscriptionDto | null;
}

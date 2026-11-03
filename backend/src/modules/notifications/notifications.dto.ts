import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { NotificationType } from '../../generated/prisma/enums.js';

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Type-specific data: videoId/title for video events, reason for failures, authorName for removals',
  })
  payload!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  readAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
  @ApiProperty() unreadCount!: number;
}

export class UnreadCountDto {
  @ApiProperty() count!: number;
}

export class NotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Id of the last item of the previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty() @IsBoolean() inApp!: boolean;
  @ApiProperty() @IsBoolean() email!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceDto] })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  items!: NotificationPreferenceDto[];
}

export class UnsubscribeInfoDto {
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;
  @ApiProperty({ description: 'This kind of email is on now' })
  email!: boolean;
}

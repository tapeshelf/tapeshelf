import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { NotificationType } from '../../generated/prisma/enums.js';

export const PLATFORMS = ['android', 'ios'] as const;

export class RegisterDeviceDto {
  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform!: (typeof PLATFORMS)[number];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Where push signals go (a Firebase Cloud Messaging registration token); null or absent when the phone gets none (the server has no push, notifications are not allowed)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string | null;
}

export class DeviceKeyDto {
  @ApiProperty({
    description:
      'Reads this phone’s pushes (header X-Tapeshelf-Device) without the session; a new one at each registration',
  })
  key!: string;
}

export class DeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PLATFORMS }) platform!: string;
  @ApiProperty({ description: 'Push signals reach it' }) push!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The app, its version and the phone (X-Tapeshelf-Client)',
  })
  client!: string | null;
  @ApiProperty({ description: 'The session this request comes from' })
  current!: boolean;
  @ApiProperty() createdAt!: string;
}

export class PushMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'As in the bell (NotificationDto.payload)',
  })
  payload!: Record<string, unknown>;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The bell item of the same news, when the bell has it',
  })
  notificationId!: string | null;
  @ApiProperty() createdAt!: string;
}

export class PushesQueryDto {
  @ApiPropertyOptional({
    description: 'Only pushes after this one (the last the phone has seen)',
  })
  @IsOptional()
  @IsUUID(7)
  after?: string;
}

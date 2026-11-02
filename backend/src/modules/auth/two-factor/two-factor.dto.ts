import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

import { PASSWORD_MAX } from '../../../common/validation/password.js';

export class PasskeyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastUsedAt!: string | null;
}

export class TwoFactorDto {
  @ApiProperty({
    description: 'Signing in with the password asks for the second step',
  })
  enabled!: boolean;
  @ApiProperty({ description: 'The account has a password to protect' })
  available!: boolean;
  @ApiProperty({ description: 'An admin: the admin panel needs it' })
  required!: boolean;
  @ApiProperty({ description: 'This session has passed the second step' })
  sessionConfirmed!: boolean;
  @ApiProperty({ description: 'An authenticator app is set up' })
  app!: boolean;
  @ApiProperty({ type: PasskeyDto, isArray: true }) passkeys!: PasskeyDto[];
  @ApiProperty() recoveryCodesLeft!: number;
}

export class TwoFactorPasswordDto {
  @ApiPropertyOptional({
    description: 'The current password: needed while two-step sign-in is off',
  })
  @IsOptional()
  @IsString()
  @Length(1, PASSWORD_MAX)
  password?: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({
    description: "The app's six digits, or a recovery code (XXXXX-XXXXX)",
  })
  @IsString()
  @Length(1, 32)
  code!: string;
}

export class AppSetupDto {
  @ApiProperty({ description: 'The secret in base32, to type in by hand' })
  secret!: string;
  @ApiProperty({ description: 'otpauth:// address the QR code holds' })
  uri!: string;
  @ApiProperty({ description: 'The QR code as a data: URL (SVG)' })
  qr!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({
    type: String,
    isArray: true,
    nullable: true,
    description:
      'New recovery codes, shown once: when the step was just turned on or the codes made anew',
  })
  recoveryCodes!: string[] | null;
}

export class WebAuthnOptionsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: "Options for the browser's navigator.credentials (JSON form)",
  })
  options!: object;
}

export class PasskeyAddDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: "The browser's answer to the creation options (JSON form)",
  })
  @IsObject()
  response!: Record<string, unknown>;
}

export class PasskeyProofDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: "The browser's answer to the request options (JSON form)",
  })
  @IsObject()
  response!: Record<string, unknown>;
}

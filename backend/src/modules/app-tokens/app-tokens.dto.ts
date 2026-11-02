import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MaxLength } from 'class-validator';

import { trimText } from '../../common/validation/text.js';
import { NAME_MAX } from './app-token-rules.js';

/** "Connect" in the sign-in window: the user, signed in, allows the extension. */
export class ConnectAppDto {
  @ApiProperty({
    description: 'chrome.identity.getRedirectURL() of the extension',
  })
  @IsString()
  @MaxLength(200)
  redirectUri!: string;

  @ApiProperty({ description: 'PKCE S256 challenge, base64url' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  codeChallenge!: string;

  @ApiProperty({ description: 'Echoed back with the code' })
  @IsString()
  @Length(8, 200)
  state!: string;

  @ApiProperty({ maxLength: NAME_MAX, example: 'Chrome on Windows' })
  @Transform(trimText)
  @IsString()
  @Length(1, NAME_MAX)
  name!: string;
}

export class ConnectAppResultDto {
  @ApiProperty({
    description:
      'Where the sign-in window goes next: the redirect with code and state',
  })
  redirectTo!: string;
}

export class ExchangeCodeDto {
  @ApiProperty() @IsString() @Length(20, 100) code!: string;
  @ApiProperty() @IsString() @Length(43, 128) codeVerifier!: string;
  @ApiProperty() @IsString() @MaxLength(200) redirectUri!: string;
}

export class AppTokenUserDto {
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) avatarUrl!:
    string | null;
}

export class AppTokenIssuedDto {
  @ApiProperty({ description: 'Shown once; send as Authorization: Bearer' })
  token!: string;
  @ApiProperty({ type: AppTokenUserDto }) user!: AppTokenUserDto;
}

export class AppTokenDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastUsedAt!: string | null;
}

export class ExtensionCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class ExtensionLimitsDto {
  @ApiProperty({ format: 'int64', description: '0 = no limit' })
  maxFileBytes!: number;
  @ApiProperty({
    format: 'int64',
    description: 'Bytes still free on the shelf; -1 = no limit',
  })
  freeBytes!: number;
  @ApiProperty({
    description: 'Videos a day through the extension; 0 = no limit',
  })
  perDay!: number;
  @ApiProperty({
    description: 'Videos saved through the extension today (UTC)',
  })
  usedToday!: number;
  @ApiProperty({
    format: 'date-time',
    description: 'When the day’s count starts again',
  })
  resetsAt!: string;
}

/** What the extension's form needs, in one call. */
export class ExtensionContextDto {
  @ApiProperty({ type: AppTokenUserDto }) user!: AppTokenUserDto;
  @ApiProperty({
    description:
      'No daily limit through the extension (Pro, or none set self-hosted)',
  })
  unlimited!: boolean;
  @ApiProperty({ description: 'Uploading needs a confirmed email address' })
  emailVerified!: boolean;
  @ApiProperty({ type: ExtensionLimitsDto }) limits!: ExtensionLimitsDto;
  @ApiProperty({ type: [ExtensionCategoryDto] })
  categories!: ExtensionCategoryDto[];
}

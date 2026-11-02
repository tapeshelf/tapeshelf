import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_PATTERN,
} from '../../common/validation/password.js';
import { trimText } from '../../common/validation/text.js';
import { Locale, Role, Theme, Tier } from '../../generated/prisma/enums.js';
import { PlanDto } from '../plans/plans.dto.js';
import { DISPLAY_NAME_MAX, PageSettingsDto } from '../users/users.dto.js';

const USERNAME_INPUT = /^[A-Za-z0-9_]{3,30}$/;

export class RegisterDto {
  @ApiProperty({ example: 'ann@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'ann_v',
    description: 'Lowercased on save; 3–30 letters, digits, underscores',
  })
  @IsString()
  @Matches(USERNAME_INPUT)
  username!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN,
    maxLength: PASSWORD_MAX,
    description: 'At least one letter and one digit',
  })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  @Matches(PASSWORD_PATTERN)
  password!: string;

  @ApiPropertyOptional({ maxLength: DISPLAY_NAME_MAX })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(1, DISPLAY_NAME_MAX)
  displayName?: string;

  @ApiPropertyOptional({
    description:
      'The guest already agreed to see sensitive content in this browser: start the account with it on',
  })
  @IsOptional()
  @IsBoolean()
  showSensitive?: boolean;

  @ApiPropertyOptional({
    description:
      'Cloudflare Turnstile token; required for a repeated sign-up from the same IP (captchaRequired)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, PASSWORD_MAX)
  password!: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @Length(10, 200)
  token!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  @Matches(PASSWORD_PATTERN)
  password!: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description: 'Required when the account already has a password',
  })
  @IsOptional()
  @IsString()
  @Length(1, PASSWORD_MAX)
  currentPassword?: string;

  @ApiProperty({ minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  @Matches(PASSWORD_PATTERN)
  newPassword!: string;
}

export class GoogleCompleteDto {
  @ApiProperty({ example: 'ann_v' })
  @IsString()
  @Matches(USERNAME_INPUT)
  username!: string;

  @ApiPropertyOptional({ maxLength: DISPLAY_NAME_MAX })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Length(1, DISPLAY_NAME_MAX)
  displayName?: string;

  @ApiPropertyOptional({ description: 'As in RegisterDto' })
  @IsOptional()
  @IsBoolean()
  showSensitive?: boolean;

  @ApiPropertyOptional({
    description:
      'Cloudflare Turnstile token; required for a repeated sign-up from the same IP (captchaRequired)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) coverUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) bio!: string | null;
  @ApiProperty({ nullable: true, type: String }) accentColor!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Pattern of the generated cover; null derives it from the id',
  })
  coverPattern!: number | null;
  @ApiProperty({ type: PageSettingsDto }) pageSettings!: PageSettingsDto;
  @ApiProperty({
    description:
      'The page is hidden: 404 for everyone but the owner and admins',
  })
  pageHidden!: boolean;
  @ApiProperty({
    description: 'May hide the page now: Pro or admin; everyone self-hosted',
  })
  canHidePage!: boolean;
  @ApiProperty({
    description:
      'May protect a temporary link with a password: Pro or admin; everyone self-hosted',
  })
  canProtectLinks!: boolean;
  @ApiProperty({
    description:
      'May make anonymous links to the shelf, and they open: Pro or admin; everyone self-hosted',
  })
  canMakeAnonymousLinks!: boolean;
  @ApiProperty({ enum: Locale, enumName: 'Locale' }) locale!: Locale;
  @ApiProperty({ enum: Theme, enumName: 'Theme' }) theme!: Theme;
  @ApiProperty({
    description: 'Show videos marked sensitive without asking',
  })
  showSensitive!: boolean;
  @ApiProperty({ enum: Role, enumName: 'Role' }) role!: Role;
  @ApiProperty({
    enum: Tier,
    enumName: 'Tier',
    description: 'Effective tier (the same as plan.tier)',
  })
  tier!: Tier;
  @ApiProperty({ type: PlanDto }) plan!: PlanDto;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty() hasGoogle!: boolean;
  @ApiProperty({
    description:
      'Two-step sign-in is on; an admin needs it for the admin panel',
  })
  twoFactor!: boolean;
  @ApiProperty({ nullable: true, type: String }) exchangeWants!: string | null;
  @ApiProperty({ nullable: true, type: String }) exchangeAvoid!: string | null;
  @ApiProperty() showExchangePrefs!: boolean;
  @ApiProperty() acceptGuestExchanges!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  usernameChangedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class SessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastUsedAt!: string;
  @ApiProperty() current!: boolean;
}

export class OkDto {
  @ApiProperty({ example: true }) ok!: true;
}

export class GoogleStatusDto {
  @ApiProperty() enabled!: boolean;
}

/** GET /api/auth/session: who is signed in in this browser, for the site's static pages. */
export class SessionHintDto {
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
}

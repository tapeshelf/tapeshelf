import { ApiProperty } from '@nestjs/swagger';

import { EDITIONS, type Edition, TiersDto } from '../plans/plans.dto.js';
import { SUPPORTED_LOCALES } from '../../common/i18n/i18n.js';

export const LEGAL_DOCS = ['terms', 'privacy', 'imprint'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export class LegalAvailabilityDto {
  @ApiProperty() terms!: boolean;
  @ApiProperty() privacy!: boolean;
  @ApiProperty() imprint!: boolean;
}

/** What the web app needs to know about this instance before anything else (public, cacheable). */
/** The demo's shared account; everything is erased daily. */
export class DemoAccountDto {
  @ApiProperty() email!: string;
  @ApiProperty() password!: string;
}

export class MinClientDto {
  @ApiProperty({ nullable: true, type: String, example: '1.0.0' })
  android!: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  ios!: string | null;
}

export class ApiInfoDto {
  @ApiProperty({
    description:
      'Grows by one whenever the API gains something an app may rely on; an app that needs more than the server has says so',
    example: 1,
  })
  level!: number;

  @ApiProperty({
    type: MinClientDto,
    description:
      'The oldest app the server still talks to, per platform (null: no limit). An older app gets 426 `clientTooOld` on every request',
  })
  minClient!: MinClientDto;
}

export class SiteInfoDto {
  @ApiProperty({
    description: 'Instance name (SITE_NAME)',
    example: 'tapeshelf',
  })
  name!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Public contact of the operator',
  })
  contactEmail!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The operator's website (SITE_URL): the app links its rules there; null = LEGAL_DIR's texts",
  })
  siteUrl!: string | null;

  @ApiProperty({
    type: LegalAvailabilityDto,
    description: 'Documents published in LEGAL_DIR',
  })
  legal!: LegalAvailabilityDto;

  @ApiProperty({
    enum: EDITIONS,
    enumName: 'Edition',
    description: 'community = self-hosted; cloud = tapeshelf.com (EDITION)',
  })
  edition!: Edition;

  @ApiProperty({
    type: TiersDto,
    description: 'Tier limits, as GET /api/plans (numbers in texts)',
  })
  plans!: TiersDto;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Cloudflare Turnstile site key for a repeated sign-up from one IP; null = no captcha',
  })
  captchaSiteKey!: string | null;

  @ApiProperty({
    type: DemoAccountDto,
    nullable: true,
    description:
      'The public demo (DEMO_MODE): its account for the banner; null elsewhere',
  })
  demo!: DemoAccountDto | null;

  @ApiProperty({
    description:
      'Whether this instance sends email: without it there is no reset of a forgotten password',
  })
  emailEnabled!: boolean;

  @ApiProperty({ description: 'Whether new accounts can be made' })
  registrationOpen!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Origin of the public bucket (thumbnails, frames, avatars): the app preconnects to it at start',
  })
  mediaOrigin!: string | null;

  /**
   * Always sent. Optional in the contract only, because a server older than this field does not
   * send it, and an app has to read that server's answer to say "too old" rather than "not found".
   */
  @ApiProperty({ type: ApiInfoDto, required: false })
  api?: ApiInfoDto;
}

export class LegalDocDto {
  @ApiProperty({ enum: LEGAL_DOCS, enumName: 'LegalDoc' }) doc!: LegalDoc;
  @ApiProperty({
    enum: SUPPORTED_LOCALES,
    description: 'Language of the returned text (falls back to en)',
  })
  lang!: string;
  @ApiProperty({
    description: 'Markdown: headings, paragraphs, lists, links, bold',
  })
  markdown!: string;
}
